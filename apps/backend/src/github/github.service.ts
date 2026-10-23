import { Injectable } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import {
    externalJson,
    externalRequest,
} from '../common/exceptions/external-request';
import { AppConfig } from '../config/config.module';

export interface GithubRepo {
    id: number;
    full_name: string;
    owner: { id: number };
    permissions?: { admin: boolean };
}
export interface GithubProfile {
    id: number;
    login: string;
    avatar_url: string;
}
export function repoPath(name: string): string {
    return name.split('/').map(encodeURIComponent).join('/');
}
@Injectable()
export class GithubService {
    constructor(private readonly config: AppConfig) {}

    async request<T>(
        method: string,
        route: string,
        token: string,
        body?: unknown,
        operation?: 'repository_lookup' | 'webhook_create',
    ): Promise<T> {
        const response = await externalRequest(
            'GitHub',
            `https://api.github.com${route}`,
            {
                method,
                headers: {
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'abstrabit-automation-bot',
                    Authorization: `Bearer ${token}`,
                    ...(body ? { 'Content-Type': 'application/json' } : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            },
            operation,
        );
        return response.status === 204
            ? (undefined as T)
            : externalJson<T>('GitHub', response, operation);
    }

    async exchange(code: string): Promise<string> {
        const response = await externalRequest(
            'GitHub OAuth',
            'https://github.com/login/oauth/access_token',
            {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    code,
                    redirect_uri: `${this.config.appUrl}/auth/github/callback`,
                }),
            },
        );
        const data = await externalJson<{ access_token?: unknown }>(
            'GitHub OAuth',
            response,
        );
        if (typeof data.access_token !== 'string' || !data.access_token)
            throw new UnauthorizedException(
                'GitHub OAuth authorization failed. Start sign-in again.',
            );
        return data.access_token;
    }
}
