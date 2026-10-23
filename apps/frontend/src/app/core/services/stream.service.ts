import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, share, Subscription } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class StreamService {
    private readonly auth = inject(AuthService);

    readonly connected = signal(false);

    readonly error = signal('');

    readonly refresh$ = new Observable<void>((subscriber) => {
        const source = new EventSource('/api/stream', {
            withCredentials: true,
        });
        let sessionCheck: Subscription | undefined;
        source.onopen = () => {
            this.connected.set(true);
            this.error.set('');
        };
        source.addEventListener('refresh', () => {
            this.error.set('');
            subscriber.next();
        });
        source.addEventListener('unavailable', () => {
            this.connected.set(false);
            this.error.set('Live updates are temporarily unavailable. Reconnecting...');
        });
        source.addEventListener('expired', () => {
            source.close();
            this.auth.expire();
            subscriber.complete();
        });
        source.onerror = () => {
            this.connected.set(false);
            this.error.set('Live updates disconnected. Reconnecting...');
            if (sessionCheck && !sessionCheck.closed) return;
            // EventSource hides HTTP status. A same-origin request distinguishes 401 from a network outage.
            sessionCheck = this.auth.load().subscribe({
                error: (error: unknown) => {
                    if (error instanceof HttpErrorResponse && error.status === 401) {
                        source.close();
                        this.auth.expire();
                        subscriber.complete();
                    }
                },
            });
        };
        return () => {
            sessionCheck?.unsubscribe();
            source.close();
            this.connected.set(false);
        };
    }).pipe(share());
}
