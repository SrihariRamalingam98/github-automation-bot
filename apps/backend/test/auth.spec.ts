import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { AuthService } from '../src/auth/auth.service';
import { AuthRequest } from '../src/common/interfaces/auth-request.interface';
import { AppConfig } from '../src/config/config.module';
import { sign } from '../src/common/security';
import { SessionEntity } from '../src/auth/entities/session.entity';
import { builder, databaseStub, repository } from './helpers';
const config = {
    appUrl: 'https://example.test',
    sessionSecret: 'test'.repeat(10),
} as AppConfig;
describe('Authentication and CSRF', () => {
    const request = (method: string, token?: string, origin?: string) => ({
        method,
        csrfToken: 'per-session-token',
        get: (name: string) => (name === 'Origin' ? origin : token),
    });
    const context = (req: object) =>
        ({
            switchToHttp: () => ({ getRequest: () => req }),
        }) as ExecutionContext;
    const guard = new AuthGuard(
        {
            authenticate: jest.fn().mockResolvedValue(undefined),
        } as unknown as AuthService,
        config,
    );
    it('requires a CSRF header even with authenticated cookies', async () => {
        await expect(
            guard.canActivate(context(request('POST'))),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
        'rejects missing CSRF for authenticated %s',
        async (method) => {
            await expect(
                guard.canActivate(context(request(method))),
            ).rejects.toBeInstanceOf(ForbiddenException);
        },
    );
    it('rejects wrong tokens and cross-origin writes', async () => {
        await expect(
            guard.canActivate(context(request('DELETE', 'wrong'))),
        ).rejects.toThrow();
        await expect(
            guard.canActivate(
                context(
                    request('POST', 'per-session-token', 'https://evil.test'),
                ),
            ),
        ).rejects.toThrow();
    });
    it('allows authenticated reads and same-origin writes with the session token', async () => {
        expect(
            await guard.canActivate(
                context(
                    request(
                        'POST',
                        'per-session-token',
                        'https://example.test',
                    ),
                ),
            ),
        ).toBe(true);
        expect(await guard.canActivate(context(request('GET')))).toBe(true);
    });
    it('rejects legacy, expired and revoked sessions', async () => {
        const query = builder();
        query.getOne.mockResolvedValue(null);
        const auth = new AuthService(
            repository<SessionEntity>({ createQueryBuilder: () => query }),
            databaseStub(),
            config,
        );
        await expect(
            auth.authenticate({
                cookies: { session: sign('1:123', config.sessionSecret) },
            } as unknown as AuthRequest),
        ).rejects.toThrow('Sign in required');
        await expect(
            auth.authenticate({
                cookies: {
                    session: sign('a'.repeat(64), config.sessionSecret),
                },
            } as unknown as AuthRequest),
        ).rejects.toThrow('Session expired');
    });
    it('loads a valid session and keeps token data on the server', async () => {
        const query = builder();
        query.getOne.mockResolvedValue({
            user: { id: '1', login: 'test', tokenEncrypted: 'encrypted' },
            csrfToken: 'csrf',
            expiresAt: new Date(Date.now() + 60000),
        });
        const auth = new AuthService(
            repository<SessionEntity>({ createQueryBuilder: () => query }),
            databaseStub(),
            config,
        );
        const req = {
            cookies: { session: sign('a'.repeat(64), config.sessionSecret) },
        } as unknown as AuthRequest;
        await auth.authenticate(req);
        expect(req.user.login).toBe('test');
        expect(req.csrfToken).toBe('csrf');
        expect(query.addSelect).toHaveBeenCalledWith([
            'session.csrfToken',
            'user.tokenEncrypted',
        ]);
    });
});
