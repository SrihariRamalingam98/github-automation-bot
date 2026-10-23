import { randomBytes } from 'node:crypto';
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UpstreamError } from '../common/exceptions/upstream.exception';
import { decrypt } from '../common/security';
import { AppConfig } from '../config/config.module';
import { DatabaseService } from '../database/database.service';
import { EventEntity } from '../events/entities/event.entity';
import { GithubRepo, GithubService, repoPath } from '../github/github.service';
import { RuleEntity } from '../rules/entities/rule.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RepositoryEntity } from './entities/repository.entity';

export interface RepositoryView {
    id: string;
    full_name: string;
    hook_id: string | null;
    created_at: Date | null;
}
@Injectable()
export class RepositoriesService {
    constructor(
        @InjectRepository(RepositoryEntity)
        private readonly repos: Repository<RepositoryEntity>,
        private readonly db: DatabaseService,
        private readonly github: GithubService,
        private readonly config: AppConfig,
    ) {}

    async owned(id: string, userId: string): Promise<RepositoryEntity> {
        const repo = await this.db.execute('owned_repository', () =>
            this.repos.findOneBy({
                id,
                ownerId: userId,
                disconnectedAt: IsNull(),
            }),
        );
        if (!repo) throw new NotFoundException('Repository not found');
        return repo;
    }

    async list(userId: string): Promise<RepositoryView[]> {
        const repos = await this.db.execute('list_repositories', () =>
            this.repos.find({
                where: { ownerId: userId, disconnectedAt: IsNull() },
                order: { id: 'DESC' },
            }),
        );
        return repos.map((r) => ({
            id: r.id,
            full_name: r.fullName,
            hook_id: r.hookId,
            created_at: r.createdAt,
        }));
    }

    private token(user: UserEntity): string {
        return decrypt(user.tokenEncrypted, this.config.encryptionKey);
    }

    async available(user: UserEntity): Promise<{ id: number; name: string }[]> {
        const repos: GithubRepo[] = [];
        for (let page = 1; page <= 10; page++) {
            const batch = await this.github.request<GithubRepo[]>(
                'GET',
                `/user/repos?per_page=100&affiliation=owner&sort=updated&page=${page}`,
                this.token(user),
            );
            repos.push(...batch);
            if (batch.length < 100) break;
        }
        return repos
            .filter(
                (r) => String(r.owner.id) === user.id && r.permissions?.admin,
            )
            .map((r) => ({ id: r.id, name: r.full_name }));
    }

    async connect(
        user: UserEntity,
        fullName: string,
    ): Promise<{ id: string; ok: true }> {
        const webhookBaseUrl = this.config.webhookBaseUrl || this.config.appUrl;
        let webhookUrl: URL;
        try {
            webhookUrl = new URL(webhookBaseUrl);
        } catch {
            throw new BadRequestException(
                'Set WEBHOOK_BASE_URL to a public HTTPS origin that forwards to this backend.',
            );
        }
        if (
            webhookUrl.protocol !== 'https:' ||
            /^(localhost|127\..*|\[::1\])$/i.test(webhookUrl.hostname) ||
            webhookUrl.hostname.endsWith('.localhost') ||
            webhookUrl.username ||
            webhookUrl.password ||
            webhookUrl.pathname !== '/' ||
            webhookUrl.search ||
            webhookUrl.hash
        )
            throw new BadRequestException(
                'GitHub webhooks require a public HTTPS origin. Set WEBHOOK_BASE_URL to your backend tunnel URL; localhost cannot receive GitHub webhooks.',
            );
        const remote = await this.github.request<GithubRepo>(
            'GET',
            `/repos/${repoPath(fullName)}`,
            this.token(user),
            undefined,
            'repository_lookup',
        );
        if (String(remote.owner.id) !== user.id || !remote.permissions?.admin)
            throw new ForbiddenException(
                'Connect a repository you own and administer',
            );
        const secret = randomBytes(32).toString('hex');
        const repo = await this.db.transaction(
            'reserve_repository',
            async (manager) => {
                await manager.query(
                    'SELECT pg_advisory_xact_lock($1::bigint)',
                    [String(remote.id)],
                );
                const store = manager.getRepository(RepositoryEntity);
                const existing = await store.findOneBy({
                    githubRepoId: String(remote.id),
                });
                if (
                    existing &&
                    (!existing.disconnectedAt || existing.ownerId !== user.id)
                )
                    throw new ConflictException('Repository already connected');
                return store.save(
                    store.create({
                        ...existing,
                        ownerId: user.id,
                        fullName: remote.full_name,
                        githubRepoId: String(remote.id),
                        webhookSecret: secret,
                        disconnectedAt: null,
                        hookId: null,
                    }),
                );
            },
        );
        // Remote API and local commit cannot be atomic. Pending rows remain visible for recovery.
        const hook = await this.github.request<{ id: number }>(
            'POST',
            `/repos/${repoPath(remote.full_name)}/hooks`,
            this.token(user),
            {
                name: 'web',
                active: true,
                events: ['issues', 'pull_request', 'push'],
                config: {
                    url: `${webhookUrl.origin}/webhooks/github/${repo.id}`,
                    content_type: 'json',
                    secret,
                    insecure_ssl: '0',
                },
            },
            'webhook_create',
        );
        await this.db.transaction('complete_repository', async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [
                repo.id,
            ]);
            const current = await manager
                .getRepository(RepositoryEntity)
                .findOneBy({ id: repo.id, disconnectedAt: IsNull() });
            if (!current)
                throw new ConflictException(
                    'Repository disconnected during hook registration. Remove any orphaned GitHub hook before reconnecting.',
                );
            await manager.update(RepositoryEntity, repo.id, {
                hookId: String(hook.id),
            });
            const rules = manager.getRepository(RuleEntity);
            if (!(await rules.existsBy({ repoId: repo.id })))
                await rules.insert({
                    repoId: repo.id,
                    keyword: 'bug',
                    label: 'bug',
                });
        });
        return { id: repo.id, ok: true };
    }

    async labels(
        user: UserEntity,
        id: string,
    ): Promise<{ name: string; color: string }[]> {
        const repo = await this.owned(id, user.id);
        return this.github.request(
            'GET',
            `/repos/${repoPath(repo.fullName)}/labels?per_page=100`,
            this.token(user),
        );
    }

    async disconnect(user: UserEntity, id: string): Promise<{ ok: true }> {
        await this.owned(id, user.id);
        await this.db.transaction('disconnect_repository', async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [
                id,
            ]);
            const store = manager.getRepository(RepositoryEntity);
            const repo = await store.findOneBy({
                id,
                ownerId: user.id,
                disconnectedAt: IsNull(),
            });
            if (!repo) throw new NotFoundException('Repository not found');
            if (repo.hookId) {
                try {
                    await this.github.request(
                        'DELETE',
                        `/repos/${repoPath(repo.fullName)}/hooks/${repo.hookId}`,
                        this.token(user),
                    );
                } catch (error) {
                    if (!(
                        error instanceof UpstreamError && error.status === 404
                    ))
                        throw error;
                }
            }
            await store.update(id, {
                disconnectedAt: new Date(),
                hookId: null,
            });
            await manager.update(
                RuleEntity,
                { repoId: id },
                { enabled: false },
            );
            await manager
                .getRepository(EventEntity)
                .createQueryBuilder()
                .update()
                .set({ status: 'failed', error: 'Repository disconnected' })
                .where('repo_id=:id', { id })
                .andWhere('status IN (:...statuses)', {
                    statuses: ['pending', 'processing'],
                })
                .execute();
        });
        return { ok: true };
    }
}
