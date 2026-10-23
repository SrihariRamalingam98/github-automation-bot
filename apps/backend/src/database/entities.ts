import { ActionEntity } from '../actions/entities/action.entity';
import { SessionEntity } from '../auth/entities/session.entity';
import { EventEntity } from '../events/entities/event.entity';
import { RepositoryEntity } from '../repositories/entities/repository.entity';
import { RuleEntity } from '../rules/entities/rule.entity';
import { UserEntity } from '../users/entities/user.entity';

export const entities = [
    UserEntity,
    RepositoryEntity,
    RuleEntity,
    EventEntity,
    ActionEntity,
    SessionEntity,
];
