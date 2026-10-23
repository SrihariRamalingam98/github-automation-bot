import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class IdPipe implements PipeTransform<string, string> {
    transform(value: string): string {
        if (!/^[1-9][0-9]{0,17}$/.test(value))
            throw new BadRequestException('Invalid identifier');
        return value;
    }
}
