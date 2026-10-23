import { ActionsService } from '../src/actions/actions.service';
import { ActionEntity } from '../src/actions/entities/action.entity';
import { UpstreamError } from '../src/common/exceptions/upstream.exception';
import { databaseStub, repository, manager } from './helpers';
describe('Action retry isolation', () => {
    const service = new ActionsService(
        repository<ActionEntity>({}),
        databaseStub(),
    );
    it('never repeats completed or skipped actions', async () => {
        for (const status of ['ok', 'skipped']) {
            const action = jest.fn();
            const store = {
                findOneBy: jest.fn().mockResolvedValue({ status }),
            };
            await service.once(
                manager({ getRepository: () => store }),
                '1',
                'slack:2',
                action,
            );
            expect(action).not.toHaveBeenCalled();
        }
    });
    it('records failed attempts and allows a later retry', async () => {
        const store = {
            findOneBy: jest.fn().mockResolvedValue(null),
            upsert: jest.fn(),
        };
        const action = jest
            .fn()
            .mockRejectedValueOnce(new UpstreamError('Slack', 429, 60))
            .mockResolvedValueOnce('Completed');
        const transaction = manager({ getRepository: () => store });
        await expect(
            service.once(transaction, '1', 'slack:2', action),
        ).rejects.toEqual(new UpstreamError('Slack', 429, 60));
        await service.once(transaction, '1', 'slack:2', action);
        expect(action).toHaveBeenCalledTimes(2);
        expect(store.upsert).toHaveBeenLastCalledWith(
            {
                eventId: '1',
                kind: 'slack:2',
                status: 'ok',
                detail: 'Completed',
            },
            ['eventId', 'kind'],
        );
    });
});
