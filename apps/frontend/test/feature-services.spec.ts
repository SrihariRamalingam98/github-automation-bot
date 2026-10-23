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
        http.expectOne('/api/events').flush(
            Array.from({ length: 10 }, (_, index) => ({ id: String(index) })),
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
});
