import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EventEntity } from '../events/entities/event.entity';
import { GithubModule } from '../github/github.module';
import { RuleEntity } from '../rules/entities/rule.entity';
import { RepositoryEntity } from './entities/repository.entity';
import { RepositoriesController } from './repositories.controller';
import { RepositoriesService } from './repositories.service';

@Module({
    imports: [
        AuthModule,
        GithubModule,
        TypeOrmModule.forFeature([RepositoryEntity, RuleEntity, EventEntity]),
    ],
    providers: [RepositoriesService],
    controllers: [RepositoriesController],
    exports: [RepositoriesService],
})
export class RepositoriesModule {}
