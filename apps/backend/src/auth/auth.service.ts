import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CookieOptions, Response } from 'express';
import { MoreThan, Repository } from 'typeorm';
import { AuthRequest } from '../common/interfaces/auth-request.interface';
import { sign, verify } from '../common/security';
import { AppConfig } from '../config/config.module';
import { DatabaseService } from '../database/database.service';
import { SessionEntity } from './entities/session.entity';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(SessionEntity)
        private readonly sessions: Repository<SessionEntity>,
        private readonly db: DatabaseService,
        private readonly config: AppConfig,
    ) {}

    get cookieOptions(): CookieOptions {
        return {
            httpOnly: true,
            secure:
                this.config.production ||
                this.config.appUrl.startsWith('https:'),
            sameSite: 'lax',
            path: '/',
        };
    }

    async create(
        userId: number,
        res: Response,
        previousCookie?: unknown,
    ): Promise<void> {
        const id = randomBytes(32).toString('hex');
        const previousId = verify(previousCookie, this.config.sessionSecret);
        await this.db.transaction('create_session', async (manager) => {
            const sessions = manager.getRepository(SessionEntity);
            await sessions.insert({
                id,
                userId: String(userId),
                csrfToken: randomBytes(32).toString('hex'),
                expiresAt: new Date(Date.now() + 86400000),
            });
            if (previousId && /^[a-f0-9]{64}$/.test(previousId))
                await sessions.delete({ id: previousId });
        });
        res.cookie('session', sign(id, this.config.sessionSecret), {
            ...this.cookieOptions,
            maxAge: 86400000,
        });
    }

    async authenticate(req: AuthRequest): Promise<void> {
        const id = verify(
            (req.cookies as Record<string, unknown> | undefined)?.session,
            this.config.sessionSecret,
        );
        if (!id || !/^[a-f0-9]{64}$/.test(id))
            throw new UnauthorizedException('Sign in required');
        const session = await this.db.execute('authenticate_session', () =>
            this.sessions
                .createQueryBuilder('session')
                .innerJoinAndSelect('session.user', 'user')
                .addSelect(['session.csrfToken', 'user.tokenEncrypted'])
                .where('session.id = :id', { id })
                .andWhere('session.expiresAt > :now', { now: new Date() })
                .getOne(),
        );
        if (!session) throw new UnauthorizedException('Session expired');
        req.user = session.user;
        req.sessionId = id;
        req.csrfToken = session.csrfToken;
    }

    async isActiveSession(id: string): Promise<boolean> {
        return this.db.execute('check_session', () =>
            this.sessions.exists({
                where: { id, expiresAt: MoreThan(new Date()) },
            }),
        );
    }

    async logout(req: AuthRequest, res: Response): Promise<void> {
        await this.db.execute('logout', () =>
            this.sessions.delete({ id: req.sessionId }),
        );
        res.clearCookie('session', this.cookieOptions);
        res.clearCookie('csrf', this.cookieOptions);
    }
}
