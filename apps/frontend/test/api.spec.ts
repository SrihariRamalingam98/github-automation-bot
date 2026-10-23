import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventLogsService } from '../src/app/features/event-logs/event-logs.service';
describe('Typed event API', () => {
    afterEach(() => {
        TestBed.inject(HttpTestingController).verify();
        TestBed.resetTestingModule();
    });
    it('serializes selected filters and omits blank values', () => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(), provideHttpClientTesting()],
        });
        TestBed.inject(EventLogsService)
            .list({ repoId: '12', status: 'failed', type: '', before: '100' })
            .subscribe();
        const req = TestBed.inject(HttpTestingController).expectOne((r) => r.url === '/api/events');
        expect(req.request.params.get('repoId')).toBe('12');
        expect(req.request.params.has('type')).toBe(false);
        expect(req.request.params.get('before')).toBe('100');
        req.flush([]);
    });
});
