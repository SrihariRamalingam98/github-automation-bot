import { Injectable } from '@nestjs/common';
import { externalRequest } from '../common/exceptions/external-request';
import { AppConfig } from '../config/config.module';

@Injectable()
export class SlackService {
    constructor(private readonly config: AppConfig) {}

    async send(text: string): Promise<string> {
        if (!this.config.slackUrl) return 'Skipped: Slack is not configured';
        await externalRequest('Slack', this.config.slackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        return 'Slack notification sent';
    }
}
