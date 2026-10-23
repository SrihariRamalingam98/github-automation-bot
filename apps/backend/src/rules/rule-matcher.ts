import { EventPayload } from '../common/interfaces/event-payload.interface';
import { RuleEntity } from './entities/rule.entity';

export function matchesRule(
    rule: Pick<RuleEntity, 'enabled' | 'eventType' | 'keyword'>,
    type: string,
    action: string | null,
    payload: EventPayload,
): boolean {
    const event = type === 'push' ? 'push' : `${type}.${action}`;
    const title =
        payload.issue?.title ||
        payload.pull_request?.title ||
        payload.head_commit?.message ||
        '';
    return (
        rule.enabled &&
        rule.eventType === event &&
        title.toLowerCase().includes(rule.keyword.toLowerCase())
    );
}
