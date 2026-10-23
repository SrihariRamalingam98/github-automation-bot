import { Injectable, Logger } from '@nestjs/common';
import { ActionsService } from '../actions/actions.service';
import { databaseCode } from '../common/exceptions/database.exception';
import { UpstreamError } from '../common/exceptions/upstream.exception';
import { decrypt } from '../common/security';
import { AppConfig } from '../config/config.module';
import { DatabaseService } from '../database/database.service';
import { EventEntity } from '../events/entities/event.entity';
import { GithubService, repoPath } from '../github/github.service';
import { RuleEntity } from '../rules/entities/rule.entity';
import { matchesRule } from '../rules/rule-matcher';
import { SlackService } from '../slack/slack.service';

@Injectable()
export class EventProcessorService {
    private readonly logger = new Logger('EventProcessor');

    constructor(
        private readonly db: DatabaseService,
        private readonly github: GithubService,
        private readonly slack: SlackService,
        private readonly actions: ActionsService,
        private readonly config: AppConfig,
    ) {}

    async process(claim: { id: string; repoId: string }): Promise<void> {
        await this.db.transaction('process_event', async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [
                claim.repoId,
            ]);
            const events = manager.getRepository(EventEntity);
            const event = await events
                .createQueryBuilder('event')
                .innerJoinAndSelect('event.repository', 'repo')
                .innerJoinAndSelect('repo.owner', 'user')
                .addSelect('user.tokenEncrypted')
                .where('event.id=:id AND event.status=:status', {
                    id: claim.id,
                    status: 'processing',
                })
                .setLock('pessimistic_write', undefined, ['event'])
                .getOne();
            if (!event) return;
            const context = {
                deliveryId: event.deliveryId,
                attempts: event.attempts,
            };
            let actionType: string | undefined;
            try {
                if (event.repository.disconnectedAt)
                    throw new Error('Repository disconnected');
                const rules = await manager.getRepository(RuleEntity).find({
                    where: { repoId: event.repoId, enabled: true },
                    order: { id: 'ASC' },
                });
                for (const rule of rules) {
                    if (
                        !matchesRule(
                            rule,
                            event.eventType,
                            event.action,
                            event.payload,
                        )
                    )
                        continue;
                    const item =
                        event.payload.issue || event.payload.pull_request;
                    if (item) {
                        actionType = `label:${rule.id}`;
                        await this.actions.once(
                            manager,
                            event.id,
                            `label:${rule.id}`,
                            async () => {
                                await this.github.request(
                                    'POST',
                                    `/repos/${repoPath(event.repository.fullName)}/issues/${item.number}/labels`,
                                    this.token(
                                        event.repository.owner.tokenEncrypted,
                                    ),
                                    { labels: [rule.label] },
                                );
                                return `Added ${rule.label} to #${item.number}`;
                            },
                            context,
                        );
                    }
                    if (rule.slackEnabled) {
                        actionType = `slack:${rule.id}`;
                        await this.actions.once(
                            manager,
                            event.id,
                            `slack:${rule.id}`,
                            () =>
                                this.slack.send(
                                    `GitHub ${event.eventType} matched "${rule.keyword}" in ${event.repository.fullName}: ${item?.title || event.payload.head_commit?.message || ''} ${item?.html_url || ''}`,
                                ),
                            context,
                        );
                    }
                }
                await events.update(event.id, {
                    status: 'done',
                    error: null,
                    processedAt: new Date(),
                    nextAttemptAt: null,
                });
                this.logger.log(
                    JSON.stringify({
                        event: 'event_completed',
                        eventId: event.id,
                        ...context,
                        status: 'done',
                        retryAfterSeconds: 0,
                    }),
                );
            } catch (error) {
                // A database failure aborts this transaction; leave the durable lease for recovery.
                if (databaseCode(error)) throw error;
                const terminal =
                    event.attempts >= (this.config.eventMaxAttempts ?? 5) ||
                    !!event.repository.disconnectedAt ||
                    (error instanceof UpstreamError && !error.retryable);
                const delay = Math.max(
                    Math.min(300, 2 ** event.attempts),
                    error instanceof UpstreamError
                        ? error.retryAfterSeconds
                        : 0,
                );
                const detail =
                    error instanceof UpstreamError
                        ? error.message
                        : event.repository.disconnectedAt
                          ? 'Repository disconnected'
                          : terminal
                            ? 'Processing failed; retry budget exhausted'
                            : 'Processing failed; retry scheduled';
                const nextAttemptAt = terminal
                    ? null
                    : new Date(Date.now() + Math.ceil(delay) * 1000);
                await events.update(event.id, {
                    status: terminal ? 'failed' : 'pending',
                    error: detail,
                    processedAt: terminal ? new Date() : null,
                    nextAttemptAt,
                });
                this.logger.warn(
                    JSON.stringify({
                        event: 'event_failed',
                        eventId: event.id,
                        deliveryId: event.deliveryId,
                        actionType,
                        attempts: event.attempts,
                        terminal,
                        retryAfterSeconds: terminal ? 0 : delay,
                        status: terminal ? 'failed' : 'pending',
                        errorCategory:
                            error instanceof UpstreamError
                                ? error.category
                                : event.repository.disconnectedAt
                                  ? 'disconnected'
                                  : 'processing',
                        upstreamStatus:
                            error instanceof UpstreamError
                                ? error.status
                                : undefined,
                    }),
                );
            }
        });
    }

    private token(encrypted: string): string {
        try {
            return decrypt(encrypted, this.config.encryptionKey);
        } catch {
            throw new UpstreamError('GitHub', 401);
        }
    }
}
