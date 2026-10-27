import { BotEvent } from './api.models';

export interface EventHistoryRow extends BotEvent {
    key: string;
    latest_id: string;
    snapshot: string;
    deliveries: BotEvent[];
    delivery_count: number;
    activity_label: string;
    action_count: number;
    history_next_cursor: string | null;
}

export interface EventPage<T> {
    items: T[];
    next_cursor: string | null;
    has_more: boolean;
    snapshot: string | null;
    page_size: number;
}
