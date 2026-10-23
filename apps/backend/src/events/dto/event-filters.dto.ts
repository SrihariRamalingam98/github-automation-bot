import { IsIn, Matches, IsOptional } from 'class-validator';

export class EventFilters {
    @IsOptional() @IsIn(['issues', 'pull_request', 'push']) type?: string;

    @IsOptional()
    @IsIn(['pending', 'processing', 'done', 'failed'])
    status?: string;

    @IsOptional() @Matches(/^[1-9][0-9]{0,17}$/) repoId?: string;

    @IsOptional() @Matches(/^[1-9][0-9]{0,17}$/) before?: string;
}
