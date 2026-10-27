import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ActionsService } from '../src/actions/actions.service';
import { ActionEntity } from '../src/actions/entities/action.entity';
import { AppConfig } from '../src/config/config.module';
import { encrypt } from '../src/common/security';
import { DatabaseService } from '../src/database/database.service';
import { databaseOptions } from '../src/database/options';
import { PreserveAutomationSchema1761177600000 } from '../src/database/migrations/1761177600000-PreserveAutomationSchema';
import { EventEntity } from '../src/events/entities/event.entity';
import { EventsService } from '../src/events/events.service';
import { GithubService } from '../src/github/github.service';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { RuleEntity } from '../src/rules/entities/rule.entity';
import { SlackService } from '../src/slack/slack.service';
import { UserEntity } from '../src/users/entities/user.entity';
import { EventProcessorService } from '../src/workers/event-processor.service';
import { EventQueueService } from '../src/workers/event-queue.service';
import { assertTestTables, isolateTestSource } from './isolated-database';

jest.setTimeout(60000);

// Never falls back to DATABASE_URL. Schema and fixture rows are retained for inspection;
// this suite does not drop/truncate tables or change existing application data.
(process.env.TEST_DATABASE_URL ? describe : describe.skip)(
    'Retry locking and durability on explicit disposable PostgreSQL',
    () => {
        let source: DataSource;
        let db: DatabaseService;
        let repo: RepositoryEntity;
        const namespace = 'retry_test_' + randomBytes(8).toString('hex');
        const config = {
            eventMaxAttempts: 5,
            encryptionKey: Buffer.alloc(32, 1),
            slackUrl: 'https://hooks.slack.com/services/test/test/test',
        } as AppConfig;
        const queue = () =>
            new EventQueueService(
                source.getRepository(EventEntity),
                db,
                config,
            );
        const actions = () =>
            new ActionsService(source.getRepository(ActionEntity), db);
        const ingestion = () =>
            new EventsService(
                source.getRepository(EventEntity),
                source.getRepository(RepositoryEntity),
                db,
                actions(),
            );
        const processor = () =>
            new EventProcessorService(
                db,
                new GithubService(config),
                new SlackService(config),
                actions(),
                config,
            );
        beforeAll(async () => {
            const options = databaseOptions({
                databaseUrl: process.env.TEST_DATABASE_URL!,
                databaseSsl: false,
            });
            if (options.type !== 'postgres')
                throw new Error('PostgreSQL required');
            source = new DataSource({
                ...options,
                schema: namespace,
            });
            await source.initialize();
            isolateTestSource(source, namespace);
            await source.query(`CREATE SCHEMA "${namespace}"`);
            db = new DatabaseService(source);
            await db.transaction('retry_test_schema', async (manager) => {
                await new PreserveAutomationSchema1761177600000().up(
                    manager.queryRunner!,
                );
                await assertTestTables(manager, namespace);
                await manager.insert(UserEntity, {
                    id: '1',
                    login: 'retry-test',
                    tokenEncrypted: encrypt('fake-token', config.encryptionKey),
                });
                repo = await manager.save(RepositoryEntity, {
                    ownerId: '1',
                    fullName: 'test/repo',
                    githubRepoId: '42',
                    webhookSecret: 'fake-secret',
                });
                const isolatedRepoId = (
                    (1n << 60n) +
                    BigInt('0x' + randomBytes(7).toString('hex'))
                ).toString();
                await manager.update(RepositoryEntity, repo.id, {
                    id: isolatedRepoId,
                });
                repo.id = isolatedRepoId;
                expect(
                    await manager.countBy(RepositoryEntity, {
                        id: isolatedRepoId,
                    }),
                ).toBe(1);
                await manager.insert(RuleEntity, {
                    repoId: repo.id,
                    keyword: 'bug',
                    label: 'bug',
                    slackEnabled: true,
                });
            });
        });
        afterEach(() => jest.restoreAllMocks());
        afterAll(async () => {
            if (source?.isInitialized) await source.destroy();
        });

        it('persists action progress, deduplicates during retry, and finishes after a new processor starts', async () => {
            const delivery = randomBytes(16).toString('hex');
            const payload = {
                action: 'opened',
                issue: {
                    user: { login: 'test' },
                    number: 5,
                    title: 'Bug',
                    html_url: 'https://example.test/5',
                },
            };
            await ingestion().ingest(repo.id, delivery, 'issues', payload);
            const fetch = jest
                .spyOn(globalThis, 'fetch')
                .mockResolvedValueOnce(new Response('[]'))
                .mockResolvedValueOnce(new Response('', { status: 503 }))
                .mockResolvedValueOnce(new Response('ok'));
            const claim = await queue().claim();
            expect(claim).not.toBeNull();
            const processingStartedAt = Date.now();
            await processor().process(claim!);
            const processingFinishedAt = Date.now();
            let event = await source
                .getRepository(EventEntity)
                .findOneByOrFail({ deliveryId: delivery });
            expect(event).toMatchObject({ status: 'pending', attempts: 1 });
            // Network reads may finish after the short backoff has elapsed.
            // Verify the persisted two-second schedule against processing bounds.
            expect(event.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
                processingStartedAt + 2000,
            );
            expect(event.nextAttemptAt!.getTime()).toBeLessThanOrEqual(
                processingFinishedAt + 2000,
            );
            expect(
                await ingestion().ingest(repo.id, delivery, 'issues', payload),
            ).toEqual({ received: true, duplicate: true });
            expect(
                await source
                    .getRepository(EventEntity)
                    .countBy({ deliveryId: delivery }),
            ).toBe(1);
            // Expedite only this test row, never production or a real delivery.
            await source
                .getRepository(EventEntity)
                .update(event.id, { nextAttemptAt: new Date(0) });
            const retry = await queue().claim();
            await processor().process(retry!);
            event = await source
                .getRepository(EventEntity)
                .findOneByOrFail({ id: event.id });
            expect(event).toMatchObject({
                status: 'done',
                attempts: 2,
                error: null,
                nextAttemptAt: null,
            });
            expect(
                await source
                    .getRepository(ActionEntity)
                    .countBy({ eventId: event.id, status: 'ok' }),
            ).toBe(2);
            expect(fetch).toHaveBeenCalledTimes(3);
        });
        it('allows only one concurrent claim and skips rows locked by active processing', async () => {
            const event = await source.getRepository(EventEntity).save({
                repoId: repo.id,
                deliveryId: randomBytes(16).toString('hex'),
                eventType: 'push',
                payload: {},
            });
            const claims = await Promise.all([
                queue().claim(),
                queue().claim(),
            ]);
            expect(claims.filter(Boolean)).toEqual([
                { id: event.id, repoId: repo.id },
            ]);
            await source
                .getRepository(EventEntity)
                .update(event.id, { nextAttemptAt: new Date(0) });
            await db.transaction('hold_test_event', async (manager) => {
                await manager
                    .getRepository(EventEntity)
                    .createQueryBuilder('event')
                    .where('event.id=:id', { id: event.id })
                    .setLock('pessimistic_write')
                    .getOne();
                expect(await queue().claim()).toBeNull();
            });
            expect(await queue().claim()).toEqual({
                id: event.id,
                repoId: repo.id,
            });
            await source
                .getRepository(EventEntity)
                .update(event.id, { status: 'done', nextAttemptAt: null });
        });
        it('recovers expired crash leases and finalizes exhausted leases without resetting attempts', async () => {
            const event = await source.getRepository(EventEntity).save({
                repoId: repo.id,
                deliveryId: randomBytes(16).toString('hex'),
                eventType: 'push',
                payload: {},
                status: 'processing',
                attempts: 2,
                nextAttemptAt: new Date(0),
            });
            expect(await queue().claim()).toEqual({
                id: event.id,
                repoId: repo.id,
            });
            expect(
                (
                    await source
                        .getRepository(EventEntity)
                        .findOneByOrFail({ id: event.id })
                ).attempts,
            ).toBe(3);
            await source
                .getRepository(EventEntity)
                .update(event.id, { attempts: 5, nextAttemptAt: new Date(0) });
            await queue().recoverExhausted();
            expect(
                await source
                    .getRepository(EventEntity)
                    .findOneByOrFail({ id: event.id }),
            ).toMatchObject({
                status: 'failed',
                attempts: 5,
                nextAttemptAt: null,
            });
            expect(await queue().claim()).toBeNull();
        });
    },
);
