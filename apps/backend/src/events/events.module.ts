import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionsModule } from '../actions/actions.module';
import { AuthModule } from '../auth/auth.module';
import { RepositoryEntity } from '../repositories/entities/repository.entity';
import { EventEntity } from './entities/event.entity';
import { EventStreamService } from './event-stream.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
    imports: [
        AuthModule,
        ActionsModule,
        TypeOrmModule.forFeature([EventEntity, RepositoryEntity]),
    ],
    providers: [EventsService, EventStreamService],
    controllers: [EventsController],
    exports: [EventsService],
})
export class EventsModule {}
