import { DataSourceOptions } from 'typeorm';
import { AppConfig } from '../config/config.module';
import { entities } from './entities';
import { PreserveAutomationSchema1761177600000 } from './migrations/1761177600000-PreserveAutomationSchema';

export function databaseOptions(
    config: Pick<AppConfig, 'databaseUrl' | 'databaseSsl'>,
): DataSourceOptions {
    let url: URL;
    try {
        url = new URL(config.databaseUrl);
        if (!['postgres:', 'postgresql:'].includes(url.protocol))
            throw new Error();
    } catch {
        throw new Error(
            'DATABASE_URL must be a valid PostgreSQL connection URL',
        );
    }
    const mode = url.searchParams.get('sslmode');
    const ssl =
        config.databaseSsl ||
        url.searchParams.get('ssl') === 'true' ||
        !!(mode && mode !== 'disable');
    for (const key of [
        'ssl',
        'sslmode',
        'sslcert',
        'sslkey',
        'sslrootcert',
        'uselibpqcompat',
    ])
        url.searchParams.delete(key);
    return {
        type: 'postgres',
        url: url.toString(),
        ssl: ssl ? { rejectUnauthorized: true } : false,
        entities,
        migrations: [PreserveAutomationSchema1761177600000],
        migrationsTableName: 'automation_migrations',
        synchronize: false,
        dropSchema: false,
        migrationsRun: false,
        logging: false,
        extra: { max: 10, connectionTimeoutMillis: 15000 },
    };
}
