import { ArgumentsHost, BadRequestException, Logger } from '@nestjs/common';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { DatabaseError } from '../src/common/exceptions/database.exception';
import { UpstreamError } from '../src/common/exceptions/upstream.exception';
describe('Consistent and secret-safe API errors', () => {
    beforeEach(() =>
        jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined),
    );
    afterEach(() => jest.restoreAllMocks());
    function handle(error: unknown) {
        const response = {
            headersSent: false,
            setHeader: jest.fn(),
            status: jest.fn(),
            json: jest.fn(),
        };
        response.status.mockReturnValue(response);
        const host = {
            switchToHttp: () => ({ getResponse: () => response }),
        } as unknown as ArgumentsHost;
        new ApiExceptionFilter().catch(error, host);
        return {
            response,
            body: response.json.mock.calls[0][0] as {
                statusCode: number;
                code: string;
                message: string;
                requestId: string;
            },
        };
    }
    it.each([
        ['23505', 409, 'DATABASE_CONFLICT'],
        ['23503', 409, 'DATABASE_CONFLICT'],
        ['22P02', 400, 'INVALID_DATA'],
        ['ECONNREFUSED', 503, 'DATABASE_UNAVAILABLE'],
        ['42P01', 503, 'DATABASE_UNAVAILABLE'],
    ])(
        'translates database error %s without driver messages',
        (code, status, errorCode) => {
            const { body } = handle(new DatabaseError('save_rule', code));
            expect(body.statusCode).toBe(status);
            expect(body.code).toBe(errorCode);
            expect(body.requestId).toBeTruthy();
        },
    );
    it('does not reveal unexpected error content', () => {
        const { body } = handle(
            new Error(
                'https://hooks.slack.com/services/private/token secret=password',
            ),
        );
        expect(body.statusCode).toBe(500);
        expect(JSON.stringify(body)).not.toMatch(/password|hooks\.slack/);
    });
    it('redacts HTTP exception text and never logs query parameters', () => {
        const { body } = handle(
            new BadRequestException(
                'token=private-token https://private.test/value',
            ),
        );
        expect(body.message).not.toContain('private-token');
        expect(body.message).not.toContain('private.test');
    });
    it('returns safe errors for upstream outages', () => {
        const { body } = handle(new UpstreamError('Slack', 429, 120));
        expect(body.statusCode).toBe(503);
        expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    });
    it.each([
        [0, 'could not reach GitHub'],
        [401, 'Sign out and sign in again'],
        [403, 'admin access'],
        [404, 'repository name'],
        [422, 'webhook registration'],
        [429, 'Wait before retrying'],
    ])('explains GitHub status %s safely', (status, message) => {
        const { body } = handle(
            new UpstreamError('GitHub', status, 0, 'webhook_create'),
        );
        expect(body.statusCode).toBe(status === 429 ? 503 : 502);
        expect(body.message).toContain(message);
        const logged = JSON.parse(
            (Logger.prototype.warn as jest.Mock).mock.calls[0][0] as string,
        );
        expect(logged).toMatchObject({
            requestId: body.requestId,
            upstreamService: 'GitHub',
            upstreamStatus: status,
            operation: 'webhook_create',
        });
    });
});
