import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
    private readonly pending = signal(0);
    private readonly blockingRequests = signal(0);
    private readonly redirecting = signal(false);

    readonly busy = computed(() => this.pending() > 0 || this.redirecting());
    readonly blocking = computed(() => this.blockingRequests() > 0 || this.redirecting());

    begin(blocking = true): () => void {
        this.pending.update((count) => count + 1);
        if (blocking) this.blockingRequests.update((count) => count + 1);
        let finished = false;
        return () => {
            if (finished) return;
            finished = true;
            this.pending.update((count) => count - 1);
            if (blocking) this.blockingRequests.update((count) => count - 1);
        };
    }

    beginRedirect(): void {
        this.redirecting.set(true);
    }

    finishRedirect(): void {
        this.redirecting.set(false);
    }
}
