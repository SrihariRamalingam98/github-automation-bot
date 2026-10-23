import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { StreamService } from '../../core/services/stream.service';
import { LoadingService } from '../../core/services/loading.service';

@Component({
    selector: 'app-main-layout',
    standalone: true,
    imports: [
        RouterLink,
        RouterLinkActive,
        RouterOutlet,
        MatButtonModule,
        MatSidenavModule,
        MatToolbarModule,
        MatSnackBarModule,
    ],
    templateUrl: './main-layout.component.html',
    styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
    readonly loading = inject(LoadingService);
    readonly auth = inject(AuthService);

    readonly stream = inject(StreamService);

    private readonly feedback = inject(FeedbackService);

    private readonly destroy = inject(DestroyRef);

    readonly mobile = signal(window.matchMedia('(max-width: 800px)').matches);

    readonly opened = signal(!this.mobile());

    readonly links = [
        { path: '/dashboard', name: 'Overview', icon: '01' },
        { path: '/repositories', name: 'Repositories', icon: '02' },
        { path: '/rules', name: 'Automation rules', icon: '03' },
        { path: '/events', name: 'Event logs', icon: '04' },
    ];

    constructor() {
        const query = window.matchMedia('(max-width: 800px)');
        const changed = (event: MediaQueryListEvent) => {
            this.mobile.set(event.matches);
            this.opened.set(!event.matches);
        };
        query.addEventListener('change', changed);
        this.destroy.onDestroy(() => query.removeEventListener('change', changed));
        this.stream.refresh$.pipe(takeUntilDestroyed()).subscribe();
    }

    closeMobile(): void {
        if (this.mobile()) this.opened.set(false);
    }

    logout(): void {
        if (this.loading.blocking()) return;
        this.auth
            .logout()
            .pipe(takeUntilDestroyed(this.destroy))
            .subscribe({ error: (e) => this.feedback.error(e) });
    }
}
