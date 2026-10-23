import { DataSource, EntityManager } from 'typeorm';

// Test-only: transaction-local settings survive transaction-mode pooling safely.
// No fallback schema, automatic schema deletion, or application configuration changes.
export function isolateTestSource(
    source: DataSource,
    namespace: string,
): DataSource {
    if (!/^(orm_test_[a-f0-9]{12}|retry_test_[a-f0-9]{16})$/.test(namespace))
        throw new Error('Invalid isolated test schema');
    if (
        source.options.synchronize ||
        source.options.dropSchema ||
        source.options.migrationsRun ||
        source.entityMetadatas.some((table) => table.schema !== namespace)
    )
        throw new Error('Test entities must target only the isolated schema');

    const createRunner = source.createQueryRunner.bind(source);
    source.createQueryRunner = (...args) => {
        const runner = createRunner(...args);
        const query = runner.query.bind(runner);
        const start = runner.startTransaction.bind(runner);
        runner.startTransaction = async (...transactionArgs) => {
            await start(...transactionArgs);
            await query("SELECT set_config('search_path', $1, true)", [
                `"${namespace}"`,
            ]);
            await query("SET LOCAL lock_timeout = '2s'");
            await query("SET LOCAL statement_timeout = '15s'");
            const settings: {
                path: string;
                schemas: string[];
            }[] = await query(
                "SELECT current_setting('search_path') AS path, current_schemas(false)::text[] AS schemas",
            );
            if (
                settings[0]?.path !== `"${namespace}"` ||
                settings[0].schemas.some((schema) => schema !== namespace)
            )
                throw new Error('Test search_path isolation failed');
        };
        runner.query = (async (
            sql: string,
            parameters?: unknown[],
            structured?: true,
        ) => {
            const execute = () =>
                structured
                    ? query(sql, parameters, true)
                    : query(sql, parameters);
            // Transaction controls are used by the genuine TypeORM runner.
            if (
                /^(START TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT|SET TRANSACTION ISOLATION LEVEL)\b/i.test(
                    sql.trim(),
                ) ||
                runner.isTransactionActive
            )
                return execute();
            // Even standalone repository operations get a pinned transaction.
            try {
                await runner.startTransaction();
                const result = await execute();
                await runner.commitTransaction();
                return result;
            } catch (error) {
                if (runner.isTransactionActive)
                    await runner.rollbackTransaction();
                throw error;
            }
        }) as typeof runner.query;
        return runner;
    };
    return source;
}

export async function assertTestTables(
    manager: EntityManager,
    namespace: string,
): Promise<void> {
    for (const name of [
        'users',
        'repos',
        'rules',
        'events',
        'actions',
        'sessions',
    ]) {
        const rows: { schema: string }[] = await manager.query(
            `SELECT n.nspname AS schema FROM pg_class c
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE c.oid=to_regclass($1)`,
            [name],
        );
        if (rows[0]?.schema !== namespace)
            throw new Error('Test table resolves outside its isolated schema');
    }
}
