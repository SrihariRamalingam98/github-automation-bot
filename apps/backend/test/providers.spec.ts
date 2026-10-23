import { GithubService } from '../src/github/github.service';
import { SlackService } from '../src/slack/slack.service';
import { AppConfig } from '../src/config/config.module';
import { UpstreamError } from '../src/common/exceptions/upstream.exception';
const config = {
    slackUrl: 'https://hooks.slack.com/services/test/test/test',
} as AppConfig;
describe('External APIs (mocked fetch)', () => {
    afterEach(() => jest.restoreAllMocks());
    it('sends authenticated GitHub label requests', async () => {
        const request = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('[]', { status: 200 }));
        await new GithubService(config).request(
            'POST',
            '/repos/test/repo/issues/1/labels',
            'fake-token',
            { labels: ['bug'] },
        );
        expect(request).toHaveBeenCalledWith(
            'https://api.github.com/repos/test/repo/issues/1/labels',
            expect.objectContaining({
                method: 'POST',
                body: '{"labels":["bug"]}',
                redirect: 'error',
                headers: expect.objectContaining({
                    Authorization: 'Bearer fake-token',
                }),
            }),
        );
    });
    it('honors rate limit backoff without including upstream bodies', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('secret upstream content', {
                status: 429,
                headers: { 'retry-after': '120' },
            }),
        );
        await expect(
            new GithubService(config).request('GET', '/user', 'fake'),
        ).rejects.toEqual(new UpstreamError('GitHub', 429, 120));
    });
    it('preserves webhook failure context without upstream response content', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('private upstream validation details', {
                status: 422,
            }),
        );
        await expect(
            new GithubService(config).request(
                'POST',
                '/repos/test/repo/hooks',
                'fake-token',
                { config: { url: 'https://example.com/webhooks/github/1' } },
                'webhook_create',
            ),
        ).rejects.toEqual(
            new UpstreamError('GitHub', 422, 0, 'webhook_create'),
        );
    });
    it('sends Slack payloads and records retry-after on failure', async () => {
        const fetch = jest
            .spyOn(globalThis, 'fetch')
            .mockResolvedValue(new Response('ok'));
        expect(await new SlackService(config).send('test message')).toBe(
            'Slack notification sent',
        );
        expect(fetch).toHaveBeenCalledWith(
            config.slackUrl,
            expect.objectContaining({ body: '{"text":"test message"}' }),
        );
        fetch.mockResolvedValue(
            new Response('', { status: 429, headers: { 'retry-after': '60' } }),
        );
        await expect(new SlackService(config).send('test')).rejects.toEqual(
            new UpstreamError('Slack', 429, 60),
        );
    });
    it('reports Slack as skipped when unconfigured', async () => {
        const fetch = jest.spyOn(globalThis, 'fetch');
        expect(await new SlackService({} as AppConfig).send('test')).toMatch(
            /^Skipped:/,
        );
        expect(fetch).not.toHaveBeenCalled();
    });
    it('converts network timeouts into safe retryable upstream errors', async () => {
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(
            new Error('private URL and bearer token'),
        );
        try {
            await new GithubService(config).request('GET', '/user', 'fake');
            throw new Error('expected failure');
        } catch (error) {
            expect(error).toBeInstanceOf(UpstreamError);
            expect((error as UpstreamError).retryable).toBe(true);
            expect((error as Error).message).not.toContain('bearer token');
        }
    });
    it('rejects OAuth error bodies without returning upstream details', async () => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'private provider details' })),
        );
        await expect(
            new GithubService(config).exchange('fake-code'),
        ).rejects.toThrow('GitHub OAuth authorization failed');
    });
});
