import { Entity, Column, PrimaryColumn, OneToMany } from 'typeorm';
import type { Relation } from 'typeorm';
import { SessionEntity } from '../../auth/entities/session.entity';
import { RepositoryEntity } from '../../repositories/entities/repository.entity';

@Entity('users')
export class UserEntity {
    @PrimaryColumn({ name: 'id', type: 'bigint' })
    id!: string;

    @Column({ name: 'login', type: 'text' })
    login!: string;

    @Column({ name: 'avatar', type: 'text', nullable: true })
    avatar!: string | null;

    @Column({ name: 'token_encrypted', type: 'text', select: false })
    tokenEncrypted!: string;

    @Column({
        name: 'created_at',
        type: 'timestamptz',
        nullable: true,
        default: () => 'now()',
    })
    createdAt!: Date | null;

    @OneToMany(() => RepositoryEntity, (entity) => entity.owner)
    repositories!: Relation<RepositoryEntity[]>;

    @OneToMany(() => SessionEntity, (entity) => entity.user)
    sessions!: Relation<SessionEntity[]>;
}
