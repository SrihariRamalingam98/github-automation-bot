import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { IdPipe } from '../common/id.pipe';
import { AuthRequest } from '../common/interfaces/auth-request.interface';
import { ConnectRepositoryDto } from './dto/connect-repository.dto';
import { RepositoriesService } from './repositories.service';
import { Throttle } from '@nestjs/throttler';

@Controller('api')
@UseGuards(AuthGuard)
export class RepositoriesController {
    constructor(private readonly repos: RepositoriesService) {}

    @Get('available-repos') available(@Req() req: AuthRequest) {
        return this.repos.available(req.user);
    }

    @Get('repos') list(@Req() req: AuthRequest) {
        return this.repos.list(req.user.id);
    }

    @Throttle({ default: { limit: 20, ttl: 60000 } })
    @Post('repos')
    connect(@Req() req: AuthRequest, @Body() dto: ConnectRepositoryDto) {
        return this.repos.connect(req.user, dto.fullName);
    }

    @Delete('repos/:id') disconnect(
        @Req() req: AuthRequest,
        @Param('id', IdPipe) id: string,
    ) {
        return this.repos.disconnect(req.user, id);
    }

    @Get('repos/:id/labels') labels(
        @Req() req: AuthRequest,
        @Param('id', IdPipe) id: string,
    ) {
        return this.repos.labels(req.user, id);
    }
}
