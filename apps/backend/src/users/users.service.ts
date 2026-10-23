import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../database/database.service';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(UserEntity)
        private readonly users: Repository<UserEntity>,
        private readonly db: DatabaseService,
    ) {}

    async save(
        id: number,
        login: string,
        avatar: string,
        token: string,
    ): Promise<void> {
        await this.db.execute('save_user', () =>
            this.users.upsert(
                { id: String(id), login, avatar, tokenEncrypted: token },
                ['id'],
            ),
        );
    }
}
