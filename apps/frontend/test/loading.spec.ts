import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
    NavigationCancel,
    NavigationEnd,
    NavigationStart,
    provideRouter,
    Router,
    RouterEvent,
} from '@angular/router';
import { Subject } from 'rxjs';
import { InteractivityChecker } from '@angular/cdk/a11y';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from '../src/app/app.component';
import { loadingInterceptor } from '../src/app/core/interceptors/loading.interceptor';
import { csrfInterceptor } from '../src/app/core/interceptors/csrf.interceptor';
import { AuthService } from '../src/app/core/services/auth.service';
import { LoadingService } from '../src/app/core/services/loading.service';
import { LoginComponent } from '../src/app/features/auth/login/login.component';

describe('Global top loader and interaction lock', () => {
    afterEach(() => {
        TestBed.inject(HttpTestingController).verify();
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    function setup() {
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                provideNoopAnimations(),
                provideHttpClient(withInterceptors([loadingInterceptor, csrfInterceptor])),
                provideHttpClientTesting(),
            ],
        });
        return {
            loading: TestBed.inject(LoadingService),
            http: TestBed.inject(HttpClient),
            requests: TestBed.inject(HttpTestingController),
        };
    }

    it('keeps the page locked until every concurrent request completes, including an error', () => {
        const { loading, http, requests } = setup();
        http.get('/api/repos').subscribe();
        http.put('/api/rules/1', {}).subscribe({ error: () => undefined });
        expect(loading.busy()).toBe(true);
        requests.expectOne('/api/repos').flush([]);
        expect(loading.busy()).toBe(true);
        requests.expectOne('/api/rules/1').flush({}, { status: 503, statusText: 'Unavailable' });
        expect(loading.busy()).toBe(false);
    });

    it('does not lock on an unsubscribed request and releases cancelled requests', () => {
        const { loading, http, requests } = setup();
        const request = http.post('/api/repos', {});
        expect(loading.busy()).toBe(false);
        const subscription = request.subscribe();
        const pending = requests.expectOne('/api/repos');
        expect(loading.busy()).toBe(true);
        subscription.unsubscribe();
        expect(pending.cancelled).toBe(true);
        expect(loading.busy()).toBe(false);
    });

    it.each([false, true])(
        'hides the loader for filtered events and overview without blocking input (HttpParams: %s)',
        (useParams) => {
            const { http, requests } = setup();
            const fixture = TestBed.createComponent(AppComponent);
            fixture.detectChanges();
            const element = fixture.nativeElement as HTMLElement;
            const input = document.createElement('input');
            element.querySelector('.app-content')!.append(input);
            input.focus();
            http.get(
                useParams ? '/api/events' : '/api/events?repoId=9&type=issues',
                useParams ? { params: { repoId: '9', type: 'issues' } } : {},
            ).subscribe();
            http.get('/api/overview').subscribe({ error: () => undefined });
            fixture.detectChanges();
            expect(element.querySelector('.top-loader')).toBeNull();
            expect(element.querySelector('.loading-overlay')).toBeNull();
            expect(element.querySelector('.app-content')?.hasAttribute('inert')).toBe(false);
            expect(document.activeElement).toBe(input);
            requests.expectOne('/api/events?repoId=9&type=issues').flush([]);
            fixture.detectChanges();
            expect(element.querySelector('.top-loader')).toBeNull();
            requests
                .expectOne('/api/overview')
                .flush({}, { status: 503, statusText: 'Unavailable' });
            fixture.detectChanges();
            expect(element.querySelector('.top-loader')).toBeNull();
            expect(document.activeElement).toBe(input);
        },
    );

    it('still blocks saves during a dashboard refresh and unlocks as soon as the save finishes', () => {
        const { loading, http, requests } = setup();
        http.get('/api/events').subscribe();
        expect(loading.busy()).toBe(false);
        expect(loading.blocking()).toBe(false);
        http.put('/api/rules/1', {}).subscribe();
        expect(loading.blocking()).toBe(true);
        requests.expectOne('/api/rules/1').flush({});
        expect(loading.blocking()).toBe(false);
        expect(loading.busy()).toBe(false);
        requests.expectOne('/api/events').flush([]);
        expect(loading.busy()).toBe(false);
    });

    it('unlocks after logout failure while preserving CSRF and allows retry', () => {
        const { loading, requests } = setup();
        const auth = TestBed.inject(AuthService);
        vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
        auth.user.set({ login: 'test', avatar: null, csrfToken: 'session-token' });
        auth.logout().subscribe({ error: () => undefined });
        const first = requests.expectOne('/api/logout');
        expect(loading.busy()).toBe(true);
        expect(first.request.headers.get('X-CSRF-Token')).toBe('session-token');
        first.flush({}, { status: 503, statusText: 'Unavailable' });
        expect(loading.busy()).toBe(false);
        expect(auth.user()?.login).toBe('test');
        auth.logout().subscribe();
        expect(loading.busy()).toBe(true);
        requests.expectOne('/api/logout').flush({ ok: true });
        expect(loading.busy()).toBe(false);
        expect(auth.user()).toBeNull();
    });

    it('does not hold the page for external resources or the long-lived stream', () => {
        const { loading, http, requests } = setup();
        http.get('https://example.test/resource').subscribe();
        http.get('/api/stream').subscribe();
        expect(loading.busy()).toBe(false);
        requests.expectOne('https://example.test/resource').flush({});
        requests.expectOne('/api/stream').flush({});
    });

    it('renders the top progress indicator and inert page only while loading', () => {
        const { loading } = setup();
        // jsdom has no layout dimensions; browser focusability is supplied by CDK.
        vi.spyOn(TestBed.inject(InteractivityChecker), 'isFocusable').mockReturnValue(true);
        const fixture = TestBed.createComponent(AppComponent);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('mat-progress-bar')).toBeNull();
        const first = loading.begin();
        const second = loading.begin();
        fixture.detectChanges();
        expect(element.querySelector('.app-content')?.hasAttribute('inert')).toBe(true);
        expect(element.querySelector<HTMLElement>('.loading-message')?.tabIndex).toBe(0);
        expect(element.querySelector('[role="status"]')?.textContent).toContain(
            'Loading, please wait',
        );
        expect(element.querySelector('mat-progress-bar')?.getAttribute('mode')).toBe(
            'indeterminate',
        );
        first();
        first();
        fixture.detectChanges();
        expect(element.querySelector('.loading-overlay')).not.toBeNull();
        second();
        fixture.detectChanges();
        expect(element.querySelector('.app-content')?.hasAttribute('inert')).toBe(false);
        expect(element.querySelector('.loading-overlay')).toBeNull();
    });

    it('releases router loading on completion or cancellation without unlocking a pending update', () => {
        const { loading } = setup();
        const events = new Subject<RouterEvent>();
        vi.spyOn(TestBed.inject(Router), 'events', 'get').mockReturnValue(events);
        const fixture = TestBed.createComponent(AppComponent);
        events.next(new NavigationStart(1, '/rules'));
        expect(loading.busy()).toBe(true);
        events.next(new NavigationCancel(1, '/rules', 'Cancelled'));
        expect(loading.busy()).toBe(false);
        const finish = loading.begin();
        events.next(new NavigationStart(2, '/events'));
        events.next(new NavigationEnd(2, '/events', '/events'));
        expect(loading.busy()).toBe(true);
        finish();
        expect(loading.busy()).toBe(false);
        fixture.destroy();
    });

    it('shows the loader for OAuth and prevents a repeated login click until the page returns', () => {
        const { loading } = setup();
        const fixture = TestBed.createComponent(LoginComponent);
        const first = new MouseEvent('click', { button: 0, cancelable: true });
        fixture.componentInstance.login(first);
        expect(first.defaultPrevented).toBe(false);
        expect(loading.busy()).toBe(true);
        const repeated = new MouseEvent('click', { button: 0, cancelable: true });
        fixture.componentInstance.login(repeated);
        expect(repeated.defaultPrevented).toBe(true);
        const root = TestBed.createComponent(AppComponent);
        root.componentInstance.restorePage();
        expect(loading.busy()).toBe(false);
    });
});
