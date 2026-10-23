import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ActionsService } from '../actions/actions.service';
import { EventPayload } from '../common/interfaces/event-payload.interface';
import { DatabaseService } from '../database/database.service';
import { RepositoryEntity } from '../repositories/entities/repository.entity';
import { EventFilters } from './dto/event-filters.dto';
import { EventEntity } from './entities/event.entity';

export interface Overview {
    repositories: number;
    events: number;
    successful_actions: number;
    failures: number;
}
@Injectable()
export class EventsService {
    constructor(
        @InjectRepository(EventEntity)
        private readonly events: Repository<EventEntity>,
        @InjectRepository(RepositoryEntity)
        private readonly repos: Repository<RepositoryEntity>,
        private readonly db: DatabaseService,
        private readonly actions: ActionsService,
    ) {}

    async ingest(
        repoId: string,
        deliveryId: string,
        eventType: string,
        payload: EventPayload,
    ): Promise<{ received: true; duplicate: boolean }> {
        return this.db.transaction('ingest_webhook', async (manager) => {
            const result = await manager
                .getRepository(EventEntity)
                .createQueryBuilder()
                .insert()
                .values({
                    repoId,
                    deliveryId,
                    eventType,
                    action: payload.action || '',
                    payload,
                })
                .onConflict('("delivery_id") DO NOTHING')
                .returning('id')
                .updateEntity(false)
                .execute();
            // PostgreSQL RETURNING rows are authoritative; TypeORM may keep an undefined identifier on conflict.
            const inserted: unknown = result.raw;
            if (!Array.isArray(inserted))
                throw new Error('Unexpected event insertion result');
            return {
                received: true,
                duplicate: inserted.length === 0,
            };
        });
    }

    async list(userId: string, filters: EventFilters) {
        const events = await this.db.execute('list_events', async () => {
            const query = this.events
                .createQueryBuilder('event')
                .select([
                    'event.id',
                    'event.repoId',
                    'event.deliveryId',
                    'event.eventType',
                    'event.action',
                    'event.status',
                    'event.attempts',
                    'event.nextAttemptAt',
                    'event.error',
                    'event.receivedAt',
                    'event.processedAt',
                ])
                .innerJoinAndSelect('event.repository', 'repo')
                .leftJoinAndSelect('event.actions', 'action')
                .where('repo.ownerId=:userId', { userId });
            if (filters.type)
                query.andWhere('event.eventType=:type', { type: filters.type });
            if (filters.status)
                query.andWhere('event.status=:status', {
                    status: filters.status,
                });
            if (filters.repoId)
                query.andWhere('event.repoId=:repoId', {
                    repoId: filters.repoId,
                });
            if (filters.before)
                query.andWhere('event.id<:before', { before: filters.before });
            return query.orderBy('event.id', 'DESC').take(100).getMany();
        });
        return events.map((e) => ({
            id: e.id,
            repo_id: e.repoId,
            delivery_id: e.deliveryId,
            event_type: e.eventType,
            action: e.action,
            status: e.status,
            attempts: e.attempts,
            next_attempt_at: e.nextAttemptAt,
            error: e.error,
            received_at: e.receivedAt,
            processed_at: e.processedAt,
            full_name: e.repository.fullName,
            actions: e.actions.map((a) => ({
                kind: a.kind,
                status: a.status,
                detail: a.detail,
            })),
        }));
    }

    async overview(userId: string): Promise<Overview> {
        return this.db.execute('event_overview', async () => {
            const owned = () =>
                this.events
                    .createQueryBuilder('event')
                    .innerJoin('event.repository', 'repo')
                    .where('repo.ownerId=:userId', { userId });
            const [repositories, events, successful_actions, failures] =
                await Promise.all([
                    this.repos.countBy({
                        ownerId: userId,
                        disconnectedAt: IsNull(),
                    }),
                    owned().getCount(),
                    this.actions.countSuccessful(userId),
                    owned()
                        .andWhere('event.status=:status', { status: 'failed' })
                        .getCount(),
                ]);
            return { repositories, events, successful_actions, failures };
        });
    }
}
