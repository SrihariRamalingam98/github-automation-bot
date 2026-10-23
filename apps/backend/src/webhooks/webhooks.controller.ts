import {
    Controller,
    Headers,
    HttpCode,
    Param,
    Post,
    Req,
    UnsupportedMediaTypeException,
    UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { IdPipe } from '../common/id.pipe';
import { WebhooksService } from './webhooks.service';
import { isWebhookSignature } from '../common/security';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('webhooks/github')
@SkipThrottle()
export class WebhooksController {
    constructor(private readonly webhooks: WebhooksService) {}

    @Post(':repoId')
    @HttpCode(202)
    receive(
        @Param('repoId', IdPipe) id: string,
        @Req() req: Request,
        @Headers('x-hub-signature-256') signature = '',
        @Headers('x-github-delivery') delivery = '',
        @Headers('x-github-event') event = '',
    ) {
        if (!isWebhookSignature(signature))
            throw new UnauthorizedException('Invalid signature');
        if (!Buffer.isBuffer(req.body))
            throw new UnsupportedMediaTypeException(
                'Expected application/json',
            );
        return this.webhooks.receive(id, req.body, signature, delivery, event);
    }
}
