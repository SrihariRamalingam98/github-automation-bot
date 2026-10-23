import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
    Unique,
    Index,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { EventEntity } from '../../events/entities/event.entity';
import { RuleEntity } from '../../rules/entities/rule.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('repos')
@Unique('repos_owner_id_full_name_key', ['ownerId', 'fullName'])
@Unique('repos_github_repo_id_key', ['githubRepoId'])
@Index('repos_owner_idx', ['ownerId'])
export class RepositoryEntity {
    @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
    id!: string;

    @Column({ name: 'owner_id', type: 'bigint' })
    ownerId!: string;

    @Column({ name: 'full_name', type: 'text' })
    fullName!: string;

    @Column({ name: 'github_repo_id', type: 'bigint' })
    githubRepoId!: string;

    @Column({ name: 'hook_id', type: 'bigint', nullable: true })
    hookId!: string | null;

    @Column({ name: 'webhook_secret', type: 'text', select: false })
    webhookSecret!: string;

    @Column({
        name: 'created_at',
        type: 'timestamptz',
        nullable: true,
        default: () => 'now()',
    })
    createdAt!: Date | null;

    @Column({ name: 'disconnected_at', type: 'timestamptz', nullable: true })
    disconnectedAt!: Date | null;

    @ManyToOne(() => UserEntity, (entity) => entity.repositories, {
        nullable: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({ name: 'owner_id' })
    owner!: Relation<UserEntity>;

    @OneToMany(() => RuleEntity, (entity) => entity.repository)
    rules!: Relation<RuleEntity[]>;

    @OneToMany(() => EventEntity, (entity) => entity.repository)
    events!: Relation<EventEntity[]>;
}
