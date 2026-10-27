export interface EventPayload {
    action?: string;
    sender?: { login: string };
    repository?: { id: number };
    issue?: {
        title: string;
        number: number;
        html_url: string;
        user?: { login: string };
    };
    pull_request?: {
        title: string;
        number: number;
        html_url: string;
        user?: { login: string };
    };
    head_commit?: { message: string };
    ref?: string;
}
