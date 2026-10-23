import {
    BadRequestException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventPayload } from '../common/interfaces/event-payload.interface';
import { isWebhookSignature, verifyWebhook } from '../common/security';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { RepositoryEntity } from '../repositories/entities/repository.entity';

@Injectable()
export class WebhooksService {
    constructor(
        @InjectRepository(RepositoryEntity)
        private readonly repos: Repository<RepositoryEntity>,
        private readonly db: DatabaseService,
        private readonly events: EventsService,
    ) {}

    async receive(
        repoId: string,
        raw: Buffer,
        signature: string,
        delivery: string,
        event: string,
    ): Promise<object> {
        if (!isWebhookSignature(signature))
            throw new UnauthorizedException('Invalid signature');
        const repo = await this.db.execute('webhook_repository', () =>
            this.repos
                .createQueryBuilder('repo')
                .addSelect('repo.webhookSecret')
                .where('repo.id=:repoId', { repoId })
                .andWhere('repo.disconnectedAt IS NULL')
                .getOne(),
        );
        if (!repo) throw new UnauthorizedException('Invalid signature');
        if (!verifyWebhook(raw, signature, repo.webhookSecret))
            throw new UnauthorizedException('Invalid signature');
        if (!/^[a-f0-9-]{16,64}$/i.test(delivery))
            throw new BadRequestException('Invalid delivery ID');
        if (!['issues', 'pull_request', 'push', 'ping'].includes(event))
            return { ignored: true };
        const payload = this.parse(raw, repo.githubRepoId);
        if (event === 'ping') return { pong: true };
        return this.events.ingest(repo.id, delivery, event, payload);
    }

    private parse(raw: Buffer, repositoryId: string): EventPayload {
        let value: unknown;
        try {
            value = JSON.parse(raw.toString('utf8'));
        } catch {
            throw new BadRequestException('Invalid JSON');
        }
        if (!value || typeof value !== 'object')
            throw new BadRequestException('Invalid webhook payload');
        const payload = value as EventPayload;
        if (String(payload.repository?.id) !== repositoryId)
            throw new BadRequestException('Repository mismatch');
        if (payload.action !== undefined && typeof payload.action !== 'string')
            throw new BadRequestException('Invalid event action');
        for (const item of [payload.issue, payload.pull_request]) {
            if (
                item &&
                (!Number.isSafeInteger(item.number) ||
                    item.number <= 0 ||
                    typeof item.title !== 'string' ||
                    typeof item.html_url !== 'string')
            )
                throw new BadRequestException(
                    'Invalid issue or pull request payload',
                );
        }
        if (
            payload.head_commit &&
            typeof payload.head_commit.message !== 'string'
        )
            throw new BadRequestException('Invalid commit payload');
        return payload;
    }
}
