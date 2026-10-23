import {
    IsBoolean,
    IsIn,
    IsString,
    MaxLength,
    MinLength,
    Matches,
} from 'class-validator';

export class RuleDto {
    @IsString() @Matches(/^[1-9][0-9]{0,17}$/) repoId!: string;

    @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(80) keyword!: string;

    @IsString() @MinLength(1) @Matches(/\S/) @MaxLength(50) label!: string;

    @IsBoolean() slackEnabled = true;

    @IsBoolean() enabled = true;

    @IsIn(['issues.opened', 'pull_request.opened', 'push']) eventType =
        'issues.opened';
}
