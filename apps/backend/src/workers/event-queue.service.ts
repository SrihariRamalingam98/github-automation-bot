import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import { EventEntity } from '../events/entities/event.entity';
import { AppConfig } from '../config/config.module';

@Injectable()
export class EventQueueService {
    private readonly logger = new Logger('EventQueue');

    constructor(
        @InjectRepository(EventEntity)
        private readonly events: Repository<EventEntity>,
        private readonly db: DatabaseService,
        private readonly config: AppConfig,
    ) {}

    async recoverExhausted(): Promise<void> {
        const result = await this.db.execute('recover_exhausted_events', () =>
            this.events
                .createQueryBuilder()
                .update()
                .set({
                    status: 'failed',
                    error: 'Retry budget exhausted after worker interruption',
                    nextAttemptAt: null,
                    processedAt: new Date(),
                })
                .where(
                    `id IN (SELECT id FROM events
                        WHERE status IN ('pending', 'processing')
                        AND COALESCE(next_attempt_at, received_at, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
                        AND attempts >= :maxAttempts
                        ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED)`,
                    { maxAttempts: this.config.eventMaxAttempts ?? 5 },
                )
                .returning('id, delivery_id, attempts')
                .execute(),
        );
        const rows: unknown = result.raw;
        if (Array.isArray(rows))
            for (const row of rows) {
                const event = row as {
                    id: string;
                    delivery_id: string;
                    attempts: number;
                };
                this.logger.warn(
                    JSON.stringify({
                        event: 'event_exhausted',
                        eventId: event.id,
                        deliveryId: event.delivery_id,
                        attempts: event.attempts,
                        errorCategory: 'worker_interruption',
                        status: 'failed',
                        retryAfterSeconds: 0,
                    }),
                );
            }
    }

    async claim(): Promise<{ id: string; repoId: string } | null> {
        return this.db.transaction('claim_event', async (manager) => {
            const store = manager.getRepository(EventEntity);
            const event = await store
                .createQueryBuilder('event')
                .where('event.status IN (:...statuses)', {
                    statuses: ['pending', 'processing'],
                })
                .andWhere(
                    'COALESCE(event.nextAttemptAt, event.receivedAt, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP AND event.attempts < :maxAttempts',
                    { maxAttempts: this.config.eventMaxAttempts ?? 5 },
                )
                .orderBy('event.id', 'ASC')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .getOne();
            if (!event) return null;
            await store.update(event.id, {
                status: 'processing',
                attempts: event.attempts + 1,
                nextAttemptAt: new Date(Date.now() + 120000),
            });
            return { id: event.id, repoId: event.repoId };
        });
    }
}
