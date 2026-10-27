import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NEVER, of, throwError } from 'rxjs';
import { StreamService } from '../src/app/core/services/stream.service';
import { EventLogsComponent } from '../src/app/features/event-logs/event-logs.component';
import { EventLogsService } from '../src/app/features/event-logs/event-logs.service';
import { RepositoriesService } from '../src/app/features/repositories/repositories.service';
import { eventPage, historyRow } from './event-fixtures';
describe('Event filter errors', () => {
    afterEach(() => TestBed.resetTestingModule());
    it('renders one issue row with a direct GitHub link and both delivery histories', () => {
        const opened = {
            id: '1',
            repo_id: '9',
            delivery_id: 'opened-delivery',
            full_name: 'owner/repo',
            event_type: 'issues',
            action: 'opened',
            status: 'pending',
            attempts: 2,
            error: 'Slack failed',
            received_at: '2026-10-23T00:00:00Z',
            next_attempt_at: '2026-10-23T00:02:00Z',
            processed_at: null,
            subject_number: 5,
            subject_title: 'Bug in Login API',
            subject_url: 'https://github.com/owner/repo/issues/5',
            repository_url: 'https://github.com/owner/repo',
            actions: [{ kind: 'label:3', status: 'ok', detail: 'Added bug' }],
        };
        const labeled = {
            ...opened,
            id: '2',
            action: 'labeled',
            delivery_id: 'labeled-delivery',
            status: 'done',
            attempts: 1,
            error: null,
            next_attempt_at: null,
            actions: [],
        };
        TestBed.configureTestingModule({
            providers: [
                provideNoopAnimations(),
                { provide: RepositoriesService, useValue: { list: () => of([]) } },
                {
                    provide: EventLogsService,
                    useValue: {
                        list: () => of(eventPage([historyRow(opened, [labeled, opened])])),
                    },
                },
                { provide: StreamService, useValue: { refresh$: NEVER } },
            ],
        });
        const fixture = TestBed.createComponent(EventLogsComponent);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelectorAll('tr.mat-mdc-row')).toHaveLength(1);
        const link = element.querySelector<HTMLAnchorElement>('.subject-link');
        expect(link?.href).toBe('https://github.com/owner/repo/issues/5');
        expect(link?.target).toBe('_blank');
        expect(link?.rel).toContain('noopener');
        expect(element.textContent).toContain('Webhook history (2)');
        expect(element.textContent).toContain('opened-delivery');
        expect(element.textContent).toContain('labeled-delivery');
        expect(element.textContent).toContain('Pending retry');
        expect(element.textContent).toContain('Added bug');
    });
    it('does not hide repository filter failures when event history succeeds', () => {
        TestBed.configureTestingModule({
            providers: [
                provideNoopAnimations(),
                {
                    provide: RepositoriesService,
                    useValue: {
                        list: () =>
                            throwError(
                                () =>
                                    new HttpErrorResponse({
                                        status: 503,
                                        error: { message: 'Temporarily unavailable' },
                                    }),
                            ),
                    },
                },
                { provide: EventLogsService, useValue: { list: () => of(eventPage([])) } },
                { provide: StreamService, useValue: { refresh$: NEVER } },
            ],
        });
        const fixture = TestBed.createComponent(EventLogsComponent);
        fixture.detectChanges();
        expect(fixture.componentInstance.loading()).toBe(false);
        expect(
            (fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent,
        ).toContain('Repository filters could not be loaded');
    });
    it('shows retry timing, action progress and final completion without a terminal retry time', () => {
        const pending = {
            id: '1',
            repo_id: '2',
            delivery_id: 'a'.repeat(32),
            full_name: 'test/repo',
            event_type: 'issues',
            action: 'opened',
            status: 'pending',
            attempts: 2,
            error: 'Slack request failed (HTTP 503)',
            received_at: '2026-10-23T00:00:00Z',
            next_attempt_at: '2026-10-23T00:02:00Z',
            processed_at: null,
            actions: [
                { kind: 'label:3', status: 'ok', detail: 'Added bug' },
                { kind: 'slack:3', status: 'failed', detail: 'HTTP 503' },
            ],
        };
        TestBed.configureTestingModule({
            providers: [
                provideNoopAnimations(),
                { provide: RepositoriesService, useValue: { list: () => of([]) } },
                {
                    provide: EventLogsService,
                    useValue: { list: () => of(eventPage([historyRow(pending)])) },
                },
                { provide: StreamService, useValue: { refresh$: NEVER } },
            ],
        });
        const fixture = TestBed.createComponent(EventLogsComponent);
        fixture.detectChanges();
        let text = (fixture.nativeElement as HTMLElement).textContent!;
        expect(text).toContain('Next attempt');
        expect(text).toContain('2 attempts');
        expect(text).toContain('label:3 · ok');
        expect(text).toContain('slack:3 · failed');
        expect(text).toContain('HTTP 503');
        fixture.componentInstance.rows.set([
            historyRow({
                ...pending,
                status: 'done',
                error: null,
                next_attempt_at: null,
                processed_at: '2026-10-23T00:02:01Z',
                actions: [{ kind: 'slack:3', status: 'ok', detail: 'Slack notification sent' }],
            }),
        ]);
        fixture.detectChanges();
        text = (fixture.nativeElement as HTMLElement).textContent!;
        expect(text).toContain('Finished');
        expect(text).not.toContain('Next attempt');
        expect(text).toContain('slack:3 · ok');
    });
});
