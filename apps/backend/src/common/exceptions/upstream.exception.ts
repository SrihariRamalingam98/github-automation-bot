export class UpstreamError extends Error {
    readonly retryable: boolean;

    constructor(
        readonly service: string,
        readonly status: number,
        readonly retryAfterSeconds = 0,
        readonly operation?: string,
        readonly category:
            'http' | 'network' | 'timeout' | 'invalid_response' = status === 0
            ? 'network'
            : 'http',
    ) {
        super(
            `${service} request failed (${status === 0 ? 'connection failure or timeout' : `HTTP ${status}`})`,
        );
        this.retryable =
            status === 0 ||
            status >= 500 ||
            [408, 429].includes(status) ||
            (status === 403 && retryAfterSeconds > 0);
    }
}
