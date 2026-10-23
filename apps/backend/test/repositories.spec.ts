import { RepositoriesService } from '../src/repositories/repositories.service';
import { GithubService } from '../src/github/github.service';
import { AppConfig } from '../src/config/config.module';
import { UserEntity } from '../src/users/entities/user.entity';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { encrypt } from '../src/common/security';
import { databaseStub, repository, manager, builder } from './helpers';
const key = Buffer.alloc(32, 1);
const user = {
    id: '1',
    login: 'test',
    avatar: null,
    tokenEncrypted: encrypt('fake-token', key),
} as UserEntity;
describe('Repository authorization and disconnect', () => {
    it.each([
        'http://localhost:4200',
        'https://localhost',
        'https://127.0.0.1',
        'https://[::1]',
        'invalid-url',
    ])(
        'rejects unusable webhook origin %s before writes or remote calls',
        async (appUrl) => {
            const db = databaseStub();
            const github = { request: jest.fn() };
            const service = new RepositoriesService(
                repository<RepositoryEntity>({}),
                db,
                github as unknown as GithubService,
                { appUrl } as AppConfig,
            );
            await expect(service.connect(user, 'test/repo')).rejects.toThrow(
                'WEBHOOK_BASE_URL',
            );
            expect(db.transaction).not.toHaveBeenCalled();
            expect(github.request).not.toHaveBeenCalled();
        },
    );
    it('uses the public webhook origin while keeping local OAuth origin', async () => {
        const store = {
            findOneBy: jest
                .fn()
                .mockResolvedValueOnce(null)
                .mockResolvedValue({ id: '12' }),
            create: jest.fn((value: object) => value),
            save: jest.fn().mockResolvedValue({ id: '12' }),
            existsBy: jest.fn().mockResolvedValue(true),
        };
        const db = databaseStub(
            manager({
                query: jest.fn(),
                getRepository: () => store,
                update: jest.fn(),
            }),
        );
        const github = {
            request: jest
                .fn()
                .mockResolvedValueOnce({
                    id: 42,
                    full_name: 'test/repo',
                    owner: { id: 1 },
                    permissions: { admin: true },
                })
                .mockResolvedValueOnce({ id: 5 }),
        };
        const service = new RepositoriesService(
            repository<RepositoryEntity>({}),
            db,
            github as unknown as GithubService,
            {
                encryptionKey: key,
                appUrl: 'http://localhost:4200',
                webhookBaseUrl: 'https://tunnel.example.com',
            } as AppConfig,
        );
        await expect(service.connect(user, 'test/repo')).resolves.toEqual({
            id: '12',
            ok: true,
        });
        expect(github.request).toHaveBeenNthCalledWith(
            2,
            'POST',
            '/repos/test/repo/hooks',
            'fake-token',
            expect.objectContaining({
                config: expect.objectContaining({
                    url: 'https://tunnel.example.com/webhooks/github/12',
                }),
            }),
            'webhook_create',
        );
    });
    it('rejects connecting another account repository before database writes', async () => {
        const save = jest.fn();
        const github = {
            request: jest.fn().mockResolvedValue({
                id: 42,
                owner: { id: 2 },
                permissions: { admin: true },
            }),
        };
        const service = new RepositoriesService(
            repository<RepositoryEntity>({ save }),
            databaseStub(),
            github as unknown as GithubService,
            { encryptionKey: key, appUrl: 'https://example.com' } as AppConfig,
        );
        await expect(service.connect(user, 'other/repo')).rejects.toThrow(
            'own and administer',
        );
        expect(save).not.toHaveBeenCalled();
    });
    it('rejects disconnecting unowned repositories before any remote call', async () => {
        const findOneBy = jest.fn().mockResolvedValue(null);
        const github = { request: jest.fn() };
        const service = new RepositoriesService(
            repository<RepositoryEntity>({ findOneBy }),
            databaseStub(),
            github as unknown as GithubService,
            {} as AppConfig,
        );
        await expect(service.disconnect(user, '99')).rejects.toThrow(
            'Repository not found',
        );
        expect(findOneBy).toHaveBeenCalledWith(
            expect.objectContaining({ id: '99', ownerId: '1' }),
        );
        expect(github.request).not.toHaveBeenCalled();
    });
    it('removes a hook and disables automation without deleting history', async () => {
        const repo = {
            id: '12',
            ownerId: '1',
            fullName: 'test/repo',
            hookId: '5',
        };
        const query = builder();
        const store = {
            findOneBy: jest.fn().mockResolvedValue(repo),
            update: jest.fn(),
            createQueryBuilder: () => query,
        };
        const update = jest.fn();
        const sql = jest.fn();
        const db = databaseStub(
            manager({ getRepository: () => store, query: sql, update }),
        );
        const github = { request: jest.fn().mockResolvedValue(undefined) };
        const service = new RepositoriesService(
            repository<RepositoryEntity>(store),
            db,
            github as unknown as GithubService,
            { encryptionKey: key } as AppConfig,
        );
        await service.disconnect(user, '12');
        expect(github.request).toHaveBeenCalledWith(
            'DELETE',
            '/repos/test/repo/hooks/5',
            'fake-token',
        );
        expect(sql).toHaveBeenCalledWith(
            'SELECT pg_advisory_xact_lock($1::bigint)',
            ['12'],
        );
        expect(store.update).toHaveBeenCalledWith(
            '12',
            expect.objectContaining({ hookId: null }),
        );
        expect(update).toHaveBeenCalledWith(
            expect.any(Function),
            { repoId: '12' },
            { enabled: false },
        );
        expect(query.set).toHaveBeenCalledWith({
            status: 'failed',
            error: 'Repository disconnected',
        });
    });
});
