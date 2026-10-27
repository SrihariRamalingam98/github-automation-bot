import { eventPage, historyRow } from './event-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardService } from '../src/app/features/dashboard/dashboard.service';
import { RepositoriesService } from '../src/app/features/repositories/repositories.service';
import { RulesService } from '../src/app/features/rules/rules.service';
describe('Dedicated feature HTTP services', () => {
    function setup() {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        return TestBed.inject(HttpTestingController);
    }
    afterEach(() => {
        TestBed.inject(HttpTestingController).verify();
        TestBed.resetTestingModule();
    });
    it('excludes connected repositories from the available choices', () => {
        const http = setup();
        let names: string[] = [];
        TestBed.inject(RepositoriesService)
            .workspace()
            .subscribe((data) => {
                names = data.available.map((repo) => repo.name);
            });
        http.expectOne('/api/repos').flush([{ id: '1', full_name: 'test/connected' }]);
        http.expectOne('/api/available-repos').flush([
            { id: 1, name: 'test/connected' },
            { id: 2, name: 'test/new' },
        ]);
        expect(names).toEqual(['test/new']);
    });
    it('loads dashboard statistics and limits recent activity to eight events', () => {
        const http = setup();
        let count = 0;
        TestBed.inject(DashboardService)
            .snapshot()
            .subscribe((data) => {
                count = data.events.length;
            });
        http.expectOne('/api/overview').flush({
            repositories: 1,
            events: 10,
            successful_actions: 2,
            failures: 0,
        });
        const request = http.expectOne((req) => req.url === '/api/events');
        expect(request.request.params.get('limit')).toBe('8');
        request.flush(
            eventPage(Array.from({ length: 8 }, (_, index) => historyRow({ id: String(index) }))),
        );
        expect(count).toBe(8);
    });
    it('preserves rule create and edit API methods', () => {
        const http = setup();
        const input = {
            repoId: '12',
            eventType: 'issues.opened',
            keyword: 'bug',
            label: 'bug',
            slackEnabled: true,
            enabled: true,
        };
        const rules = TestBed.inject(RulesService);
        rules.save(input).subscribe();
        const create = http.expectOne('/api/rules');
        expect(create.request.method).toBe('POST');
        expect(create.request.body).toEqual(input);
        create.flush({ id: '1' });
        rules.save(input, '1').subscribe();
        const update = http.expectOne('/api/rules/1');
        expect(update.request.method).toBe('PUT');
        update.flush({ id: '1' });
    });
    it('groups dashboard issue deliveries before limiting recent activity and keeps delivery totals unchanged', () => {
        const http = setup();
        let rows = 0;
        let deliveries = 0;
        let status = '';
        let total = 0;
        TestBed.inject(DashboardService)
            .snapshot()
            .subscribe((data) => {
                rows = data.events.length;
                deliveries = data.events[0].deliveries.length;
                status = data.events[0].status;
                total = data.overview.events;
            });
        http.expectOne('/api/overview').flush({
            repositories: 1,
            events: 2,
            successful_actions: 1,
            failures: 0,
        });
        const opened = historyRow({
            id: '1',
            repo_id: '9',
            event_type: 'issues',
            action: 'opened',
            subject_number: 5,
            status: 'pending',
            actions: [{ kind: 'label:3', status: 'ok', detail: null }],
        });
        const labeled = historyRow({
            id: '2',
            repo_id: '9',
            event_type: 'issues',
            action: 'labeled',
            subject_number: 5,
            status: 'done',
            actions: [],
        });
        http.expectOne((request) => request.url === '/api/events').flush(
            eventPage([historyRow(opened, [labeled, opened])]),
        );
        expect(rows).toBe(1);
        expect(deliveries).toBe(2);
        expect(status).toBe('pending');
        expect(total).toBe(2);
    });
});
