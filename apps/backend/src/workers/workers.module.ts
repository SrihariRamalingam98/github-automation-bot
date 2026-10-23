import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionsModule } from '../actions/actions.module';
import { SessionEntity } from '../auth/entities/session.entity';
import { EventEntity } from '../events/entities/event.entity';
import { GithubModule } from '../github/github.module';
import { SlackModule } from '../slack/slack.module';
import { EventProcessorService } from './event-processor.service';
import { EventQueueService } from './event-queue.service';
import { WorkersService } from './workers.service';

@Module({
    imports: [
        GithubModule,
        SlackModule,
        ActionsModule,
        TypeOrmModule.forFeature([EventEntity, SessionEntity]),
    ],
    providers: [WorkersService, EventQueueService, EventProcessorService],
})
export class WorkersModule {}
