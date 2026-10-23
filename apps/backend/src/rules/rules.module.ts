import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { RuleEntity } from './entities/rule.entity';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
    imports: [
        AuthModule,
        RepositoriesModule,
        TypeOrmModule.forFeature([RuleEntity]),
    ],
    providers: [RulesService],
    controllers: [RulesController],
})
export class RulesModule {}
