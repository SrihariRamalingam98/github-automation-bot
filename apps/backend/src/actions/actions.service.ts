import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { databaseCode } from '../common/exceptions/database.exception';
import { UpstreamError } from '../common/exceptions/upstream.exception';
import { DatabaseService } from '../database/database.service';
import { ActionEntity } from './entities/action.entity';

@Injectable()
export class ActionsService {
    private readonly logger = new Logger('Actions');

    constructor(
        @InjectRepository(ActionEntity)
        private readonly actions: Repository<ActionEntity>,
        private readonly db: DatabaseService,
    ) {}

    countSuccessful(userId: string): Promise<number> {
        return this.db.execute('count_actions', () =>
            this.actions
                .createQueryBuilder('action')
                .innerJoin('action.event', 'event')
                .innerJoin('event.repository', 'repo')
                .where('repo.ownerId=:userId', { userId })
                .andWhere('action.status=:status', { status: 'ok' })
                .getCount(),
        );
    }

    async once(
        manager: EntityManager,
        eventId: string,
        kind: string,
        action: () => Promise<string>,
        context?: { deliveryId: string; attempts: number },
    ): Promise<void> {
        const actions = manager.getRepository(ActionEntity);
        const previous = await actions.findOneBy({ eventId, kind });
        if (previous && ['ok', 'skipped'].includes(previous.status)) return;
        await actions.upsert(
            { eventId, kind, status: 'pending', detail: null },
            ['eventId', 'kind'],
        );
        try {
            const detail = await action();
            await actions.upsert(
                {
                    eventId,
                    kind,
                    status: detail.startsWith('Skipped:') ? 'skipped' : 'ok',
                    detail,
                },
                ['eventId', 'kind'],
            );
            this.logger.log(
                JSON.stringify({
                    event: 'action_completed',
                    eventId,
                    deliveryId: context?.deliveryId,
                    actionType: kind,
                    attempts: context?.attempts,
                    status: detail.startsWith('Skipped:') ? 'skipped' : 'ok',
                }),
            );
        } catch (error) {
            if (databaseCode(error)) throw error;
            await actions.upsert(
                {
                    eventId,
                    kind,
                    status: 'failed',
                    detail:
                        error instanceof UpstreamError
                            ? error.message
                            : 'Action failed or timed out',
                },
                ['eventId', 'kind'],
            );
            this.logger.warn(
                JSON.stringify({
                    event: 'action_failed',
                    eventId,
                    deliveryId: context?.deliveryId,
                    actionType: kind,
                    attempts: context?.attempts,
                    status: 'failed',
                    errorCategory:
                        error instanceof UpstreamError
                            ? error.category
                            : 'processing',
                    upstreamStatus:
                        error instanceof UpstreamError
                            ? error.status
                            : undefined,
                }),
            );
            throw error;
        }
    }
}
