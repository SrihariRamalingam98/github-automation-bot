import {
    Controller,
    Get,
    Module,
    ServiceUnavailableException,
} from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DatabaseService } from './database/database.service';
import { EventsModule } from './events/events.module';
import { GithubModule } from './github/github.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { RulesModule } from './rules/rules.module';
import { SlackModule } from './slack/slack.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WorkersModule } from './workers/workers.module';
import { APP_GUARD } from '@nestjs/core';
import {
    SkipThrottle,
    ThrottlerGuard,
    ThrottlerModule,
} from '@nestjs/throttler';

@Controller()
@SkipThrottle()
export class HealthController {
    constructor(private readonly db: DatabaseService) {}

    @Get('health') async health(): Promise<object> {
        try {
            await this.db.health();
            return { ok: true };
        } catch {
            throw new ServiceUnavailableException('Database unavailable');
        }
    }
}
@Module({
    imports: [
        ConfigModule,
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
        DatabaseModule,
        AuthModule,
        UsersModule,
        RepositoriesModule,
        RulesModule,
        EventsModule,
        WebhooksModule,
        GithubModule,
        SlackModule,
        WorkersModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
