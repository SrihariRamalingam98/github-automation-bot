import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import { RepositoriesService } from '../repositories/repositories.service';
import { RuleDto } from './dto/rule.dto';
import { RuleEntity } from './entities/rule.entity';

export function ruleView(rule: RuleEntity) {
    return {
        id: rule.id,
        repo_id: rule.repoId,
        keyword: rule.keyword,
        label: rule.label,
        slack_enabled: rule.slackEnabled,
        enabled: rule.enabled,
        event_type: rule.eventType,
    };
}
@Injectable()
export class RulesService {
    constructor(
        @InjectRepository(RuleEntity)
        private readonly rules: Repository<RuleEntity>,
        private readonly db: DatabaseService,
        private readonly repos: RepositoriesService,
    ) {}

    async list(userId: string) {
        const rules = await this.db.execute('list_rules', () =>
            this.rules
                .createQueryBuilder('rule')
                .innerJoin('rule.repository', 'repo')
                .where('repo.ownerId=:userId', { userId })
                .andWhere('repo.disconnectedAt IS NULL')
                .orderBy('rule.id', 'DESC')
                .getMany(),
        );
        return rules.map(ruleView);
    }

    async save(userId: string, dto: RuleDto, id?: string) {
        await this.repos.owned(dto.repoId, userId);
        return this.db.transaction('save_rule', async (manager) => {
            const store = manager.getRepository(RuleEntity);
            let existing: RuleEntity | null = null;
            if (id) {
                existing = await store
                    .createQueryBuilder('rule')
                    .innerJoin('rule.repository', 'repo')
                    .where('rule.id=:id AND repo.ownerId=:userId', {
                        id,
                        userId,
                    })
                    .getOne();
                if (!existing) throw new NotFoundException('Rule not found');
            }
            const rule = store.create({
                ...existing,
                repoId: dto.repoId,
                keyword: dto.keyword.trim(),
                label: dto.label.trim(),
                slackEnabled: dto.slackEnabled,
                enabled: dto.enabled,
                eventType: dto.eventType,
            });
            return ruleView(await store.save(rule));
        });
    }

    async remove(userId: string, id: string): Promise<{ ok: true }> {
        const rule = await this.db.execute('owned_rule', () =>
            this.rules
                .createQueryBuilder('rule')
                .innerJoin('rule.repository', 'repo')
                .where('rule.id=:id AND repo.ownerId=:userId', { id, userId })
                .getOne(),
        );
        if (!rule) throw new NotFoundException('Rule not found');
        await this.db.execute('remove_rule', () => this.rules.delete({ id }));
        return { ok: true };
    }
}
