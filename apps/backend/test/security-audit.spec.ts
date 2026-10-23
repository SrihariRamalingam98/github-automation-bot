import {
    Controller,
    Get,
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { SessionEntity } from '../src/auth/entities/session.entity';
import { AppConfig } from '../src/config/config.module';
import { decrypt, sign, verify, verifyWebhook } from '../src/common/security';
import { redact } from '../src/common/redact';
import { GithubService } from '../src/github/github.service';
import { UsersService } from '../src/users/users.service';
import { RepositoriesService } from '../src/repositories/repositories.service';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { RulesService } from '../src/rules/rules.service';
import { RuleEntity } from '../src/rules/entities/rule.entity';
import { RuleDto } from '../src/rules/dto/rule.dto';
import { EventFilters } from '../src/events/dto/event-filters.dto';
import { ConnectRepositoryDto } from '../src/repositories/dto/connect-repository.dto';
import { EventsService } from '../src/events/events.service';
import { EventEntity } from '../src/events/entities/event.entity';
import { ActionsService } from '../src/actions/actions.service';
import { databaseOptions } from '../src/database/options';
import { configureHttp } from '../src/http';
import { builder, databaseStub, manager, repository } from './helpers';

jest.mock('dotenv', () => ({ config: jest.fn() }));

const baseConfig = {
    appUrl: 'https://example.test',
    clientId: 'fake-client',
    sessionSecret: 's'.repeat(32),
    encryptionKey: Buffer.alloc(32, 1),
    production: true,
} as AppConfig;

describe('OAuth callback negative cases and token boundaries', () => {
    const exchange = jest.fn();
    const profile = jest.fn();
    const save = jest.fn();
    const create = jest.fn();
    const response = {
        clearCookie: jest.fn(),
        redirect: jest.fn(),
        cookie: jest.fn(),
    };
    const auth = {
        cookieOptions: {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
        },
        create,
    };
    const controller = new AuthController(
        baseConfig,
        auth as unknown as AuthService,
        { exchange, request: profile } as unknown as GithubService,
        { save } as unknown as UsersService,
    );
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-23T00:00:00Z'));
    });
    afterEach(() => jest.useRealTimers());
    const state = () => 'a'.repeat(48) + ':' + (Date.now() + 590000);
    const callback = (
        cookie: unknown,
        queryState: unknown,
        code: unknown = 'fake-code',
    ) =>
        controller.callback(
            {
                cookies: { oauth_state: cookie, session: 'previous-session' },
            } as unknown as Request,
            response as unknown as Response,
            code,
            queryState,
        );
    it.each([
        'missing',
        'tampered',
        'expired',
        'malformed expiry',
        'future expiry',
        'mismatch',
        'array state',
        'empty code',
        'array code',
    ])('rejects %s before provider or persistence calls', async (scenario) => {
        let value = state();
        let cookie: unknown;
        let query: unknown = value;
        let code: unknown = 'fake-code';
        if (scenario === 'expired')
            value = 'a'.repeat(48) + ':' + (Date.now() - 1);
        if (scenario === 'malformed expiry') value = 'a'.repeat(48) + ':NaN';
        if (scenario === 'future expiry')
            value = 'a'.repeat(48) + ':' + (Date.now() + 3600000);
        query = value;
        cookie = sign(value, baseConfig.sessionSecret);
        if (scenario === 'missing') cookie = undefined;
        if (scenario === 'tampered') cookie = String(cookie) + 'x';
        if (scenario === 'mismatch')
            query = 'b'.repeat(48) + ':' + (Date.now() + 590000);
        if (scenario === 'array state') query = [value];
        if (scenario === 'empty code') code = '';
        if (scenario === 'array code') code = ['fake'];
        await expect(callback(cookie, query, code)).rejects.toThrow(
            'OAuth state mismatch',
        );
        expect(exchange).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(response.clearCookie).toHaveBeenCalledWith(
            'oauth_state',
            auth.cookieOptions,
        );
    });
    it('uses a fixed configured callback and cryptographic state with a secure cookie', () => {
        controller.login(response as unknown as Response);
        const target = new URL(response.redirect.mock.calls[0][0] as string);
        expect(target.origin).toBe('https://github.com');
        expect(target.searchParams.get('redirect_uri')).toBe(
            'https://example.test/auth/github/callback',
        );
        expect(target.searchParams.get('state')).toMatch(
            /^[a-f0-9]{48}:\d{13}$/,
        );
        expect(response.cookie.mock.calls[0][2]).toMatchObject({
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            maxAge: 600000,
        });
    });
    it('encrypts the provider token before persistence and never returns it to the browser', async () => {
        exchange.mockResolvedValue('private-provider-token');
        profile.mockResolvedValue({
            id: 1,
            login: 'test',
            avatar_url: 'https://example.test/a',
        });
        const value = state();
        await callback(sign(value, baseConfig.sessionSecret), value);
        const encrypted = save.mock.calls[0][3] as string;
        expect(encrypted).not.toContain('private-provider-token');
        expect(decrypt(encrypted, baseConfig.encryptionKey)).toBe(
            'private-provider-token',
        );
        expect(create).toHaveBeenCalledWith(1, response, 'previous-session');
        expect(response.redirect).toHaveBeenCalledWith('/dashboard');
    });
});

describe('Session rotation and cookie safety', () => {
    afterEach(() => jest.restoreAllMocks());
    it('commits a fresh session and revokes only the previous browser session before setting its cookie', async () => {
        const insert = jest.fn();
        const remove = jest.fn();
        const db = databaseStub(
            manager({ getRepository: () => ({ insert, delete: remove }) }),
        );
        const service = new AuthService(
            repository<SessionEntity>({}),
            db,
            baseConfig,
        );
        const res = { cookie: jest.fn() };
        const previous = 'a'.repeat(64);
        await service.create(
            1,
            res as unknown as Response,
            sign(previous, baseConfig.sessionSecret),
        );
        expect(db.transaction).toHaveBeenCalledWith(
            'create_session',
            expect.any(Function),
        );
        expect(remove).toHaveBeenCalledWith({ id: previous });
        const value = insert.mock.calls[0][0] as SessionEntity;
        expect(value.id).toMatch(/^[a-f0-9]{64}$/);
        expect(value.id).not.toBe(previous);
        expect(value.csrfToken).toMatch(/^[a-f0-9]{64}$/);
        expect(
            verify(
                res.cookie.mock.calls[0][1] as string,
                baseConfig.sessionSecret,
            ),
        ).toBe(value.id);
        expect(res.cookie.mock.calls[0][2]).toMatchObject({
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 86400000,
        });
    });
    it('never sets an authenticated cookie when the session transaction fails', async () => {
        const db = databaseStub();
        (db.transaction as jest.Mock).mockRejectedValue(
            new Error('commit failed'),
        );
        const res = { cookie: jest.fn() };
        await expect(
            new AuthService(
                repository<SessionEntity>({}),
                db,
                baseConfig,
            ).create(1, res as unknown as Response),
        ).rejects.toThrow('commit failed');
        expect(res.cookie).not.toHaveBeenCalled();
    });
    it('revokes the exact authenticated session on logout and clears its cookie', async () => {
        const remove = jest.fn();
        const res = { clearCookie: jest.fn() };
        const service = new AuthService(
            repository<SessionEntity>({ delete: remove }),
            databaseStub(),
            baseConfig,
        );
        await service.logout(
            { sessionId: 'current' } as Parameters<AuthService['logout']>[0],
            res as unknown as Response,
        );
        expect(remove).toHaveBeenCalledWith({ id: 'current' });
        expect(res.clearCookie).toHaveBeenCalledWith(
            'session',
            service.cookieOptions,
        );
    });
});

describe('DTO rejection and cross-user authorization boundaries', () => {
    const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
    });
    it.each(['-1', '1.5', '0', '1e2', '1 OR 1=1', '9'.repeat(40)])(
        'rejects identifier %s before service queries',
        async (id) => {
            await expect(
                pipe.transform(
                    { repoId: id },
                    { type: 'query', metatype: EventFilters },
                ),
            ).rejects.toThrow();
            await expect(
                pipe.transform(
                    { repoId: id, keyword: 'bug', label: 'bug' },
                    { type: 'body', metatype: RuleDto },
                ),
            ).rejects.toThrow();
        },
    );
    it.each([
        'owner/..',
        '../repo',
        './repo',
        'owner/%2e%2e',
        'owner/repo?token=x',
    ])('rejects repository path manipulation %s', async (fullName) => {
        await expect(
            pipe.transform(
                { fullName },
                { type: 'body', metatype: ConnectRepositoryDto },
            ),
        ).rejects.toThrow();
    });
    it('rejects overposting, whitespace-only values and string booleans', async () => {
        for (const value of [
            { keyword: '  ', label: 'bug' },
            { keyword: 'bug', label: 'bug', ownerId: 'other' },
            { keyword: 'bug', label: 'bug', enabled: 'false' },
        ])
            await expect(
                pipe.transform(
                    { repoId: '1', ...value },
                    { type: 'body', metatype: RuleDto },
                ),
            ).rejects.toThrow();
    });
    it('rejects another user repository label lookup without any GitHub call', async () => {
        const findOneBy = jest.fn().mockResolvedValue(null);
        const github = { request: jest.fn() };
        const service = new RepositoriesService(
            repository<RepositoryEntity>({ findOneBy }),
            databaseStub(),
            github as unknown as GithubService,
            baseConfig,
        );
        await expect(
            service.labels(
                { id: 'other' } as Parameters<RepositoriesService['labels']>[0],
                '1',
            ),
        ).rejects.toThrow('Repository not found');
        expect(findOneBy).toHaveBeenCalledWith(
            expect.objectContaining({ id: '1', ownerId: 'other' }),
        );
        expect(github.request).not.toHaveBeenCalled();
    });
    it('refuses deleting or editing an unowned rule even when the destination repository is owned', async () => {
        const query = builder();
        query.getOne.mockResolvedValue(null);
        const remove = jest.fn();
        const save = jest.fn();
        const store = { createQueryBuilder: () => query, delete: remove, save };
        const service = new RulesService(
            repository<RuleEntity>(store),
            databaseStub(manager({ getRepository: () => store })),
            {
                owned: jest.fn().mockResolvedValue({}),
            } as unknown as RepositoriesService,
        );
        await expect(service.remove('2', '1')).rejects.toThrow(
            'Rule not found',
        );
        await expect(
            service.save(
                '2',
                {
                    repoId: '2',
                    keyword: 'bug',
                    label: 'bug',
                    enabled: true,
                    slackEnabled: true,
                    eventType: 'issues.opened',
                },
                '1',
            ),
        ).rejects.toThrow('Rule not found');
        expect(query.where).toHaveBeenCalledWith(
            'rule.id=:id AND repo.ownerId=:userId',
            { id: '1', userId: '2' },
        );
        expect(remove).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });
    it('scopes history to the authenticated owner even with another user repository filter', async () => {
        const query = builder();
        query.getMany.mockResolvedValue([]);
        const service = new EventsService(
            repository<EventEntity>({ createQueryBuilder: () => query }),
            repository<RepositoryEntity>({}),
            databaseStub(),
            {} as ActionsService,
        );
        expect(await service.list('2', { repoId: '1' })).toEqual([]);
        expect(query.where).toHaveBeenCalledWith('repo.ownerId=:userId', {
            userId: '2',
        });
        expect(query.andWhere).toHaveBeenCalledWith('event.repoId=:repoId', {
            repoId: '1',
        });
    });
});

describe('Production environment fail-closed configuration', () => {
    const env = {
        NODE_ENV: 'production',
        APP_URL: 'https://example.test',
        DATABASE_URL: 'postgresql://test:test@localhost/test?sslmode=disable',
        DATABASE_SSL: 'false',
        GITHUB_CLIENT_ID: 'fake',
        GITHUB_CLIENT_SECRET: 'fake',
        SESSION_SECRET: 's'.repeat(32),
        ENCRYPTION_KEY: '01'.repeat(32),
    };
    afterEach(() => jest.restoreAllMocks());
    it('forces verified PostgreSQL TLS and defaults to one proxy hop in production', () => {
        jest.replaceProperty(process, 'env', env);
        const config = new AppConfig();
        expect(config.databaseSsl).toBe(true);
        expect(config.trustProxyHops).toBe(1);
        expect(databaseOptions(config)).toMatchObject({
            ssl: { rejectUnauthorized: true },
        });
    });
    it('takes the Render-assigned port from PORT', () => {
        jest.replaceProperty(process, 'env', { ...env, PORT: '10000' });
        expect(new AppConfig().port).toBe(10000);
    });
    it.each([
        'http://example.test',
        'https://user:private@example.test',
        'https://example.test/path',
        'https://example.test?token=private',
        'https://example.test/#fragment',
        'not a URL',
    ])('rejects unsafe APP_URL %s without echoing its contents', (value) => {
        jest.replaceProperty(process, 'env', { ...env, APP_URL: value });
        expect(() => new AppConfig()).toThrow(/APP_URL/);
        try {
            new AppConfig();
        } catch (error) {
            expect((error as Error).message).not.toContain('private');
        }
    });
    it.each([
        'https://evil.test/services/T/B/S',
        'https://hooks.slack.com.evil.test/services/T/B/S',
        'https://user:private@hooks.slack.com/services/T/B/S',
        'http://hooks.slack.com/services/T/B/S',
        'https://hooks.slack.com/services/T/B/S?token=private',
    ])('rejects unsafe Slack configuration without revealing it', (value) => {
        jest.replaceProperty(process, 'env', {
            ...env,
            SLACK_WEBHOOK_URL: value,
        });
        expect(() => new AppConfig()).toThrow(
            'SLACK_WEBHOOK_URL must be an HTTPS Slack incoming webhook',
        );
    });
    it.each(['true', '-1', '6', '1.5'])(
        'rejects unsafe proxy hop setting %s',
        (value) => {
            jest.replaceProperty(process, 'env', {
                ...env,
                TRUST_PROXY_HOPS: value,
            });
            expect(() => new AppConfig()).toThrow('TRUST_PROXY_HOPS');
        },
    );
    it('redacts JSON secrets, cookies and PostgreSQL URLs', () => {
        const result = redact(
            '"access_token":"private-value" Cookie: session=private-cookie postgresql://user:private-db@host/db',
        );
        expect(result).not.toMatch(/private-value|private-cookie|private-db/);
        expect(
            verifyWebhook(Buffer.from('{}'), 'sha256=' + '0'.repeat(64), ''),
        ).toBe(false);
    });
});

@Controller('api/audit-rate-limit')
class RateProbeController {
    @Get() read() {
        return { ok: true };
    }
}

describe('Rate limiting HTTP behavior and proxy boundaries', () => {
    let app: INestApplication;
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 2 }])],
            controllers: [RateProbeController],
            providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
        }).compile();
        app = module.createNestApplication<NestExpressApplication>({
            bodyParser: false,
        });
        configureHttp(
            app as NestExpressApplication,
            { production: false, trustProxyHops: 0 } as AppConfig,
        );
        await app.init();
    });
    afterAll(async () => {
        await app.close();
    });
    it('returns safe 429 and Retry-After; spoofed forwarding headers cannot bypass direct-mode limits', async () => {
        await request(app.getHttpServer())
            .get('/api/audit-rate-limit')
            .set('X-Forwarded-For', '203.0.113.1')
            .expect(200);
        await request(app.getHttpServer())
            .get('/api/audit-rate-limit')
            .set('X-Forwarded-For', '203.0.113.2')
            .expect(200);
        const response = await request(app.getHttpServer())
            .get('/api/audit-rate-limit')
            .set('X-Forwarded-For', '203.0.113.3')
            .expect(429);
        expect(response.body).toMatchObject({
            statusCode: 429,
            code: 'HTTP_429',
        });
        expect(response.body.requestId).toBeTruthy();
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    });
});
