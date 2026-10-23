import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';

@Entity('rules')
export class RuleEntity {
    @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
    id!: string;

    @Column({ name: 'repo_id', type: 'bigint' })
    repoId!: string;

    @Column({ name: 'keyword', type: 'text' })
    keyword!: string;

    @Column({ name: 'label', type: 'text', default: () => "'bug'" })
    label!: string;

    @Column({ name: 'slack_enabled', type: 'boolean', default: () => 'true' })
    slackEnabled!: boolean;

    @Column({ name: 'enabled', type: 'boolean', default: () => 'true' })
    enabled!: boolean;

    @Column({
        name: 'created_at',
        type: 'timestamptz',
        nullable: true,
        default: () => 'now()',
    })
    createdAt!: Date | null;

    @Column({
        name: 'event_type',
        type: 'text',
        default: () => "'issues.opened'",
    })
    eventType!: string;

    @ManyToOne(() => RepositoryEntity, (entity) => entity.rules, {
        nullable: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({ name: 'repo_id' })
    repository!: Relation<RepositoryEntity>;
}
