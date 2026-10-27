import type { EventEntity } from './entities/event.entity';

export function presentEvent(event: EventEntity) {
    const item =
        event.eventType === 'issues'
            ? event.payload?.issue
            : event.eventType === 'pull_request'
              ? event.payload?.pull_request
              : undefined;
    const number =
        item && Number.isSafeInteger(item.number) && item.number > 0
            ? item.number
            : null;
    const repositoryUrl = `https://github.com/${event.repository.fullName.split('/').map(encodeURIComponent).join('/')}`;
    return {
        id: event.id,
        repo_id: event.repoId,
        delivery_id: event.deliveryId,
        event_type: event.eventType,
        action: event.action,
        status: event.status,
        attempts: event.attempts,
        next_attempt_at: event.nextAttemptAt,
        error: event.error,
        received_at: event.receivedAt,
        processed_at: event.processedAt,
        full_name: event.repository.fullName,
        repository_url: repositoryUrl,
        subject_number: number,
        subject_title:
            number && typeof item?.title === 'string' ? item.title : null,
        subject_url: number
            ? `${repositoryUrl}/${event.eventType === 'pull_request' ? 'pull' : 'issues'}/${number}`
            : null,
        actions: event.actions.map((action) => ({
            kind: action.kind,
            status: action.status,
            detail: action.detail,
        })),
    };
}

export type EventView = ReturnType<typeof presentEvent>;

// These expressions are constants; all user values are bound query parameters.
export function historyKey(alias: string): string {
    return `CASE
        WHEN "${alias}"."event_type" = 'issues' AND jsonb_typeof("${alias}"."payload"->'issue'->'number') = 'number' AND ("${alias}"."payload"->'issue'->>'number') ~ '^[1-9][0-9]{0,15}$' AND (length("${alias}"."payload"->'issue'->>'number') < 16 OR "${alias}"."payload"->'issue'->>'number' <= '9007199254740991')
            THEN concat("${alias}"."repo_id", ':issues:', "${alias}"."payload"->'issue'->>'number')
        WHEN "${alias}"."event_type" = 'pull_request' AND jsonb_typeof("${alias}"."payload"->'pull_request'->'number') = 'number' AND ("${alias}"."payload"->'pull_request'->>'number') ~ '^[1-9][0-9]{0,15}$' AND (length("${alias}"."payload"->'pull_request'->>'number') < 16 OR "${alias}"."payload"->'pull_request'->>'number' <= '9007199254740991')
            THEN concat("${alias}"."repo_id", ':pull_request:', "${alias}"."payload"->'pull_request'->>'number')
        ELSE concat('delivery:', "${alias}"."id") END`;
}

export const eventColumns = [
    'id',
    'repoId',
    'deliveryId',
    'eventType',
    'action',
    'status',
    'attempts',
    'nextAttemptAt',
    'error',
    'receivedAt',
    'processedAt',
    'payload',
].map((field) => `event.${field}`);

const priority: Record<string, number> = {
    failed: 4,
    processing: 3,
    pending: 2,
    done: 1,
};

export function groupEventHistory(events: EventView[]) {
    const groups = new Map<string, EventView[]>();
    for (const event of events) {
        const subject =
            ['issues', 'pull_request'].includes(event.event_type) &&
            Number.isSafeInteger(event.subject_number) &&
            event.subject_number! > 0;
        const key = subject
            ? `${event.repo_id}:${event.event_type}:${event.subject_number}`
            : `delivery:${event.id}`;
        const deliveries = groups.get(key) || [];
        deliveries.push(event);
        groups.set(key, deliveries);
    }
    return [...groups].map(([key, deliveries]) => {
        const latest = deliveries[0];
        const primary = deliveries.reduce(
            (selected, event) =>
                (priority[event.status] || 0) > (priority[selected.status] || 0)
                    ? event
                    : selected,
            latest,
        );
        return {
            ...primary,
            subject_title: latest.subject_title || primary.subject_title,
            subject_url: latest.subject_url || primary.subject_url,
            key,
            deliveries,
            activity_label: [
                ...new Set(
                    deliveries.map((event) =>
                        event.action
                            ? `${event.event_type}.${event.action}`
                            : event.event_type,
                    ),
                ),
            ].join(' · '),
            action_count: deliveries.reduce(
                (count, event) => count + event.actions.length,
                0,
            ),
        };
    });
}
