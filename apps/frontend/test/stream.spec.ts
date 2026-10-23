import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { StreamService } from '../src/app/core/services/stream.service';
import { AuthService } from '../src/app/core/services/auth.service';
class FakeEventSource {
    static current: FakeEventSource;
    onopen?: () => void;
    onerror?: () => void;
    listeners = new Map<string, () => void>();
    close = vi.fn();
    constructor() {
        FakeEventSource.current = this;
    }
    addEventListener(type: string, callback: () => void): void {
        this.listeners.set(type, callback);
    }
}
describe('SSE lifecycle', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        TestBed.resetTestingModule();
    });
    function setup() {
        vi.stubGlobal('EventSource', FakeEventSource);
        const auth = {
            load: vi.fn().mockReturnValue(of({ login: 'test' })),
            expire: vi.fn(),
        };
        TestBed.configureTestingModule({
            providers: [{ provide: AuthService, useValue: auth }],
        });
        return { stream: TestBed.inject(StreamService), auth };
    }
    it('shares the connection and closes it when the last subscriber leaves', () => {
        const { stream } = setup();
        const first = stream.refresh$.subscribe();
        const source = FakeEventSource.current;
        const next = vi.fn();
        const second = stream.refresh$.subscribe(next);
        source.onopen?.();
        expect(stream.connected()).toBe(true);
        source.listeners.get('refresh')?.();
        expect(next).toHaveBeenCalledTimes(1);
        first.unsubscribe();
        expect(source.close).not.toHaveBeenCalled();
        second.unsubscribe();
        expect(source.close).toHaveBeenCalledTimes(1);
        expect(stream.connected()).toBe(false);
    });
    it('ends a revoked session when reconnection returns 401', () => {
        const { stream, auth } = setup();
        auth.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
        const subscription = stream.refresh$.subscribe();
        FakeEventSource.current.onerror?.();
        expect(auth.expire).toHaveBeenCalledTimes(1);
        expect(subscription.closed).toBe(true);
    });
});
