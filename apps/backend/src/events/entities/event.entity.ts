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
import { ActionEntity } from '../../actions/entities/action.entity';
import type { EventPayload } from '../../common/interfaces/event-payload.interface';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';

@Entity('events')
@Unique('events_delivery_id_key', ['deliveryId'])
@Index('events_queue_idx', ['status', 'nextAttemptAt', 'id'])
@Index('events_repo_idx', { synchronize: false })
export class EventEntity {
    @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
    id!: string;

    @Column({ name: 'repo_id', type: 'bigint' })
    repoId!: string;

    @Column({ name: 'delivery_id', type: 'text' })
    deliveryId!: string;

    @Column({ name: 'event_type', type: 'text' })
    eventType!: string;

    @Column({ name: 'action', type: 'text', nullable: true })
    action!: string | null;

    @Column({ name: 'payload', type: 'jsonb' })
    payload!: EventPayload;

    @Column({ name: 'status', type: 'text', default: () => "'pending'" })
    status!: string;

    @Column({ name: 'attempts', type: 'integer', default: () => '0' })
    attempts!: number;

    @Column({
        name: 'next_attempt_at',
        type: 'timestamptz',
        nullable: true,
        default: () => 'now()',
    })
    nextAttemptAt!: Date | null;

    @Column({ name: 'error', type: 'text', nullable: true })
    error!: string | null;

    @Column({
        name: 'received_at',
        type: 'timestamptz',
        nullable: true,
        default: () => 'now()',
    })
    receivedAt!: Date | null;

    @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
    processedAt!: Date | null;

    @ManyToOne(() => RepositoryEntity, (entity) => entity.events, {
        nullable: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({ name: 'repo_id' })
    repository!: Relation<RepositoryEntity>;

    @OneToMany(() => ActionEntity, (entity) => entity.event)
    actions!: Relation<ActionEntity[]>;
}
