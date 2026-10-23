import { randomUUID } from 'node:crypto';
import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    Injectable,
    Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DatabaseError } from '../exceptions/database.exception';
import { UpstreamError } from '../exceptions/upstream.exception';
import { ApiErrorResponse } from '../interfaces/api-error.interface';
import { redact } from '../redact';

@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('Requests');

    catch(error: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const requestId = randomUUID();
        const result = this.describe(error);
        this.logger.warn(
            JSON.stringify({
                event: 'request_failed',
                requestId,
                type:
                    error instanceof Error
                        ? error.constructor.name
                        : 'UnknownError',
                status: result.statusCode,
                code: result.code,
                ...(error instanceof UpstreamError
                    ? {
                          upstreamService: error.service,
                          upstreamStatus: error.status,
                          operation: error.operation,
                          retryAfterSeconds: error.retryAfterSeconds,
                      }
                    : {}),
                ...(error instanceof DatabaseError
                    ? { operation: error.operation, databaseCode: error.code }
                    : {}),
            }),
        );
        if (response.headersSent) {
            response.end();
            return;
        }
        response.setHeader('X-Request-ID', requestId);
        response.status(result.statusCode).json({
            ...result,
            requestId,
            timestamp: new Date().toISOString(),
        } satisfies ApiErrorResponse);
    }

    private describe(
        error: unknown,
    ): Pick<ApiErrorResponse, 'statusCode' | 'code' | 'message'> {
        if (error instanceof HttpException) {
            const body = error.getResponse();
            const value =
                typeof body === 'string'
                    ? body
                    : (body as { message?: unknown }).message;
            const message = Array.isArray(value)
                ? value.map((v) => redact(String(v)))
                : redact(typeof value === 'string' ? value : 'Request failed');
            const bodyCode =
                typeof body === 'object' && 'code' in body
                    ? body.code
                    : undefined;
            return {
                statusCode: error.getStatus(),
                code:
                    typeof bodyCode === 'string' &&
                    ['INVALID_JSON', 'BODY_TOO_LARGE'].includes(bodyCode)
                        ? bodyCode
                        : `HTTP_${error.getStatus()}`,
                message,
            };
        }
        if (error instanceof DatabaseError) {
            if (['23505', '23503'].includes(error.code))
                return {
                    statusCode: 409,
                    code: 'DATABASE_CONFLICT',
                    message:
                        'The resource conflicts with existing data. Refresh and retry.',
                };
            if (['22P02', '22003', '23514'].includes(error.code))
                return {
                    statusCode: 400,
                    code: 'INVALID_DATA',
                    message: 'The submitted data is invalid.',
                };
            return {
                statusCode: 503,
                code: 'DATABASE_UNAVAILABLE',
                message:
                    error.code === '42P01'
                        ? 'Database setup is incomplete. An administrator must run the documented migrations.'
                        : 'Database temporarily unavailable. Please retry.',
            };
        }
        if (error instanceof UpstreamError) {
            return {
                statusCode: error.status === 429 ? 503 : 502,
                code: 'UPSTREAM_UNAVAILABLE',
                message: this.upstreamMessage(error),
            };
        }
        const type =
            typeof error === 'object' && error !== null && 'type' in error
                ? error.type
                : undefined;
        if (type === 'entity.parse.failed')
            return {
                statusCode: 400,
                code: 'INVALID_JSON',
                message: 'Malformed JSON request body.',
            };
        if (type === 'entity.too.large')
            return {
                statusCode: 413,
                code: 'BODY_TOO_LARGE',
                message: 'Request body is too large.',
            };
        return {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            message: 'Request failed. Contact support with the request ID.',
        };
    }

    private upstreamMessage(error: UpstreamError): string {
        if (error.service === 'GitHub') {
            if (error.status === 401)
                return 'GitHub authorization was rejected. Sign out and sign in again.';
            if (error.status === 403)
                return 'GitHub denied access or rate limited the request. Check repository admin access and OAuth authorization; retry after any rate limit resets.';
            if (error.status === 404)
                return 'GitHub could not find the repository or webhook, or your authorization cannot access it. Check the repository name and account access.';
            if (error.status === 422 && error.operation === 'webhook_create')
                return 'GitHub rejected webhook registration. Check WEBHOOK_BASE_URL (or APP_URL when unset) and the repository webhook configuration before retrying.';
            if (error.status === 429)
                return 'GitHub rate limited the request. Wait before retrying.';
            if (error.status === 0)
                return 'The server could not reach GitHub or the request timed out. Check server connectivity and retry.';
        }
        return `${error.service} is unavailable or rejected the request. Please retry.`;
    }
}
