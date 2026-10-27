import { EventView as BotEvent } from '../src/events/event-history';
import { groupEventHistory } from '../src/events/event-history';

function event(id: string, patch: Partial<BotEvent> = {}): BotEvent {
    return {
        id,
        repo_id: '9',
        delivery_id: `delivery-${id}`,
        full_name: 'owner/repo',
        repository_url: 'https://github.com/owner/repo',
        event_type: 'issues',
        action: 'opened',
        status: 'done',
        attempts: 1,
        next_attempt_at: null,
        processed_at: null,
        error: null,
        received_at: null,
        subject_number: 5,
        subject_title: 'Bug in Login API',
        subject_url: 'https://github.com/owner/repo/issues/5',
        actions: [],
        ...patch,
    };
}

describe('Grouped issue and pull request history', () => {
    it('shows opened and labeled as one row while retaining both deliveries and actions', () => {
        const labeled = event('2', { action: 'labeled' });
        const opened = event('1', {
            actions: [{ kind: 'label:3', status: 'ok', detail: 'Added bug' }],
        });
        const rows = groupEventHistory([labeled, opened]);
        expect(rows).toHaveLength(1);
        expect(rows[0].deliveries).toEqual([labeled, opened]);
        expect(rows[0].action_count).toBe(1);
        expect(rows[0].activity_label).toContain('issues.opened');
        expect(rows[0].activity_label).toContain('issues.labeled');
    });
    it.each(['failed', 'pending', 'processing'])(
        'does not let a successful label webhook hide an opened event that is %s',
        (status) => {
            const rows = groupEventHistory([
                event('2', { action: 'labeled' }),
                event('1', {
                    status,
                    attempts: 2,
                    error: 'Slack failed',
                    next_attempt_at: new Date('2026-10-23T00:00:00Z'),
                }),
            ]);
            expect(rows[0]).toMatchObject({
                status,
                attempts: 2,
                error: 'Slack failed',
                next_attempt_at: new Date('2026-10-23T00:00:00Z'),
            });
        },
    );
    it('keeps different issues, repositories and PRs separate', () => {
        expect(
            groupEventHistory([
                event('4'),
                event('3', { subject_number: 6 }),
                event('2', { repo_id: '10' }),
                event('1', { event_type: 'pull_request' }),
            ]),
        ).toHaveLength(4);
    });
    it('retains pushes and legacy deliveries without a subject as individual rows', () => {
        expect(
            groupEventHistory([
                event('4', { event_type: 'push' }),
                event('3', { event_type: 'push' }),
                event('2', { subject_number: null }),
                event('1', { subject_number: undefined }),
            ]),
        ).toHaveLength(4);
    });
    it('uses the latest subject title and preserves the original input and bigint ordering', () => {
        const latest = event('9007199254740994', {
            action: 'edited',
            subject_title: 'Updated title',
        });
        const older = event('9007199254740993');
        const input = [latest, older];
        const row = groupEventHistory(input)[0];
        expect(row.subject_title).toBe('Updated title');
        expect(row.deliveries.map((item) => item.id)).toEqual(
            input.map((item) => item.id),
        );
        expect(latest.action).toBe('edited');
        expect(older.action).toBe('opened');
    });
});
