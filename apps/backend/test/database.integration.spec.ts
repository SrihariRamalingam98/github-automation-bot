import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { databaseOptions } from '../src/database/options';
import { PreserveAutomationSchema1761177600000 } from '../src/database/migrations/1761177600000-PreserveAutomationSchema';
import { UserEntity } from '../src/users/entities/user.entity';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { RuleEntity } from '../src/rules/entities/rule.entity';
import { EventEntity } from '../src/events/entities/event.entity';
import { assertTestTables, isolateTestSource } from './isolated-database';
jest.setTimeout(60000);
const enabled = !!process.env.TEST_DATABASE_URL;
(enabled ? describe : describe.skip)(
    'Disposable PostgreSQL migrations and TypeORM relationships',
    () => {
        let source: DataSource;
        const namespace = 'orm_test_' + randomBytes(6).toString('hex');
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
        });
        afterAll(async () => {
            if (source?.isInitialized) await source.destroy();
        });
        it('preserves data across repeated migrations and rolls back ORM writes', async () => {
            const runner = source.createQueryRunner();
            await runner.connect();
            await runner.startTransaction();
            try {
                await runner.query(`CREATE SCHEMA "${namespace}"`);
                await runner.query(`SET LOCAL search_path TO "${namespace}"`);
                const migration = new PreserveAutomationSchema1761177600000();
                await migration.up(runner);
                await assertTestTables(runner.manager, namespace);
                await runner.manager.insert(UserEntity, {
                    id: '1',
                    login: 'test',
                    tokenEncrypted: 'test-encrypted',
                });
                await migration.up(runner);
                const repo = await runner.manager.save(RepositoryEntity, {
                    ownerId: '1',
                    fullName: 'test/repo',
                    githubRepoId: '42',
                    webhookSecret: 'test-secret',
                });
                await runner.manager.insert(RuleEntity, {
                    repoId: repo.id,
                    keyword: 'bug',
                    label: 'bug',
                });
                await runner.manager.insert(EventEntity, {
                    repoId: repo.id,
                    deliveryId: 'unique-delivery',
                    eventType: 'push',
                    payload: { repository: { id: 42 } },
                });
                expect(
                    (
                        await runner.manager.findOneOrFail(UserEntity, {
                            where: { id: '1' },
                        })
                    ).login,
                ).toBe('test');
                expect(
                    (
                        await runner.manager.findOneOrFail(UserEntity, {
                            where: { id: '1' },
                        })
                    ).tokenEncrypted,
                ).toBeUndefined();
                const rule = await runner.manager.findOneOrFail(RuleEntity, {
                    where: { repoId: repo.id },
                    relations: { repository: true },
                });
                expect(rule.repository.fullName).toBe('test/repo');
                expect(rule.eventType).toBe('issues.opened');
                await runner.startTransaction();
                await expect(
                    runner.manager.insert(EventEntity, {
                        repoId: repo.id,
                        deliveryId: 'unique-delivery',
                        eventType: 'push',
                        payload: {},
                    }),
                ).rejects.toThrow();
                await runner.rollbackTransaction();
                expect(await runner.manager.count(EventEntity)).toBe(1);
            } finally {
                await runner.rollbackTransaction();
                await runner.release();
            }
            expect(
                (
                    await source.query(
                        'SELECT 1 FROM information_schema.schemata WHERE schema_name=$1',
                        [namespace],
                    )
                ).length,
            ).toBe(0);
        });
    },
);
