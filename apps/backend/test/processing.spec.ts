import { EventEntity } from '../src/events/entities/event.entity';
import { ActionEntity } from '../src/actions/entities/action.entity';
import { RuleEntity } from '../src/rules/entities/rule.entity';
import { ActionsService } from '../src/actions/actions.service';
import { EventProcessorService } from '../src/workers/event-processor.service';
import { EventQueueService } from '../src/workers/event-queue.service';
import { GithubService } from '../src/github/github.service';
import { SlackService } from '../src/slack/slack.service';
import { AppConfig } from '../src/config/config.module';
import { UpstreamError } from '../src/common/exceptions/upstream.exception';
import { encrypt } from '../src/common/security';
import { builder, databaseStub, manager, repository } from './helpers';
describe('Durable processing and retry workflow', () => {
    it('keeps a successful label action across a Slack retry', async () => {
        const key = Buffer.alloc(32, 1);
        const event = {
            id: '1',
            repoId: '2',
            eventType: 'issues',
            action: 'opened',
            status: 'processing',
            attempts: 1,
            payload: {
                issue: {
                    title: 'Bug in Login API',
                    number: 5,
                    html_url: 'https://example.test/5',
                },
            },
            repository: {
                fullName: 'test/repo',
                disconnectedAt: null,
                owner: { tokenEncrypted: encrypt('fake-token', key) },
            },
        };
        const query = builder();
        query.getOne.mockImplementation(async () =>
            event.status === 'processing' ? event : null,
        );
        const events = {
            createQueryBuilder: () => query,
            update: jest.fn(
                async (_id: string, value: Partial<typeof event>) => {
                    Object.assign(event, value);
                },
            ),
        };
        const rules = {
            find: jest.fn().mockResolvedValue([
                {
                    id: '3',
                    repoId: '2',
                    eventType: 'issues.opened',
                    enabled: true,
                    keyword: 'bug',
                    label: 'bug',
                    slackEnabled: true,
                },
            ]),
        };
        const completed = new Map<string, { status: string }>();
        const actions = {
            findOneBy: jest.fn(async ({ kind }: { kind: string }) =>
                completed.get(kind),
            ),
            upsert: jest.fn(async (value: { kind: string; status: string }) => {
                completed.set(value.kind, value);
            }),
        };
        const getRepository = (target: unknown) =>
            target === EventEntity
                ? events
                : target === RuleEntity
                  ? rules
                  : actions;
        const transaction = manager({ getRepository, query: jest.fn() });
        const db = databaseStub(transaction);
        const github = { request: jest.fn().mockResolvedValue([]) };
        const slack = {
            send: jest
                .fn()
                .mockRejectedValueOnce(new UpstreamError('Slack', 429, 60))
                .mockResolvedValueOnce('Slack notification sent'),
        };
        const processor = new EventProcessorService(
            db,
            github as unknown as GithubService,
            slack as unknown as SlackService,
            new ActionsService(repository<ActionEntity>({}), db),
            { encryptionKey: key } as AppConfig,
        );
        const before = Date.now();
        await processor.process({ id: '1', repoId: '2' });
        expect(event.status).toBe('pending');
        expect(events.update).toHaveBeenLastCalledWith(
            '1',
            expect.objectContaining({ nextAttemptAt: expect.any(Date) }),
        );
        const retry = events.update.mock.calls[0][1] as { nextAttemptAt: Date };
        expect(retry.nextAttemptAt.getTime() - before).toBeGreaterThanOrEqual(
            60000,
        );
        event.status = 'processing';
        event.attempts = 2;
        await processor.process({ id: '1', repoId: '2' });
        expect(event.status).toBe('done');
        expect(github.request).toHaveBeenCalledTimes(1);
        expect(slack.send).toHaveBeenCalledTimes(2);
        expect(completed.get('label:3')?.status).toBe('ok');
        expect(completed.get('slack:3')?.status).toBe('ok');
    });
    it('claims events with a skip-locked transaction and increments the durable attempt', async () => {
        const query = builder();
        query.getOne.mockResolvedValue({ id: '1', repoId: '2', attempts: 3 });
        const update = jest.fn();
        const db = databaseStub(
            manager({
                getRepository: () => ({
                    createQueryBuilder: () => query,
                    update,
                }),
            }),
        );
        const queue = new EventQueueService(repository<EventEntity>({}), db, {
            eventMaxAttempts: 5,
        } as AppConfig);
        expect(await queue.claim()).toEqual({ id: '1', repoId: '2' });
        expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
        expect(query.setOnLocked).toHaveBeenCalledWith('skip_locked');
        expect(update).toHaveBeenCalledWith(
            '1',
            expect.objectContaining({ status: 'processing', attempts: 4 }),
        );
    });
});
