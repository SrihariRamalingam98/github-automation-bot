import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
    DatabaseError,
    databaseCode,
} from '../common/exceptions/database.exception';

@Injectable()
export class DatabaseService {
    private readonly logger = new Logger('Database');

    constructor(readonly source: DataSource) {}

    async execute<T>(operation: string, work: () => Promise<T>): Promise<T> {
        try {
            return await work();
        } catch (error) {
            const code = databaseCode(error);
            if (code) {
                this.logger.error(
                    JSON.stringify({
                        event: 'database_failed',
                        operation,
                        code,
                    }),
                );
                throw new DatabaseError(operation, code);
            }
            throw error;
        }
    }

    async transaction<T>(
        operation: string,
        work: (manager: EntityManager) => Promise<T>,
    ): Promise<T> {
        return this.execute(operation, async () => {
            const runner = this.source.createQueryRunner();
            try {
                await runner.connect();
                await runner.startTransaction();
                const result = await work(runner.manager);
                await runner.commitTransaction();
                return result;
            } catch (error) {
                if (runner.isTransactionActive) {
                    try {
                        await runner.rollbackTransaction();
                    } catch {
                        this.logger.error(
                            JSON.stringify({
                                event: 'rollback_failed',
                                operation,
                            }),
                        );
                    }
                }
                throw error;
            } finally {
                try {
                    await runner.release();
                } catch {
                    this.logger.error(
                        JSON.stringify({
                            event: 'connection_release_failed',
                            operation,
                        }),
                    );
                }
            }
        });
    }

    async health(): Promise<void> {
        await this.execute('health', () => this.source.query('SELECT 1'));
    }
}
