import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Req,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { IdPipe } from '../common/id.pipe';
import { AuthRequest } from '../common/interfaces/auth-request.interface';
import { RuleDto } from './dto/rule.dto';
import { RulesService } from './rules.service';

@Controller('api/rules')
@UseGuards(AuthGuard)
export class RulesController {
    constructor(private readonly rules: RulesService) {}

    @Get() list(@Req() r: AuthRequest) {
        return this.rules.list(r.user.id);
    }

    @Post() create(@Req() r: AuthRequest, @Body() dto: RuleDto) {
        return this.rules.save(r.user.id, dto);
    }

    @Put(':id') update(
        @Req() r: AuthRequest,
        @Param('id', IdPipe) id: string,
        @Body() dto: RuleDto,
    ) {
        return this.rules.save(r.user.id, dto, id);
    }

    @Delete(':id') remove(
        @Req() r: AuthRequest,
        @Param('id', IdPipe) id: string,
    ) {
        return this.rules.remove(r.user.id, id);
    }
}
