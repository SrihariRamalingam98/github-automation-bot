export interface CurrentUser {
    login: string;
    avatar: string | null;
    csrfToken: string;
}
export interface Repository {
    id: string;
    full_name: string;
    hook_id: string | null;
    created_at: string | null;
}
export interface AvailableRepository {
    id: number;
    name: string;
}
export interface Label {
    name: string;
    color: string;
}
export interface Rule {
    id: string;
    repo_id: string;
    keyword: string;
    label: string;
    slack_enabled: boolean;
    enabled: boolean;
    event_type: string;
}
export interface RuleInput {
    repoId: string;
    keyword: string;
    label: string;
    slackEnabled: boolean;
    enabled: boolean;
    eventType: string;
}
export interface EventAction {
    kind: string;
    status: string;
    detail: string | null;
}
export interface BotEvent {
    subject_number?: number | null;
    subject_title?: string | null;
    subject_url?: string | null;
    repository_url?: string;
    id: string;
    repo_id: string;
    delivery_id: string;
    full_name: string;
    event_type: string;
    action: string | null;
    status: string;
    attempts: number;
    next_attempt_at: string | null;
    processed_at: string | null;
    error: string | null;
    received_at: string | null;
    actions: EventAction[];
}
export interface Overview {
    repositories: number;
    events: number;
    successful_actions: number;
    failures: number;
}
