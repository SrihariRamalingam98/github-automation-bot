import { createHmac } from 'node:crypto';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { EventsService } from '../src/events/events.service';
import { EventEntity } from '../src/events/entities/event.entity';
import { ActionsService } from '../src/actions/actions.service';
import { builder, databaseStub, repository, manager } from './helpers';
describe('Durable webhook ingestion', () => {
    const body = Buffer.from('{"repository":{"id":42},"action":"opened"}');
    const signature =
        'sha256=' + createHmac('sha256', 'test').update(body).digest('hex');
    function setup() {
        const query = builder();
        query.getOne.mockResolvedValue({
            id: '1',
            githubRepoId: '42',
            webhookSecret: 'test',
        });
        const ingest = jest
            .fn()
            .mockResolvedValue({ received: true, duplicate: false });
        const service = new WebhooksService(
            repository<RepositoryEntity>({ createQueryBuilder: () => query }),
            databaseStub(),
            { ingest } as unknown as EventsService,
        );
        return { service, ingest };
    }
    it('persists only after signature validation and detects redeliveries', async () => {
        const { service, ingest } = setup();
        expect(
            await service.receive(
                '1',
                body,
                signature,
                'a'.repeat(32),
                'issues',
            ),
        ).toEqual({ received: true, duplicate: false });
        expect(ingest).toHaveBeenCalledWith(
            '1',
            'a'.repeat(32),
            'issues',
            expect.objectContaining({ action: 'opened' }),
        );
        ingest.mockResolvedValue({ received: true, duplicate: true });
        expect(
            await service.receive(
                '1',
                body,
                signature,
                'a'.repeat(32),
                'issues',
            ),
        ).toEqual({ received: true, duplicate: true });
    });
    it('does not acknowledge a failed commit', async () => {
        const { service, ingest } = setup();
        ingest.mockRejectedValue(new Error('commit failed'));
        await expect(
            service.receive('1', body, signature, 'a'.repeat(32), 'issues'),
        ).rejects.toThrow('commit failed');
    });
    it('checks signature before parsing malformed JSON', async () => {
        const { service, ingest } = setup();
        await expect(
            service.receive(
                '1',
                Buffer.from('{bad'),
                'bad',
                'a'.repeat(32),
                'issues',
            ),
        ).rejects.toThrow('Invalid signature');
        expect(ingest).not.toHaveBeenCalled();
    });
    it('rejects a signed repository mismatch', async () => {
        const { service } = setup();
        const raw = Buffer.from('{"repository":{"id":43}}');
        const sig =
            'sha256=' + createHmac('sha256', 'test').update(raw).digest('hex');
        await expect(
            service.receive('1', raw, sig, 'a'.repeat(32), 'issues'),
        ).rejects.toThrow('Repository mismatch');
    });
    it('uses a delivery-specific database conflict clause', async () => {
        const query = builder();
        query.execute.mockResolvedValue({ raw: [], identifiers: [undefined] });
        const db = databaseStub(
            manager({
                getRepository: () => ({ createQueryBuilder: () => query }),
            }),
        );
        const events = new EventsService(
            repository<EventEntity>({}),
            repository<RepositoryEntity>({}),
            db,
            {} as ActionsService,
        );
        expect(await events.ingest('1', 'delivery', 'push', {})).toEqual({
            received: true,
            duplicate: true,
        });
        expect(query.onConflict).toHaveBeenCalledWith(
            '("delivery_id") DO NOTHING',
        );
    });
    it('rejects a signature for an unknown or disconnected repository without ingesting', async () => {
        const query = builder();
        query.getOne.mockResolvedValue(null);
        const ingest = jest.fn();
        const service = new WebhooksService(
            repository<RepositoryEntity>({ createQueryBuilder: () => query }),
            databaseStub(),
            { ingest } as unknown as EventsService,
        );
        await expect(
            service.receive('1', body, signature, 'a'.repeat(32), 'issues'),
        ).rejects.toMatchObject({ status: 401 });
        expect(ingest).not.toHaveBeenCalled();
    });
});
