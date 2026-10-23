import { Request } from 'express';
import { UserEntity } from '../../users/entities/user.entity';

export interface AuthRequest extends Request {
    user: UserEntity;
    sessionId: string;
    csrfToken: string;
}
