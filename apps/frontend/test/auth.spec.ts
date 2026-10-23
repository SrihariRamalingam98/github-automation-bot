import { HttpClient } from '@angular/common/http';
import { csrfInterceptor } from '../src/app/core/interceptors/csrf.interceptor';
import { httpErrorInterceptor } from '../src/app/core/interceptors/http-error.interceptor';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../src/app/core/services/auth.service';
describe('Current user and CSRF interceptor', () => {
    afterEach(() => {
        TestBed.inject(HttpTestingController).verify();
        TestBed.resetTestingModule();
    });
    function setup() {
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                provideHttpClient(withInterceptors([csrfInterceptor, httpErrorInterceptor])),
                provideHttpClientTesting(),
            ],
        });
        vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
        return {
            auth: TestBed.inject(AuthService),
            http: TestBed.inject(HttpTestingController),
        };
    }
    it('loads current user into a signal', () => {
        const { auth, http } = setup();
        auth.load().subscribe();
        http.expectOne('/api/me').flush({
            login: 'test-user',
            avatar: null,
            csrfToken: 'test-token',
        });
        expect(auth.user()?.login).toBe('test-user');
    });
    it('adds the session CSRF header to logout and clears the user after success', () => {
        const { auth, http } = setup();
        auth.user.set({
            login: 'test',
            avatar: null,
            csrfToken: 'session-specific',
        });
        auth.logout().subscribe();
        const req = http.expectOne('/api/logout');
        expect(req.request.headers.get('X-CSRF-Token')).toBe('session-specific');
        req.flush({ ok: true });
        expect(auth.user()).toBeNull();
    });
    it('expires the UI session on an unauthorized API response', () => {
        const { auth, http } = setup();
        const router = TestBed.inject(Router);
        const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        auth.user.set({ login: 'test', avatar: null, csrfToken: 'token' });
        auth.logout().subscribe({ error: () => undefined });
        http.expectOne('/api/logout').flush(
            { message: 'Session expired' },
            { status: 401, statusText: 'Unauthorized' },
        );
        expect(auth.user()).toBeNull();
        expect(navigate).toHaveBeenCalled();
    });
    it('never forwards a CSRF token to a different origin', () => {
        const { auth, http } = setup();
        auth.user.set({ login: 'test', avatar: null, csrfToken: 'session-only' });
        TestBed.inject(HttpClient).post('https://example.test/api/action', {}).subscribe();
        const request = http.expectOne('https://example.test/api/action');
        expect(request.request.headers.has('X-CSRF-Token')).toBe(false);
        expect(request.request.withCredentials).toBe(false);
        request.flush({});
    });
});
