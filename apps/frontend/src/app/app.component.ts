import { Component, DestroyRef, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { A11yModule } from '@angular/cdk/a11y';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
    NavigationCancel,
    NavigationEnd,
    NavigationError,
    NavigationSkipped,
    NavigationStart,
    Router,
    RouterOutlet,
} from '@angular/router';
import { LoadingService } from './core/services/loading.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, MatProgressBarModule, A11yModule],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent {
    readonly loading = inject(LoadingService);

    constructor() {
        const navigation = new Map<number, () => void>();
        inject(Router)
            .events.pipe(takeUntilDestroyed())
            .subscribe((event) => {
                if (event instanceof NavigationStart)
                    navigation.set(event.id, this.loading.begin());
                if (
                    event instanceof NavigationEnd ||
                    event instanceof NavigationCancel ||
                    event instanceof NavigationError ||
                    event instanceof NavigationSkipped
                ) {
                    navigation.get(event.id)?.();
                    navigation.delete(event.id);
                }
            });
        inject(DestroyRef).onDestroy(() => navigation.forEach((finish) => finish()));
    }

    @HostListener('window:pageshow')
    restorePage(): void {
        // Browser back/forward cache may restore the page after leaving for OAuth.
        this.loading.finishRedirect();
    }

    @HostListener('window:keydown.escape')
    cancelRedirect(): void {
        // Escape can cancel a browser navigation before the document is unloaded.
        this.loading.finishRedirect();
    }
}
