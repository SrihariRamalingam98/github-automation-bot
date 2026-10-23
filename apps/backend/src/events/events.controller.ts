import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../common/guards/auth.guard';
import { AuthRequest } from '../common/interfaces/auth-request.interface';
import { EventFilters } from './dto/event-filters.dto';
import { EventStreamService } from './event-stream.service';
import { EventsService } from './events.service';

@Controller('api')
@UseGuards(AuthGuard)
export class EventsController {
    constructor(
        private readonly events: EventsService,
        private readonly stream: EventStreamService,
    ) {}

    @Get('events') list(
        @Req() req: AuthRequest,
        @Query() filters: EventFilters,
    ) {
        return this.events.list(req.user.id, filters);
    }

    @Get('overview') overview(@Req() req: AuthRequest) {
        return this.events.overview(req.user.id);
    }

    @Get('stream') openStream(
        @Req() req: AuthRequest,
        @Res() res: Response,
    ): void {
        this.stream.open(req, res);
    }
}
