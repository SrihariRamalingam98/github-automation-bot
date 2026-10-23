import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { sign } from '../src/common/security';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { AppConfig } from '../src/config/config.module';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { EventEntity } from '../src/events/entities/event.entity';
import { configureHttp } from '../src/http';
import { entities } from '../src/database/entities';
import { builder, databaseStub, manager } from './helpers';
describe('Full Nest application DI and HTTP integration (mock persistence and upstreams)', () => {
    let app: INestApplication;
    const frontend = mkdtempSync(join(tmpdir(), 'bot-http-test-'));
    const deliveries = new Set<string>();
    const previousWorker = process.env.WORKER_ENABLED;
    beforeAll(async () => {
        process.env.WORKER_ENABLED = 'false';
        writeFileSync(
            join(frontend, 'index.html'),
            '<!doctype html><html><body>Angular test shell</body></html>',
        );
        const stores = new Map();
        for (const entity of entities)
            stores.set(entity, {
                createQueryBuilder: () => builder(),
                find: jest.fn().mockResolvedValue([]),
                insert: jest.fn().mockResolvedValue({}),
                upsert: jest.fn().mockResolvedValue({}),
                findOneBy: jest.fn().mockResolvedValue(null),
            });
        stores.set(RepositoryEntity, {
            createQueryBuilder: () => {
                const query = builder();
                query.getOne.mockResolvedValue({
                    id: '1',
                    githubRepoId: '42',
                    webhookSecret: 'test',
                });
                return query;
            },
        });
        stores.set(EventEntity, {
            createQueryBuilder: () => {
                const query = builder();
                let delivery = '';
                query.values.mockImplementation((value) => {
                    delivery = value.deliveryId;
                    return query;
                });
                query.execute.mockImplementation(async () => {
                    const duplicate = deliveries.has(delivery);
                    deliveries.add(delivery);
                    return {
                        raw: duplicate ? [] : [{ id: '1' }],
                        identifiers: duplicate ? [undefined] : [{ id: '1' }],
                    };
                });
                return query;
            },
        });
        const fakeSource = {
            options: { type: 'postgres' },
            entityMetadatas: entities.map((target) => ({ target })),
            isInitialized: false,
            getRepository: (target: unknown) => stores.get(target),
            destroy: jest.fn(),
        };
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(getDataSourceToken())
            .useValue(fakeSource as unknown as DataSource)
            .overrideProvider(DatabaseService)
            .useValue(
                databaseStub(
                    manager({
                        getRepository: (target: unknown) => stores.get(target),
                    }),
                ),
            )
            .overrideProvider(AppConfig)
            .useValue({
                appUrl: 'https://example.test',
                databaseUrl: 'postgresql://test:test@localhost/test',
                databaseSsl: false,
                sessionSecret: 'test'.repeat(10),
                encryptionKey: Buffer.alloc(32, 1),
                production: false,
            })
            .compile();
        // Explicit tokens verify that feature-module repositories can be resolved.
        expect(module.get(getRepositoryToken(EventEntity))).toBeTruthy();
        app = module.createNestApplication<NestExpressApplication>({
            bodyParser: false,
        });
        configureHttp(
            app as NestExpressApplication,
            { production: false } as AppConfig,
            frontend,
        );
        await app.init();
    });
    afterAll(async () => {
        await app?.close();
        rmSync(frontend, { recursive: true, force: true });
        if (previousWorker === undefined) delete process.env.WORKER_ENABLED;
        else process.env.WORKER_ENABLED = previousWorker;
    });
    it('accepts signed raw payloads and deduplicates HTTP redelivery', async () => {
        const raw = '{ "repository": {"id":42}, "action":"opened" }';
        const sig =
            'sha256=' + createHmac('sha256', 'test').update(raw).digest('hex');
        const send = () =>
            request(app.getHttpServer())
                .post('/webhooks/github/1')
                .set('Content-Type', 'application/json')
                .set('X-Hub-Signature-256', sig)
                .set('X-GitHub-Delivery', 'f'.repeat(32))
                .set('X-GitHub-Event', 'issues')
                .send(raw);
        expect((await send()).status).toBe(202);
        expect((await send()).body.duplicate).toBe(true);
    });
    it('rejects unsigned malformed JSON before parsing', async () => {
        await request(app.getHttpServer())
            .post('/webhooks/github/1')
            .set('Content-Type', 'application/json')
            .send('{bad')
            .expect(401);
    });
    it.each(['', 'sha256=no', 'sha256=' + '0'.repeat(64)])(
        'rejects missing/invalid signature %s with no persisted event',
        async (signature) => {
            const before = deliveries.size;
            await request(app.getHttpServer())
                .post('/webhooks/github/1')
                .set('Content-Type', 'application/json')
                .set('X-Hub-Signature-256', signature)
                .set('X-GitHub-Delivery', 'e'.repeat(32))
                .set('X-GitHub-Event', 'issues')
                .send('{"repository":{"id":42},"action":"opened"}')
                .expect(401);
            expect(deliveries.size).toBe(before);
        },
    );
    it('rejects a changed raw body with the original valid signature and does not persist it', async () => {
        const raw = '{"repository":{"id":42},"action":"opened"}';
        const signature =
            'sha256=' + createHmac('sha256', 'test').update(raw).digest('hex');
        const before = deliveries.size;
        await request(app.getHttpServer())
            .post('/webhooks/github/1')
            .set('Content-Type', 'application/json')
            .set('X-Hub-Signature-256', signature)
            .set('X-GitHub-Delivery', 'd'.repeat(32))
            .set('X-GitHub-Event', 'issues')
            .send(raw + ' ')
            .expect(401);
        expect(deliveries.size).toBe(before);
    });
    it('does not permit cross-origin credentialed access', async () => {
        const response = await request(app.getHttpServer())
            .get('/api/me')
            .set('Origin', 'https://evil.test')
            .expect(401);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
        expect(
            response.headers['access-control-allow-credentials'],
        ).toBeUndefined();
    });
    it('has no removed development retry creation endpoint', async () => {
        await request(app.getHttpServer())
            .post('/api/dev/retry-tests/slack')
            .send({})
            .expect(404);
    });
    it('rate limits OAuth initiation without reflecting submitted secrets', async () => {
        let result;
        for (let count = 0; count < 11; count++)
            result = await request(app.getHttpServer()).get('/auth/github');
        expect(result!.status).toBe(429);
        expect(result!.body.code).toBe('HTTP_429');
        expect(result!.headers['retry-after']).toBeTruthy();
    });
    it('rejects unauthenticated API access with the consistent error contract', async () => {
        const result = await request(app.getHttpServer())
            .get('/api/me')
            .expect(401);
        expect(result.body).toMatchObject({
            statusCode: 401,
            code: 'HTTP_401',
            message: 'Sign in required',
        });
        expect(result.body.requestId).toBeTruthy();
    });
    it('rejects mismatched OAuth callbacks', async () => {
        await request(app.getHttpServer())
            .get('/auth/github/callback?state=wrong&code=fake')
            .expect(403);
    });
    it('serves deep links while leaving server namespaces as JSON errors', async () => {
        await request(app.getHttpServer())
            .get('/dashboard')
            .set('Accept', 'text/html')
            .expect(200)
            .expect(/Angular test shell/);
        for (const path of [
            '/api/missing',
            '/auth/missing',
            '/webhooks/missing',
            '/health/missing',
        ]) {
            const response = await request(app.getHttpServer())
                .get(path)
                .set('Accept', 'text/html')
                .expect(404);
            expect(response.headers['content-type']).toContain(
                'application/json',
            );
        }
    });
    it('rejects malformed identifiers', async () => {
        await request(app.getHttpServer())
            .post('/webhooks/github/not-an-id')
            .set('Content-Type', 'application/json')
            .send('{}')
            .expect(400);
    });
    it('reports JSON parsing failures as 400 without echoing request secrets', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/logout')
            .set('Content-Type', 'application/json')
            .send('{secret value')
            .expect(400);
        expect(response.body.code).toBe('INVALID_JSON');
        expect(JSON.stringify(response.body)).not.toContain('secret value');
    });
    it('completes GitHub OAuth with mocked exchange/profile APIs and an HttpOnly session', async () => {
        const fetch = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ access_token: 'fake-test-token' }),
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        id: 42,
                        login: 'test-user',
                        avatar_url: 'https://example.test/avatar',
                    }),
                ),
            );
        try {
            const state = 'a'.repeat(48) + ':' + String(Date.now() + 590000);
            const cookie = encodeURIComponent(sign(state, 'test'.repeat(10)));
            const response = await request(app.getHttpServer())
                .get('/auth/github/callback')
                .query({ state, code: 'fake-code' })
                .set('Cookie', 'oauth_state=' + cookie)
                .expect(302);
            expect(response.headers.location).toBe('/dashboard');
            expect(String(response.headers['set-cookie'])).toContain(
                'HttpOnly',
            );
            expect(String(response.headers['set-cookie'])).toContain('Secure');
            expect(JSON.stringify(response.body)).not.toContain(
                'fake-test-token',
            );
            expect(fetch).toHaveBeenCalledTimes(2);
        } finally {
            fetch.mockRestore();
        }
    });
});
