import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service';
import { AppConfig } from '../../config/config.module';
import { AuthRequest } from '../interfaces/auth-request.interface';
import { safeEqual } from '../security';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly auth: AuthService,
        private readonly config: AppConfig,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<AuthRequest>();
        await this.auth.authenticate(req);
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            const token = req.get('X-CSRF-Token') || '';
            if (!token || !safeEqual(token, req.csrfToken))
                throw new ForbiddenException('CSRF token required');
            const origin = req.get('Origin');
            if (origin && origin !== new URL(this.config.appUrl).origin)
                throw new ForbiddenException('Invalid origin');
        }
        return true;
    }
}
