import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from '../common/guards/auth.guard';
import { GithubModule } from '../github/github.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionEntity } from './entities/session.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([SessionEntity]),
        GithubModule,
        UsersModule,
    ],
    providers: [AuthService, AuthGuard],
    controllers: [AuthController],
    exports: [AuthService, AuthGuard],
})
export class AuthModule {}
