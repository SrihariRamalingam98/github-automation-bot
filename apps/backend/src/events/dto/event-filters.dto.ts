import { IsIn, Matches, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class EventFilters {
    @IsOptional() @IsIn(['issues', 'pull_request', 'push']) type?: string;

    @IsOptional()
    @IsIn(['pending', 'processing', 'done', 'failed'])
    status?: string;

    @IsOptional() @Matches(/^[1-9][0-9]{0,17}$/) repoId?: string;

    @IsOptional() @Matches(/^[1-9][0-9]{0,17}$/) before?: string;

    @IsOptional() @Matches(/^[1-9][0-9]{0,17}$/) snapshot?: string;

    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
