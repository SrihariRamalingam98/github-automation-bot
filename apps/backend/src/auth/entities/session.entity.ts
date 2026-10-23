import {
    Entity,
    Column,
    PrimaryColumn,
    ManyToOne,
    JoinColumn,
    Index,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('sessions')
@Index('sessions_expiry_idx', ['expiresAt'])
export class SessionEntity {
    @PrimaryColumn({ name: 'id', type: 'text' })
    id!: string;

    @Column({ name: 'user_id', type: 'bigint' })
    userId!: string;

    @Column({ name: 'csrf_token', type: 'text', select: false })
    csrfToken!: string;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt!: Date;

    @ManyToOne(() => UserEntity, (entity) => entity.sessions, {
        nullable: false,
        onDelete: 'NO ACTION',
    })
    @JoinColumn({ name: 'user_id' })
    user!: Relation<UserEntity>;
}
