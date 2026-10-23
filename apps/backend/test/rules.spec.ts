import { matchesRule } from '../src/rules/rule-matcher';
import { RulesService } from '../src/rules/rules.service';
import { RuleEntity } from '../src/rules/entities/rule.entity';
import { RepositoriesService } from '../src/repositories/repositories.service';
import { databaseStub, repository } from './helpers';
const rule = {
    id: '1',
    repoId: '2',
    keyword: 'bug',
    label: 'bug',
    enabled: true,
    slackEnabled: true,
    eventType: 'issues.opened',
};
describe('Rule matching', () => {
    it('matches Bug in Login API case-insensitively', () => {
        expect(
            matchesRule(rule, 'issues', 'opened', {
                issue: {
                    title: 'Bug in Login API',
                    number: 1,
                    html_url: 'https://example.test/1',
                },
            }),
        ).toBe(true);
    });
    it('ignores disabled rules and wrong event actions or keywords', () => {
        expect(
            matchesRule({ ...rule, enabled: false }, 'issues', 'opened', {}),
        ).toBe(false);
        expect(matchesRule(rule, 'issues', 'closed', {})).toBe(false);
        expect(matchesRule(rule, 'push', '', {})).toBe(false);
        expect(
            matchesRule(rule, 'issues', 'opened', {
                issue: { title: 'feature', number: 1, html_url: '' },
            }),
        ).toBe(false);
    });
    it('supports pull requests and push head commit matching', () => {
        expect(
            matchesRule(
                { ...rule, eventType: 'pull_request.opened' },
                'pull_request',
                'opened',
                { pull_request: { title: 'bug fix', number: 1, html_url: '' } },
            ),
        ).toBe(true);
        expect(
            matchesRule({ ...rule, eventType: 'push' }, 'push', '', {
                head_commit: { message: 'Fix BUG' },
            }),
        ).toBe(true);
    });
    it('checks repository ownership before persistence', async () => {
        const owned = jest.fn().mockRejectedValue(new Error('not owned'));
        const save = jest.fn();
        const service = new RulesService(
            repository<RuleEntity>({ save }),
            databaseStub(),
            { owned } as unknown as RepositoriesService,
        );
        await expect(
            service.save('other', {
                repoId: '2',
                keyword: 'bug',
                label: 'bug',
                eventType: 'issues.opened',
                slackEnabled: true,
                enabled: true,
            }),
        ).rejects.toThrow('not owned');
        expect(save).not.toHaveBeenCalled();
    });
});
