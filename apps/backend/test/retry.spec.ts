import { Logger } from '@nestjs/common';
import { ActionEntity } from '../src/actions/entities/action.entity';
import { ActionsService } from '../src/actions/actions.service';
import { AppConfig } from '../src/config/config.module';
import { EventEntity } from '../src/events/entities/event.entity';
import { EventsService } from '../src/events/events.service';
import { GithubService } from '../src/github/github.service';
import { RuleEntity } from '../src/rules/entities/rule.entity';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { SlackService } from '../src/slack/slack.service';
import { EventProcessorService } from '../src/workers/event-processor.service';
import { EventQueueService } from '../src/workers/event-queue.service';
import { UpstreamError } from '../src/common/exceptions/upstream.exception';
import {
    externalRequest,
    retryDelay,
} from '../src/common/exceptions/external-request';
import { encrypt } from '../src/common/security';
import { builder, databaseStub, manager, repository } from './helpers';

jest.mock('dotenv', () => ({ config: jest.fn() }));

function setup(maxAttempts = 5) {
    const config = {
        encryptionKey: Buffer.alloc(32, 1),
        eventMaxAttempts: maxAttempts,
        slackUrl: 'https://hooks.slack.com/services/test/test/test',
    } as AppConfig;
    const event = {
        id: '1',
        repoId: '2',
        deliveryId: 'a'.repeat(32),
        eventType: 'issues',
        action: 'opened',
        status: 'processing',
        attempts: 1,
        error: null,
        nextAttemptAt: new Date(Date.now() + 120000),
        processedAt: null,
        payload: {
            issue: {
                title: 'Bug',
                number: 5,
                html_url: 'https://example.test/5',
            },
        },
        repository: {
            fullName: 'test/repo',
            disconnectedAt: null,
            owner: {
                tokenEncrypted: encrypt(
                    'fake-oauth-token',
                    config.encryptionKey,
                ),
            },
        },
    } as EventEntity;
    const query = builder();
    query.getOne.mockImplementation(async () =>
        event.status === 'processing' ? event : null,
    );
    const events = {
        createQueryBuilder: () => query,
        update: jest.fn(async (_id: string, patch: Partial<EventEntity>) => {
            Object.assign(event, patch);
        }),
    };
    const rule = {
        id: '3',
        repoId: '2',
        eventType: 'issues.opened',
        enabled: true,
        keyword: 'bug',
        label: 'bug',
        slackEnabled: true,
    };
    const records = new Map<string, Partial<ActionEntity>>();
    const actions = {
        findOneBy: jest.fn(async ({ kind }: { kind: string }) =>
            records.get(kind),
        ),
        upsert: jest.fn(
            async (value: Partial<ActionEntity> & { kind: string }) => {
                records.set(value.kind, value);
            },
        ),
    };
    const db = databaseStub(
        manager({
            query: jest.fn(),
            getRepository: (target: unknown) =>
                target === EventEntity
                    ? events
                    : target === RuleEntity
                      ? { find: async () => [rule] }
                      : actions,
        }),
    );
    const createProcessor = () =>
        new EventProcessorService(
            db,
            new GithubService(config),
            new SlackService(config),
            new ActionsService(repository<ActionEntity>({}), db),
            config,
        );
    const process = () =>
        createProcessor().process({ id: event.id, repoId: event.repoId });
    return { event, records, actions, query, events, config, db, process };
}

describe('Retry workflow with real adapters and mocked HTTP/persistence', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-10-23T00:00:00Z'));
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });
    it.each([undefined, '2', '10'])(
        'validates retry configuration %s',
        (value) => {
            jest.replaceProperty(process, 'env', {
                APP_URL: 'http://localhost:4200',
                DATABASE_URL: 'postgresql://test:test@localhost/test',
                GITHUB_CLIENT_ID: 'fake',
                GITHUB_CLIENT_SECRET: 'fake',
                SESSION_SECRET: 's'.repeat(32),
                ENCRYPTION_KEY: '01'.repeat(32),
                ...(value === undefined ? {} : { EVENT_MAX_ATTEMPTS: value }),
            });
            expect(new AppConfig().eventMaxAttempts).toBe(Number(value ?? 5));
        },
    );
    it.each(['0', '-1', '1.5', 'NaN', '101'])(
        'rejects unsafe retry configuration %s',
        (value) => {
            jest.replaceProperty(process, 'env', { EVENT_MAX_ATTEMPTS: value });
            expect(() => new AppConfig()).toThrow('EVENT_MAX_ATTEMPTS');
        },
    );

    it('retries Slack 503 then 200 across processor restart without repeating the label', async () => {
        const fixture = setup();
        const fetch = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response('[]'))
            .mockResolvedValueOnce(
                new Response('private upstream response', { status: 503 }),
            )
            .mockResolvedValueOnce(new Response('ok'));
        await fixture.process();
        expect(fixture.event).toMatchObject({
            status: 'pending',
            attempts: 1,
            error: 'Slack request failed (HTTP 503)',
            nextAttemptAt: new Date(Date.now() + 2000),
        });
        expect(fixture.records.get('label:3')?.status).toBe('ok');
        expect(fixture.records.get('slack:3')?.status).toBe('failed');
        // A duplicate delivery's ON CONFLICT result cannot reset the queued event.
        const insert = builder();
        insert.execute.mockResolvedValue({ raw: [] });
        const duplicateDb = databaseStub(
            manager({
                getRepository: () => ({ createQueryBuilder: () => insert }),
            }),
        );
        const ingestion = new EventsService(
            repository<EventEntity>({}),
            repository<RepositoryEntity>({}),
            duplicateDb,
            {} as ActionsService,
        );
        expect(
            await ingestion.ingest(
                '2',
                fixture.event.deliveryId,
                'issues',
                fixture.event.payload,
            ),
        ).toEqual({ received: true, duplicate: true });
        expect(fixture.event.attempts).toBe(1);
        expect(insert.onConflict).toHaveBeenCalledWith(
            '("delivery_id") DO NOTHING',
        );
        jest.setSystemTime(fixture.event.nextAttemptAt!);
        fixture.event.status = 'processing';
        fixture.event.attempts++;
        await fixture.process(); // New processor instance, same persisted action records.
        expect(fixture.event).toMatchObject({
            status: 'done',
            error: null,
            attempts: 2,
            nextAttemptAt: null,
            processedAt: new Date(),
        });
        expect(fixture.records.get('slack:3')?.status).toBe('ok');
        expect(
            fetch.mock.calls.filter(([url]) =>
                String(url).includes('api.github.com'),
            ),
        ).toHaveLength(1);
        expect(
            fetch.mock.calls.filter(([url]) =>
                String(url).includes('hooks.slack.com'),
            ),
        ).toHaveLength(2);
        expect(fixture.query.setLock).toHaveBeenCalledWith(
            'pessimistic_write',
            undefined,
            ['event'],
        );
        const logs = JSON.stringify(
            (Logger.prototype.warn as jest.Mock).mock.calls,
        );
        expect(logs).toContain(fixture.event.deliveryId);
        expect(logs).toContain('slack:3');
        expect(logs).not.toMatch(
            /fake-oauth-token|hooks\.slack\.com|private upstream/,
        );
    });
    it.each([400, 401, 403, 404])(
        'does not retry permanent Slack HTTP %s',
        async (status) => {
            const fixture = setup();
            jest.spyOn(globalThis, 'fetch')
                .mockResolvedValueOnce(new Response('[]'))
                .mockResolvedValueOnce(new Response('secret', { status }));
            await fixture.process();
            expect(fixture.event).toMatchObject({
                status: 'failed',
                nextAttemptAt: null,
                processedAt: new Date(),
                attempts: 1,
            });
            expect(fixture.records.get('slack:3')?.status).toBe('failed');
        },
    );
    it('does not retry a permanent GitHub authorization failure or invoke Slack', async () => {
        const fixture = setup();
        const fetch = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('denied', { status: 403 }));
        await fixture.process();
        expect(fixture.event.status).toBe('failed');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fixture.records.has('slack:3')).toBe(false);
    });
    it.each([429, 403])(
        'honors rate limited HTTP %s Retry-After',
        async (status) => {
            const fixture = setup();
            jest.spyOn(globalThis, 'fetch')
                .mockResolvedValueOnce(new Response('[]'))
                .mockResolvedValueOnce(
                    new Response('', {
                        status,
                        headers: { 'Retry-After': '120' },
                    }),
                );
            await fixture.process();
            expect(fixture.event.status).toBe('pending');
            expect(fixture.event.nextAttemptAt).toEqual(
                new Date(Date.now() + 120000),
            );
        },
    );
    it.each([1, 2, 4, 5])(
        'uses exponential backoff at attempt %s',
        async (attempts) => {
            const fixture = setup(10);
            fixture.event.attempts = attempts;
            jest.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response('', { status: 503 }),
            );
            await fixture.process();
            expect(fixture.event.nextAttemptAt).toEqual(
                new Date(Date.now() + Math.min(300, 2 ** attempts) * 1000),
            );
        },
    );
    it.each([2, 5])(
        'stops at configured maximum %s without resetting counts',
        async (maximum) => {
            const fixture = setup(maximum);
            fixture.event.attempts = maximum;
            jest.spyOn(globalThis, 'fetch').mockResolvedValue(
                new Response('', { status: 503 }),
            );
            await fixture.process();
            expect(fixture.event).toMatchObject({
                status: 'failed',
                attempts: maximum,
                nextAttemptAt: null,
                processedAt: new Date(),
            });
        },
    );
    it('treats a corrupted stored credential as permanent and makes no HTTP call', async () => {
        const fixture = setup();
        fixture.event.repository.owner.tokenEncrypted = 'invalid';
        const fetch = jest.spyOn(globalThis, 'fetch');
        await fixture.process();
        expect(fixture.event.status).toBe('failed');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('schedules retry after a network connection failure', async () => {
        const fixture = setup();
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(
            new TypeError('private connection URL'),
        );
        await fixture.process();
        expect(fixture.event).toMatchObject({
            status: 'pending',
            nextAttemptAt: new Date(Date.now() + 2000),
        });
        expect(fixture.event.error).not.toContain('private');
    });
    it('uses a 15-second abort signal and schedules retry after request timeout', async () => {
        const fixture = setup();
        let signal: AbortSignal | undefined;
        jest.spyOn(AbortSignal, 'timeout').mockImplementation(
            (milliseconds) => {
                expect(milliseconds).toBe(15000);
                const controller = new AbortController();
                setTimeout(
                    () =>
                        controller.abort(
                            new DOMException('Timeout', 'TimeoutError'),
                        ),
                    milliseconds,
                );
                return controller.signal;
            },
        );
        jest.spyOn(globalThis, 'fetch').mockImplementation(
            async (_url, options) => {
                signal = options!.signal!;
                return new Promise((_resolve, reject) =>
                    signal!.addEventListener('abort', () =>
                        reject(signal!.reason),
                    ),
                );
            },
        );
        const processing = fixture.process();
        await jest.advanceTimersByTimeAsync(15000);
        await processing;
        expect(signal?.aborted).toBe(true);
        expect(fixture.event).toMatchObject({
            status: 'pending',
            nextAttemptAt: new Date(Date.now() + 2000),
        });
        expect(
            JSON.stringify((Logger.prototype.warn as jest.Mock).mock.calls),
        ).toContain('timeout');
    });
    it('rethrows database failures so the transaction can roll back instead of committing partial state', async () => {
        const fixture = setup();
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]'));
        fixture.actions.upsert.mockRejectedValueOnce(
            Object.assign(new Error('private SQL'), { code: '08006' }),
        );
        await expect(fixture.process()).rejects.toMatchObject({
            code: '08006',
        });
        expect(fixture.events.update).not.toHaveBeenCalled();
    });
    it('parses date Retry-After and exhausted GitHub rate-limit reset headers', () => {
        expect(
            retryDelay(
                new Response('', {
                    headers: {
                        'retry-after': new Date(
                            Date.now() + 60000,
                        ).toUTCString(),
                    },
                }),
            ),
        ).toBe(60);
        expect(
            retryDelay(
                new Response('', {
                    headers: {
                        'x-ratelimit-remaining': '0',
                        'x-ratelimit-reset': String(Date.now() / 1000 + 90),
                    },
                }),
            ),
        ).toBe(90);
        expect(
            retryDelay(new Response('', { headers: { 'retry-after': '0' } })),
        ).toBe(0);
    });
    it('does not turn a permanent 403 into a retry without rate-limit metadata', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('', { status: 403 }),
        );
        await expect(
            externalRequest('GitHub', 'https://api.github.com/user', {}),
        ).rejects.toMatchObject({ retryable: false });
        expect(new UpstreamError('GitHub', 403, 30).retryable).toBe(true);
    });
    it('recovers exhausted leases using skip-locked rows and the configured budget', async () => {
        const query = builder();
        query.execute.mockResolvedValue({ raw: [] });
        const queue = new EventQueueService(
            repository<EventEntity>({ createQueryBuilder: () => query }),
            databaseStub(),
            { eventMaxAttempts: 3 } as AppConfig,
        );
        await queue.recoverExhausted();
        expect(query.where).toHaveBeenCalledWith(
            expect.stringContaining('FOR UPDATE SKIP LOCKED'),
            { maxAttempts: 3 },
        );
        expect(query.set).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'failed',
                nextAttemptAt: null,
                processedAt: new Date(),
            }),
        );
    });
});
