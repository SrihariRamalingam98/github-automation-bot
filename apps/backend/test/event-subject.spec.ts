import { ActionsService } from '../src/actions/actions.service';
import { EventEntity } from '../src/events/entities/event.entity';
import { EventsService } from '../src/events/events.service';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { builder, databaseStub, repository } from './helpers';

describe('Owner-scoped event subject metadata', () => {
    it.each([
        ['issues', 'issue', 'issues'],
        ['pull_request', 'pull_request', 'pull'],
    ])(
        'returns a canonical GitHub link for %s without exposing raw payloads',
        async (type, item, path) => {
            const query = builder();
            query.getMany.mockResolvedValue([
                {
                    id: '1',
                    repoId: '9',
                    eventType: type,
                    repository: {
                        fullName: 'owner/repo',
                        webhookSecret: 'private-hook-secret',
                    },
                    payload: {
                        [item]: {
                            number: 5,
                            title: 'Bug <script>',
                            html_url: 'javascript:alert(1)',
                            body: 'private-body',
                        },
                        sender: { privateToken: 'must-not-return' },
                    },
                    actions: [],
                },
            ]);
            const service = new EventsService(
                repository<EventEntity>({ createQueryBuilder: () => query }),
                repository<RepositoryEntity>({}),
                databaseStub(),
                {} as ActionsService,
            );
            const result = await service.list('42', { repoId: '9' });
            expect(result[0]).toMatchObject({
                subject_number: 5,
                subject_title: 'Bug <script>',
                subject_url: `https://github.com/owner/repo/${path}/5`,
                repository_url: 'https://github.com/owner/repo',
            });
            expect(query.where).toHaveBeenCalledWith('repo.ownerId=:userId', {
                userId: '42',
            });
            expect(JSON.stringify(result)).not.toMatch(
                /private-hook-secret|private-body|must-not-return|javascript:|"payload"/,
            );
        },
    );
    it('keeps legacy or non-issue events usable without inventing an issue link', async () => {
        const query = builder();
        query.getMany.mockResolvedValue([
            {
                id: '1',
                eventType: 'push',
                repository: { fullName: 'owner/repo' },
                actions: [],
            },
        ]);
        const service = new EventsService(
            repository<EventEntity>({ createQueryBuilder: () => query }),
            repository<RepositoryEntity>({}),
            databaseStub(),
            {} as ActionsService,
        );
        expect((await service.list('42', {}))[0]).toMatchObject({
            subject_number: null,
            subject_title: null,
            subject_url: null,
            repository_url: 'https://github.com/owner/repo',
        });
    });
});
