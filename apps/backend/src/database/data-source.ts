import { resolve } from 'node:path';
import { config } from 'dotenv';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './options';

// The CLI only needs database credentials; it never boots the web application.
config({ path: resolve(__dirname, '../../../../.env') });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
    throw new Error('DATABASE_URL is required for database commands');
export default new DataSource(
    databaseOptions({
        databaseUrl,
        databaseSsl:
            process.env.NODE_ENV === 'production' ||
            process.env.DATABASE_SSL === 'true',
    }),
);
