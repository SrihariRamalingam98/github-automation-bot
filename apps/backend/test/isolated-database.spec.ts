import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { assertTestTables, isolateTestSource } from './isolated-database';

const namespace = 'retry_test_0123456789abcdef';
function setup(schemas = [namespace]) {
    const runner = {
        isTransactionActive: false,
        query: jest.fn(async (sql: string) =>
            sql.startsWith('SELECT current_setting')
                ? [{ path: `"${namespace}"`, schemas }]
                : [],
        ),
        startTransaction: jest.fn(async () => {
            runner.isTransactionActive = true;
        }),
        commitTransaction: jest.fn(async () => {
            runner.isTransactionActive = false;
        }),
        rollbackTransaction: jest.fn(async () => {
            runner.isTransactionActive = false;
        }),
    };
    const originalQuery = runner.query;
    const originalStart = runner.startTransaction;
    const source = {
        options: {},
        entityMetadatas: [{ schema: namespace }],
        createQueryRunner: () => runner as unknown as QueryRunner,
    } as unknown as DataSource;
    return { source, runner, originalQuery, originalStart };
}

describe('Test-only PostgreSQL isolation guard', () => {
    it('pins standalone operations and verifies settings before executing SQL', async () => {
        const { source, runner, originalQuery, originalStart } = setup();
        isolateTestSource(source, namespace);
        const guarded = source.createQueryRunner();
        await guarded.query('SELECT test_fixture');
        expect(originalStart).toHaveBeenCalledTimes(1);
        expect(originalQuery.mock.calls.map(([sql]) => sql)).toEqual([
            "SELECT set_config('search_path', $1, true)",
            "SET LOCAL lock_timeout = '2s'",
            "SET LOCAL statement_timeout = '15s'",
            "SELECT current_setting('search_path') AS path, current_schemas(false)::text[] AS schemas",
            'SELECT test_fixture',
        ]);
        expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    });
    it('rolls back before executing an operation if public is in search_path', async () => {
        const { source, runner, originalQuery } = setup(['public']);
        isolateTestSource(source, namespace);
        await expect(
            source.createQueryRunner().query('UPDATE test_fixture'),
        ).rejects.toThrow('isolation failed');
        expect(originalQuery).not.toHaveBeenCalledWith('UPDATE test_fixture');
        expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
        expect(runner.commitTransaction).not.toHaveBeenCalled();
    });
    it('rejects an invalid namespace or an entity mapped to public', () => {
        const { source } = setup();
        expect(() => isolateTestSource(source, 'public')).toThrow(
            'Invalid isolated test schema',
        );
        Object.assign(source.entityMetadatas[0], { schema: 'public' });
        expect(() => isolateTestSource(source, namespace)).toThrow(
            'Test entities must target only the isolated schema',
        );
    });
    it('rejects a table resolving outside the test schema', async () => {
        const manager = {
            query: jest.fn().mockResolvedValue([{ schema: 'public' }]),
        } as unknown as EntityManager;
        await expect(assertTestTables(manager, namespace)).rejects.toThrow(
            'outside its isolated schema',
        );
    });
});
