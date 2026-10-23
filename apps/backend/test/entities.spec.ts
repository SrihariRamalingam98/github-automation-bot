import { DataSource } from 'typeorm';
import { databaseOptions } from '../src/database/options';
import { UserEntity } from '../src/users/entities/user.entity';
import { RepositoryEntity } from '../src/repositories/entities/repository.entity';
import { EventEntity } from '../src/events/entities/event.entity';
import { SessionEntity } from '../src/auth/entities/session.entity';
export async function metadataSource(): Promise<DataSource> {
    const source = new DataSource(
        databaseOptions({
            databaseUrl: 'postgresql://test:test@localhost/test',
            databaseSsl: false,
        }),
    );
    await (
        source as unknown as { buildMetadatas(): Promise<void> }
    ).buildMetadatas();
    return source;
}
describe('TypeORM metadata mirrors inspected PostgreSQL schema', () => {
    let source: DataSource;
    beforeAll(async () => {
        source = await metadataSource();
    });
    it('disables destructive schema options and automatic migrations', () => {
        expect(source.options.synchronize).toBe(false);
        expect(source.options.dropSchema).toBe(false);
        expect(source.options.migrationsRun).toBe(false);
    });
    it('maps all six existing tables and bigint identifiers', () => {
        expect(source.entityMetadatas.map((m) => m.tableName).sort()).toEqual([
            'actions',
            'events',
            'repos',
            'rules',
            'sessions',
            'users',
        ]);
        for (const entity of source.entityMetadatas.filter(
            (m) => m.target !== SessionEntity,
        ))
            expect(entity.primaryColumns[0].type).toBe('bigint');
    });
    it('preserves nullable legacy timestamps without inventing updated_at columns', () => {
        for (const metadata of source.entityMetadatas) {
            expect(
                metadata.columns.some((c) => c.databaseName === 'updated_at'),
            ).toBe(false);
            for (const column of metadata.columns.filter((c) =>
                [
                    'created_at',
                    'received_at',
                    'processed_at',
                    'next_attempt_at',
                ].includes(c.databaseName),
            ))
                expect(column.isNullable).toBe(true);
        }
    });
    it('uses inverse relationships with original foreign key column names', () => {
        const repo = source.getMetadata(RepositoryEntity);
        expect(
            repo.relations.find((r) => r.propertyName === 'owner')
                ?.joinColumns[0].databaseName,
        ).toBe('owner_id');
        const event = source.getMetadata(EventEntity);
        expect(
            event.relations.find((r) => r.propertyName === 'repository')
                ?.joinColumns[0].databaseName,
        ).toBe('repo_id');
        expect(
            event.relations.find((r) => r.propertyName === 'actions')
                ?.inverseRelation?.propertyName,
        ).toBe('event');
    });
    it('excludes credentials and webhook secrets from normal repository selections', () => {
        expect(
            source
                .getMetadata(UserEntity)
                .findColumnWithPropertyName('tokenEncrypted')?.isSelect,
        ).toBe(false);
        expect(
            source
                .getMetadata(RepositoryEntity)
                .findColumnWithPropertyName('webhookSecret')?.isSelect,
        ).toBe(false);
        expect(
            source
                .getMetadata(SessionEntity)
                .findColumnWithPropertyName('csrfToken')?.isSelect,
        ).toBe(false);
    });
    it('keeps remote PostgreSQL TLS verification enabled despite URL overrides', () => {
        const options = databaseOptions({
            databaseUrl:
                'postgresql://test:test@example.test/db?sslmode=require',
            databaseSsl: false,
        });
        expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
    });
    it('prevents connection URL flags from overriding verified TLS configuration', () => {
        const options = databaseOptions({
            databaseUrl:
                'postgresql://test:test@example.test/db?ssl=false&sslmode=disable&uselibpqcompat=true',
            databaseSsl: true,
        });
        expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
        expect('url' in options && options.url).not.toContain('ssl=');
    });
    it('reports malformed database URLs without echoing credential content', () => {
        expect(() =>
            databaseOptions({
                databaseUrl: 'invalid secret password',
                databaseSsl: true,
            }),
        ).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL');
    });
});
