export interface EventPayload {
    action?: string;
    repository?: { id: number };
    issue?: { title: string; number: number; html_url: string };
    pull_request?: { title: string; number: number; html_url: string };
    head_commit?: { message: string };
    ref?: string;
}
