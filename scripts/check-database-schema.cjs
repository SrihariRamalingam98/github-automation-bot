// Read-only metadata check. Never runs migrations or schema synchronization.
const fs = require('node:fs');
const path = require('node:path');
const source = require('../apps/backend/dist/database/data-source').default;
source.setOptions({
    extra: {
        ...source.options.extra,
        options: '-c default_transaction_read_only=on',
    },
});
(async () => {
    let runner;
    try {
        await source.initialize();
        runner = source.createQueryRunner();
        await runner.connect();
        const mismatches = [];
        const inspected = [];
        const equivalent = {
            timestamptz: 'timestamp with time zone',
            int: 'integer',
            int4: 'integer',
            int8: 'bigint',
            bool: 'boolean',
        };
        for (const metadata of source.entityMetadatas) {
            const table = await runner.getTable(metadata.tablePath);
            if (!table) {
                mismatches.push(`${metadata.tableName}: missing table`);
                continue;
            }
            for (const column of metadata.columns) {
                const actual = table.columns.find((c) => c.name === column.databaseName);
                const expectedType = equivalent[String(column.type)] || String(column.type);
                const actualType = equivalent[actual?.type] || actual?.type;
                if (
                    !actual ||
                    expectedType !== actualType ||
                    column.isNullable !== actual.isNullable ||
                    column.isPrimary !== actual.isPrimary
                )
                    mismatches.push(
                        `${metadata.tableName}.${column.databaseName}: type/nullability/primary-key mismatch`,
                    );
            }
            for (const foreignKey of metadata.foreignKeys) {
                const names = foreignKey.columns
                    .map((c) => c.databaseName)
                    .sort()
                    .join(',');
                if (
                    !table.foreignKeys.some(
                        (k) =>
                            k.columnNames.sort().join(',') === names &&
                            k.referencedTableName.split('.').at(-1) ===
                                foreignKey.referencedEntityMetadata.tableName,
                    )
                )
                    mismatches.push(`${metadata.tableName}: missing foreign key ${names}`);
            }
            for (const unique of metadata.uniques) {
                const names = unique.columns
                    .map((c) => c.databaseName)
                    .sort()
                    .join(',');
                if (
                    !table.uniques.some((u) => u.columnNames.sort().join(',') === names) &&
                    !table.indices.some(
                        (i) => i.isUnique && i.columnNames.sort().join(',') === names,
                    )
                )
                    mismatches.push(`${metadata.tableName}: missing unique constraint ${names}`);
            }
            const expectedIndexes = metadata.indices.map((i) => i.name).filter(Boolean);
            for (const name of expectedIndexes)
                if (!table.indices.some((i) => i.name === name))
                    mismatches.push(`${metadata.tableName}: missing index ${name}`);
            inspected.push({
                table: metadata.tableName,
                columns: table.columns.map((c) => ({
                    name: c.name,
                    type: c.type,
                    nullable: c.isNullable,
                    primary: c.isPrimary,
                    default: c.default ?? null,
                })),
                foreignKeys: table.foreignKeys.map((k) => ({
                    columns: k.columnNames,
                    table: k.referencedTableName,
                    referencedColumns: k.referencedColumnNames,
                })),
                uniques: table.uniques.map((u) => u.columnNames),
                indexes: table.indices.map((i) => i.name),
            });
        }
        const report = {
            checkedAt: new Date().toISOString(),
            mode: 'read-only schema metadata; no application rows read',
            matches: mismatches.length === 0,
            mismatches,
            tables: inspected,
        };
        fs.mkdirSync(path.resolve(__dirname, '../docs'), { recursive: true });
        fs.writeFileSync(
            path.resolve(__dirname, '../docs/database-schema-check.json'),
            JSON.stringify(report, null, 4) + '\n',
        );
        process.stdout.write(
            JSON.stringify({
                tables: inspected.length,
                matches: report.matches,
                mismatches,
            }) + '\n',
        );
        if (mismatches.length) process.exitCode = 1;
    } catch (error) {
        process.stderr.write('Read-only schema check failed: ' + (error.code || error.name) + '\n');
        process.exitCode = 1;
    } finally {
        if (runner) await runner.release();
        if (source.isInitialized) await source.destroy();
    }
})();
