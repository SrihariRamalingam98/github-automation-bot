import { DataSource, QueryFailedError } from 'typeorm';
import { DatabaseService } from '../src/database/database.service';
import { DatabaseError } from '../src/common/exceptions/database.exception';
describe('QueryRunner transaction boundaries', () => {
    function setup() {
        const calls: string[] = [];
        const runner = {
            manager: {},
            isTransactionActive: true,
            connect: jest.fn(async () => {
                calls.push('connect');
            }),
            startTransaction: jest.fn(async () => {
                calls.push('begin');
            }),
            commitTransaction: jest.fn(async () => {
                calls.push('commit');
            }),
            rollbackTransaction: jest.fn(async () => {
                calls.push('rollback');
            }),
            release: jest.fn(async () => {
                calls.push('release');
            }),
        };
        const service = new DatabaseService({
            createQueryRunner: () => runner,
        } as unknown as DataSource);
        return { service, runner, calls };
    }
    it('commits after work completes and always releases the connection', async () => {
        const { service, calls } = setup();
        expect(
            await service.transaction('test', async () => {
                calls.push('work');
                return 'saved';
            }),
        ).toBe('saved');
        expect(calls).toEqual([
            'connect',
            'begin',
            'work',
            'commit',
            'release',
        ]);
    });
    it('rolls back commit failure and preserves the original failure', async () => {
        const { service, runner, calls } = setup();
        runner.commitTransaction.mockRejectedValue(new Error('commit failed'));
        await expect(
            service.transaction('test', async () => 'saved'),
        ).rejects.toThrow('commit failed');
        expect(calls).toEqual(['connect', 'begin', 'rollback', 'release']);
    });
    it('rolls back failed work and releases after rollback failure', async () => {
        const { service, runner } = setup();
        runner.rollbackTransaction.mockRejectedValue(
            new Error('rollback failed'),
        );
        await expect(
            service.transaction('test', async () => {
                throw new Error('original');
            }),
        ).rejects.toThrow('original');
        expect(runner.release).toHaveBeenCalled();
    });
    it('translates driver failures without exposing query parameters', async () => {
        const { service } = setup();
        const driver = Object.assign(new Error('secret password and SQL'), {
            code: '23505',
        });
        await expect(
            service.execute('save', async () => {
                throw new QueryFailedError(
                    'secret sql',
                    ['secret token'],
                    driver,
                );
            }),
        ).rejects.toEqual(new DatabaseError('save', '23505'));
    });
});
