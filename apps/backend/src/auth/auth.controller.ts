import { randomBytes } from 'node:crypto';
import {
    Controller,
    Get,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
    ForbiddenException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../common/guards/auth.guard';
import { AuthRequest } from '../common/interfaces/auth-request.interface';
import { encrypt, safeEqual, sign, verify } from '../common/security';
import { Throttle } from '@nestjs/throttler';
import { AppConfig } from '../config/config.module';
import { GithubProfile, GithubService } from '../github/github.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
    constructor(
        private readonly config: AppConfig,
        private readonly auth: AuthService,
        private readonly github: GithubService,
        private readonly users: UsersService,
    ) {}

    @Throttle({ default: { limit: 10, ttl: 60000 } })
    @Get('auth/github')
    login(@Res() res: Response): void {
        const state = `${randomBytes(24).toString('hex')}:${Date.now() + 600000}`;
        res.cookie('oauth_state', sign(state, this.config.sessionSecret), {
            ...this.auth.cookieOptions,
            maxAge: 600000,
        });
        res.redirect(
            `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: this.config.clientId, redirect_uri: `${this.config.appUrl}/auth/github/callback`, scope: 'repo read:user', state })}`,
        );
    }

    @Get('auth/github/callback')
    @Throttle({ default: { limit: 30, ttl: 60000 } })
    async callback(
        @Req() req: Request,
        @Res() res: Response,
        @Query('code') code: unknown,
        @Query('state') state: unknown,
    ): Promise<void> {
        const expected = verify(
            (req.cookies as Record<string, unknown> | undefined)?.oauth_state,
            this.config.sessionSecret,
        );
        res.clearCookie('oauth_state', this.auth.cookieOptions);
        if (
            !expected ||
            !/^[a-f0-9]{48}:\d{13}$/.test(expected) ||
            typeof state !== 'string' ||
            state.length !== expected.length ||
            !safeEqual(expected, state) ||
            Number(expected.split(':')[1]) <= Date.now() ||
            Number(expected.split(':')[1]) > Date.now() + 600000 ||
            typeof code !== 'string' ||
            !code ||
            code.length > 512
        )
            throw new ForbiddenException('OAuth state mismatch');
        const token = await this.github.exchange(code);
        const profile = await this.github.request<GithubProfile>(
            'GET',
            '/user',
            token,
        );
        await this.users.save(
            profile.id,
            profile.login,
            profile.avatar_url,
            encrypt(token, this.config.encryptionKey),
        );
        await this.auth.create(
            profile.id,
            res,
            (req.cookies as Record<string, unknown> | undefined)?.session,
        );
        res.redirect('/dashboard');
    }

    @UseGuards(AuthGuard)
    @Get('api/me')
    me(@Req() req: AuthRequest) {
        return {
            login: req.user.login,
            avatar: req.user.avatar,
            csrfToken: req.csrfToken,
        };
    }

    @UseGuards(AuthGuard)
    @Post('api/logout')
    async logout(
        @Req() req: AuthRequest,
        @Res({ passthrough: true }) res: Response,
    ) {
        await this.auth.logout(req, res);
        return { ok: true };
    }
}
