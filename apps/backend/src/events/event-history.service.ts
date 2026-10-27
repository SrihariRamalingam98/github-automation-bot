import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import { EventFilters } from './dto/event-filters.dto';
import { EventEntity } from './entities/event.entity';
import {
    eventColumns,
    groupEventHistory,
    historyKey,
    presentEvent,
} from './event-history';

interface GroupResult {
    key: string;
    latest_id: string;
    primary_id: string;
    delivery_count: string;
    action_count: string;
    activity_label: string;
}
const historySize = 20;
const statusPriority: Record<string, number> = {
    failed: 4,
    processing: 3,
    pending: 2,
    done: 1,
};
const prioritySql = `CASE event.status WHEN 'failed' THEN 4 WHEN 'processing' THEN 3 WHEN 'pending' THEN 2 ELSE 1 END`;

@Injectable()
export class EventHistoryService {
    private readonly logger = new Logger('EventHistory');
    constructor(private readonly db: DatabaseService) {}

    async list(userId: string, filters: EventFilters) {
        try {
            return await this.db.transaction(
                'grouped_event_history',
                async (manager) => {
                    await manager.query(
                        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
                    );
                    const limit = filters.limit ?? 10;
                    const scope = manager
                        .getRepository(EventEntity)
                        .createQueryBuilder('event')
                        .innerJoin('event.repository', 'repo')
                        .where('repo.ownerId=:userId', { userId });
                    if (filters.repoId)
                        scope.andWhere('event.repoId=:repoId', {
                            repoId: filters.repoId,
                        });
                    if (filters.type)
                        scope.andWhere('event.eventType=:type', {
                            type: filters.type,
                        });
                    const latest = await scope
                        .clone()
                        .select('MAX(event.id)', 'id')
                        .getRawOne<{ id: string | null }>();
                    const maximum = latest?.id || null;
                    const snapshot =
                        maximum &&
                        filters.snapshot &&
                        BigInt(filters.snapshot) < BigInt(maximum)
                            ? filters.snapshot
                            : maximum;
                    if (!snapshot)
                        return {
                            items: [],
                            next_cursor: null,
                            has_more: false,
                            snapshot: null,
                            page_size: limit,
                        };
                    const query = scope
                        .clone()
                        .andWhere('event.id<=:snapshot', { snapshot })
                        .leftJoin('event.actions', 'action')
                        .select(historyKey('event'), 'key')
                        .addSelect('MAX(event.id)', 'latest_id')
                        .addSelect(
                            `COALESCE(MAX(event.id) FILTER (WHERE event.status='failed'), MAX(event.id) FILTER (WHERE event.status='processing'), MAX(event.id) FILTER (WHERE event.status='pending'), MAX(event.id))`,
                            'primary_id',
                        )
                        .addSelect('COUNT(DISTINCT event.id)', 'delivery_count')
                        .addSelect('COUNT(action.id)', 'action_count')
                        .addSelect(
                            `STRING_AGG(DISTINCT CASE WHEN event.action IS NOT NULL AND event.action<>'' THEN concat(event.eventType, '.', event.action) ELSE event.eventType END, ' · ')`,
                            'activity_label',
                        )
                        .groupBy(historyKey('event'));
                    if (filters.status)
                        query.having(`MAX(${prioritySql})=:statusPriority`, {
                            statusPriority: statusPriority[filters.status],
                        });
                    if (filters.before)
                        query.andHaving('MAX(event.id)<:before', {
                            before: filters.before,
                        });
                    const results = await query
                        .orderBy('MAX(event.id)', 'DESC')
                        .limit(limit + 1)
                        .getRawMany<GroupResult>();
                    const hasMore = results.length > limit;
                    const selected = results.slice(0, limit);
                    if (!selected.length)
                        return {
                            items: [],
                            next_cursor: null,
                            has_more: false,
                            snapshot,
                            page_size: limit,
                        };
                    // Rank deliveries inside each selected group; do not split a group across main pages.
                    const ranked = manager
                        .getRepository(EventEntity)
                        .createQueryBuilder('entry')
                        .select('entry.id', 'id')
                        .addSelect(
                            `ROW_NUMBER() OVER (PARTITION BY ${historyKey('entry')} ORDER BY entry.id DESC)`,
                            'position',
                        )
                        .innerJoin('entry.repository', 'owned')
                        .where('owned.ownerId=:userId', { userId })
                        .andWhere('entry.id<=:snapshot', { snapshot })
                        .andWhere(`${historyKey('entry')} IN (:...keys)`, {
                            keys: selected.map((row) => row.key),
                        });
                    const entities = await this.details(
                        manager,
                        userId,
                        snapshot,
                    )
                        .andWhere(
                            `(event.id IN (SELECT "id" FROM (${ranked.getQuery()}) ranked WHERE "position"<=:historySize) OR event.id IN (:...primaryIds))`,
                            {
                                ...ranked.getParameters(),
                                historySize,
                                primaryIds: selected.map(
                                    (row) => row.primary_id,
                                ),
                            },
                        )
                        .orderBy('event.id', 'DESC')
                        .getMany();
                    const groups = new Map(
                        groupEventHistory(entities.map(presentEvent)).map(
                            (row) => [row.key, row],
                        ),
                    );
                    const items = selected.map((result) => {
                        const row = groups.get(result.key);
                        if (!row)
                            throw new Error(
                                'Event history snapshot is inconsistent',
                            );
                        const deliveries = row.deliveries.slice(0, historySize);
                        return {
                            ...row,
                            deliveries,
                            latest_id: result.latest_id,
                            snapshot,
                            delivery_count: Number(result.delivery_count),
                            action_count: Number(result.action_count),
                            activity_label: result.activity_label,
                            history_next_cursor:
                                Number(result.delivery_count) >
                                deliveries.length
                                    ? deliveries.at(-1)!.id
                                    : null,
                        };
                    });
                    return {
                        items,
                        has_more: hasMore,
                        next_cursor: hasMore
                            ? selected.at(-1)!.latest_id
                            : null,
                        snapshot,
                        page_size: limit,
                    };
                },
            );
        } catch (error) {
            // DatabaseService and the global filter retain safe DB metadata/request IDs.
            this.logger.warn(
                JSON.stringify({
                    event: 'event_history_failed',
                    operation: 'list',
                }),
            );
            throw error;
        }
    }

    async deliveries(userId: string, id: string, filters: EventFilters) {
        try {
            return await this.db.transaction(
                'event_delivery_history',
                async (manager) => {
                    await manager.query(
                        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
                    );
                    const anchor = await this.details(manager, userId)
                        .andWhere('event.id=:id', { id })
                        .getOne();
                    if (!anchor) throw new NotFoundException('Event not found');
                    const snapshot = filters.snapshot || id;
                    const key = groupEventHistory([presentEvent(anchor)])[0]
                        .key;
                    const limit = filters.limit ?? historySize;
                    const query = this.details(
                        manager,
                        userId,
                        snapshot,
                    ).andWhere(`${historyKey('event')}=:key`, { key });
                    if (filters.before)
                        query.andWhere('event.id<:before', {
                            before: filters.before,
                        });
                    const rows = await query
                        .orderBy('event.id', 'DESC')
                        .take(limit + 1)
                        .getMany();
                    const items = rows.slice(0, limit).map(presentEvent);
                    return {
                        items,
                        has_more: rows.length > limit,
                        next_cursor:
                            rows.length > limit ? items.at(-1)!.id : null,
                        snapshot,
                        page_size: limit,
                    };
                },
            );
        } catch (error) {
            this.logger.warn(
                JSON.stringify({
                    event: 'event_history_failed',
                    operation: 'deliveries',
                }),
            );
            throw error;
        }
    }

    private details(manager: EntityManager, userId: string, snapshot?: string) {
        const query = manager
            .getRepository(EventEntity)
            .createQueryBuilder('event')
            .select(eventColumns)
            .innerJoinAndSelect('event.repository', 'repo')
            .leftJoinAndSelect('event.actions', 'action')
            .where('repo.ownerId=:userId', { userId });
        if (snapshot) query.andWhere('event.id<=:snapshot', { snapshot });
        return query;
    }
}
