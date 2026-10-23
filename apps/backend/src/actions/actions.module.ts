import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionsService } from './actions.service';
import { ActionEntity } from './entities/action.entity';

@Module({
    imports: [TypeOrmModule.forFeature([ActionEntity])],
    providers: [ActionsService],
    exports: [ActionsService],
})
export class ActionsModule {}
