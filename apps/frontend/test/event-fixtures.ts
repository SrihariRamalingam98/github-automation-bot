import { BotEvent } from '../src/app/core/models/api.models';
import { EventHistoryRow, EventPage } from '../src/app/core/models/event-history';

// Existing tests consume the server's paginated contract; no grouping runs in the client.
export function historyRow(value: Partial<BotEvent>, deliveries?: BotEvent[]): EventHistoryRow {
    const event: BotEvent = {
        id: '1',
        repo_id: '9',
        delivery_id: 'delivery',
        full_name: 'owner/repo',
        event_type: 'issues',
        action: 'opened',
        status: 'done',
        attempts: 1,
        next_attempt_at: null,
        processed_at: null,
        error: null,
        received_at: null,
        actions: [],
        ...value,
    };
    const history = deliveries || [event];
    return {
        ...event,
        key: `group:${event.id}`,
        latest_id: event.id,
        snapshot: '100',
        deliveries: history,
        delivery_count: history.length,
        history_next_cursor: null,
        activity_label: history.map((entry) => `${entry.event_type}.${entry.action}`).join(' · '),
        action_count: history.reduce((count, entry) => count + entry.actions.length, 0),
    };
}

export function eventPage(items: EventHistoryRow[]): EventPage<EventHistoryRow> {
    return { items, page_size: 10, has_more: false, next_cursor: null, snapshot: '100' };
}
