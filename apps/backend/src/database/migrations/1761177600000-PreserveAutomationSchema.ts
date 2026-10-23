import { MigrationInterface, QueryRunner } from 'typeorm';

// Additive migration preserves original tables, identifiers and token encoding.
export const schema = `
CREATE TABLE IF NOT EXISTS users (id BIGINT PRIMARY KEY, login TEXT NOT NULL, avatar TEXT, token_encrypted TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS repos (id BIGSERIAL PRIMARY KEY, owner_id BIGINT NOT NULL REFERENCES users(id), full_name TEXT NOT NULL, github_repo_id BIGINT NOT NULL, hook_id BIGINT, webhook_secret TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(owner_id, full_name), UNIQUE(github_repo_id));
CREATE TABLE IF NOT EXISTS rules (id BIGSERIAL PRIMARY KEY, repo_id BIGINT NOT NULL REFERENCES repos(id), keyword TEXT NOT NULL, label TEXT NOT NULL DEFAULT 'bug', slack_enabled BOOLEAN NOT NULL DEFAULT true, enabled BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS events (id BIGSERIAL PRIMARY KEY, repo_id BIGINT NOT NULL REFERENCES repos(id), delivery_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL, action TEXT, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ DEFAULT now(), error TEXT, received_at TIMESTAMPTZ DEFAULT now(), processed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS actions (id BIGSERIAL PRIMARY KEY, event_id BIGINT NOT NULL REFERENCES events(id), kind TEXT NOT NULL, status TEXT NOT NULL, detail TEXT, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(event_id, kind));
ALTER TABLE repos ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'issues.opened';
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), csrf_token TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS events_queue_idx ON events(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS repos_owner_idx ON repos(owner_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS events_repo_idx ON events(repo_id, id DESC);
`;

export class PreserveAutomationSchema1761177600000 implements MigrationInterface {
    readonly name = 'PreserveAutomationSchema1761177600000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('SELECT pg_advisory_xact_lock(7319021)');
        await queryRunner.query(schema);
    }

    async down(): Promise<void> {
        throw new Error(
            'This data-preserving migration is forward-only. Use a reviewed backup/rollback plan.',
        );
    }
}
