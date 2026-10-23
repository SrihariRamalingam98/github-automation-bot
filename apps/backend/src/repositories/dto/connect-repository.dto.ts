import { IsString, Matches, MaxLength } from 'class-validator';

export class ConnectRepositoryDto {
    @IsString()
    @MaxLength(201)
    @Matches(/^(?!\.{1,2}\/)[\w.-]+\/(?!\.{1,2}$)[\w.-]+$/)
    fullName!: string;
}
