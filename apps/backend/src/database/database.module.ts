import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppConfig } from '../config/config.module';
import { DatabaseService } from './database.service';
import { databaseOptions } from './options';

@Global()
@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [AppConfig],
            useFactory: (config: AppConfig) => ({
                ...databaseOptions(config),
                retryAttempts: 1,
            }),
            dataSourceFactory: async (options) => {
                try {
                    return await new DataSource(options!).initialize();
                } catch {
                    throw new Error(
                        'PostgreSQL connection failed. Verify server configuration and TLS connectivity.',
                    );
                }
            },
        }),
    ],
    providers: [DatabaseService],
    exports: [DatabaseService, TypeOrmModule],
})
export class DatabaseModule {}
