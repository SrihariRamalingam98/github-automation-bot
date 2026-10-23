import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { EventEntity } from '../../events/entities/event.entity';

@Entity('actions')
@Unique('actions_event_id_kind_key', ['eventId', 'kind'])
export class ActionEntity {
    @PrimaryGeneratedColumn({ name: 'id', type: 'bigint' })
    id!: string;

    @Column({ name: 'event_id', type: 'bigint' })
    eventId!: string;

    @Column({ name: 'kind', type: 'text' })
    kind!: string;

    @Column({ name: 'status', type: 'text' })
    status!: string;

    @Column({ name: 'detail', type: 'text', nullable: true })
    detail!: string | null;

    @Column({
        name: 'created_at',
        type: 'timestamptz',
        nullable: true,
        default: () => 'now()',
    })
    createdAt!: Date | null;

    @ManyToOne(() => EventEntity, (entity) => entity.actions, {
        nullable: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({ name: 'event_id' })
    event!: Relation<EventEntity>;
}
