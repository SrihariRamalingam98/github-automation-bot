import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module';
import { RepositoryEntity } from '../repositories/entities/repository.entity';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
    imports: [TypeOrmModule.forFeature([RepositoryEntity]), EventsModule],
    providers: [WebhooksService],
    controllers: [WebhooksController],
})
export class WebhooksModule {}
