import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    ValidationPipe,
    BadRequestException,
    PayloadTooLargeException,
} from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { AppConfig } from './config/config.module';

export function frontendDirectory(): string {
    const root = resolve(__dirname, '../../..');
    const workspace = JSON.parse(
        readFileSync(resolve(root, 'angular.json'), 'utf8'),
    ) as {
        projects: {
            frontend: {
                architect: {
                    build: {
                        options: {
                            outputPath: { base: string; browser: string };
                        };
                    };
                };
            };
        };
    };
    const output =
        workspace.projects.frontend.architect.build.options.outputPath;
    return resolve(root, output.base, output.browser);
}
export function configureHttp(
    app: NestExpressApplication,
    config: AppConfig,
    frontend = frontendDirectory(),
): void {
    app.set(
        'trust proxy',
        config.trustProxyHops ?? (config.production ? 1 : 0),
    );
    app.disable('x-powered-by');
    app.use(helmet());
    app.use(cookieParser());
    app.use(
        '/webhooks/github',
        express.raw({ type: 'application/json', limit: '1mb', inflate: false }),
    );
    app.use(
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction,
        ) => {
            if (/^\/(api|auth)(\/|$)/.test(req.path))
                res.set('Cache-Control', 'no-store');
            if (req.path.startsWith('/webhooks/')) {
                next();
                return;
            }
            express.json({ limit: '100kb' })(req, res, (error: unknown) => {
                const type =
                    typeof error === 'object' &&
                    error !== null &&
                    'type' in error
                        ? error.type
                        : undefined;
                if (type === 'entity.parse.failed') {
                    next(
                        new BadRequestException({
                            code: 'INVALID_JSON',
                            message: 'Malformed JSON request body.',
                        }),
                    );
                    return;
                }
                if (type === 'entity.too.large') {
                    next(
                        new PayloadTooLargeException({
                            code: 'BODY_TOO_LARGE',
                            message: 'Request body is too large.',
                        }),
                    );
                    return;
                }
                next(error);
            });
        },
    );
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            validationError: { target: false, value: false },
        }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    if (config.production && !existsSync(resolve(frontend, 'index.html')))
        throw new Error('Angular build missing; run npm run build');
    app.use(express.static(frontend, { index: false, fallthrough: true }));
    // Register fallback before Nest's not-found handler, excluding every server namespace.
    app.use(
        (
            req: express.Request,
            res: express.Response,
            next: express.NextFunction,
        ) => {
            if (
                req.method !== 'GET' ||
                /^\/(api|auth|webhooks|health)(\/|$)/.test(req.path) ||
                !req.accepts('html') ||
                req.path.includes('.')
            ) {
                next();
                return;
            }
            if (existsSync(resolve(frontend, 'index.html')))
                res.sendFile(resolve(frontend, 'index.html'));
            else next();
        },
    );
}
