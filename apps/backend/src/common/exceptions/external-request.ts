import { UpstreamError } from './upstream.exception';

export function retryDelay(response: Response): number {
    const header = response.headers.get('retry-after') || '';
    const delay = /^\d+(\.\d+)?$/.test(header)
        ? Number(header)
        : Math.max(0, (Date.parse(header) - Date.now()) / 1000) || 0;
    const reset =
        response.headers.get('x-ratelimit-remaining') === '0'
            ? Number(response.headers.get('x-ratelimit-reset')) -
              Date.now() / 1000
            : 0;
    return Math.ceil(Math.max(0, delay, Number.isFinite(reset) ? reset : 0));
}
export async function externalRequest(
    service: string,
    url: string,
    options: RequestInit,
    operation?: string,
): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, {
            ...options,
            redirect: 'error',
            signal: AbortSignal.timeout(15000),
        });
    } catch (error) {
        const name =
            error && typeof error === 'object' && 'name' in error
                ? error.name
                : undefined;
        const timeout = name === 'TimeoutError' || name === 'AbortError';
        throw new UpstreamError(
            service,
            0,
            0,
            operation,
            timeout ? 'timeout' : 'network',
        );
    }
    if (!response.ok)
        throw new UpstreamError(
            service,
            response.status,
            retryDelay(response),
            operation,
        );
    return response;
}
export async function externalJson<T>(
    service: string,
    response: Response,
    operation?: string,
): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw new UpstreamError(service, 502, 0, operation, 'invalid_response');
    }
}
