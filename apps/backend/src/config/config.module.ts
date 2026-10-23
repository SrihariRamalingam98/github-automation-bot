import { resolve } from 'node:path';
import { Global, Injectable, Module } from '@nestjs/common';
import { config } from 'dotenv';

@Injectable()
export class AppConfig {
    readonly appUrl: string;

    readonly webhookBaseUrl: string;

    readonly databaseUrl: string;

    readonly databaseSsl: boolean;

    readonly clientId: string;

    readonly clientSecret: string;

    readonly sessionSecret: string;

    readonly encryptionKey: Buffer;

    readonly slackUrl?: string;

    readonly port: number;

    readonly production: boolean;

    readonly eventMaxAttempts: number;

    readonly trustProxyHops: number;

    constructor() {
        config({ path: resolve(__dirname, '../../../../.env') });
        this.production = process.env.NODE_ENV === 'production';
        this.trustProxyHops = Number(
            process.env.TRUST_PROXY_HOPS ?? (this.production ? 1 : 0),
        );
        if (
            !Number.isInteger(this.trustProxyHops) ||
            this.trustProxyHops < 0 ||
            this.trustProxyHops > 5
        )
            throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5');
        this.eventMaxAttempts = Number(process.env.EVENT_MAX_ATTEMPTS ?? 5);
        if (
            !Number.isSafeInteger(this.eventMaxAttempts) ||
            this.eventMaxAttempts < 1 ||
            this.eventMaxAttempts > 100
        )
            throw new Error(
                'EVENT_MAX_ATTEMPTS must be an integer from 1 to 100',
            );
        const required = (name: string): string => {
            const value = process.env[name];
            if (!value) throw new Error(`Missing configuration: ${name}`);
            return value;
        };
        this.appUrl = required('APP_URL').replace(/\/$/, '');
        let url: URL;
        try {
            url = new URL(this.appUrl);
        } catch {
            throw new Error('APP_URL must be a valid absolute origin');
        }
        if (
            url.username ||
            url.password ||
            url.pathname !== '/' ||
            url.search ||
            url.hash
        )
            throw new Error(
                'APP_URL must be an origin without credentials, path, query or fragment',
            );
        if (
            url.protocol !== 'https:' &&
            (this.production || url.hostname !== 'localhost')
        )
            throw new Error(
                'APP_URL must use HTTPS (HTTP localhost is development only)',
            );
        this.appUrl = url.origin;
        this.webhookBaseUrl = (
            process.env.WEBHOOK_BASE_URL || this.appUrl
        ).replace(/\/$/, '');
        this.databaseUrl = required('DATABASE_URL');
        this.databaseSsl =
            this.production || process.env.DATABASE_SSL === 'true';
        this.clientId = required('GITHUB_CLIENT_ID');
        this.clientSecret = required('GITHUB_CLIENT_SECRET');
        this.sessionSecret = required('SESSION_SECRET');
        const key = required('ENCRYPTION_KEY');
        if (!/^[a-f0-9]{64}$/i.test(key))
            throw new Error('ENCRYPTION_KEY must be 64 hex characters');
        this.encryptionKey = Buffer.from(key, 'hex');
        if (this.sessionSecret.length < 32)
            throw new Error(
                'SESSION_SECRET must contain at least 32 characters',
            );
        this.slackUrl = process.env.SLACK_WEBHOOK_URL || undefined;
        if (this.slackUrl && !validSlackWebhook(this.slackUrl))
            throw new Error(
                'SLACK_WEBHOOK_URL must be an HTTPS Slack incoming webhook',
            );
        this.port = Number(process.env.PORT || 3000);
        if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535)
            throw new Error('Invalid PORT');
    }
}
@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class ConfigModule {}

function validSlackWebhook(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            url.origin === 'https://hooks.slack.com' &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            /^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname)
        );
    } catch {
        return false;
    }
}
