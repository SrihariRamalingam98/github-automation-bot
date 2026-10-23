import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, startWith, switchMap, tap } from 'rxjs';
import { BotEvent, Overview } from '../../core/models/api.models';
import { errorMessage } from '../../core/services/feedback.service';
import { StreamService } from '../../core/services/stream.service';
import { FeedbackComponent } from '../../shared/components/feedback/feedback.component';
import { StatusComponent } from '../../shared/components/status/status.component';
import { DashboardService } from './dashboard.service';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        DatePipe,
        RouterLink,
        MatButtonModule,
        MatCardModule,
        FeedbackComponent,
        StatusComponent,
    ],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
    private readonly api = inject(DashboardService);

    private readonly destroy = inject(DestroyRef);

    readonly loading = signal(true);

    readonly error = signal('');

    readonly events = signal<BotEvent[]>([]);

    readonly overview = signal<Overview>({
        repositories: 0,
        events: 0,
        successful_actions: 0,
        failures: 0,
    });

    eventLabel(event: BotEvent): string {
        return event.action ? event.event_type + '.' + event.action : event.event_type;
    }

    eventMarker(event: BotEvent): string {
        return event.event_type === 'push' ? 'P' : event.event_type === 'pull_request' ? 'PR' : 'I';
    }

    cards(): { label: string; value: number; hint: string }[] {
        const s = this.overview();
        return [
            {
                label: 'Connected repositories',
                value: s.repositories,
                hint: 'Ready for events',
            },
            {
                label: 'Events received',
                value: s.events,
                hint: 'Across all repositories',
            },
            {
                label: 'Successful actions',
                value: s.successful_actions,
                hint: 'Labels and notifications',
            },
            {
                label: 'Failed events',
                value: s.failures,
                hint: 'Need your attention',
            },
        ];
    }

    constructor() {
        inject(StreamService)
            .refresh$.pipe(
                startWith(undefined),
                switchMap(() =>
                    this.api.snapshot().pipe(
                        tap((data) => {
                            this.overview.set(data.overview);
                            this.events.set(data.events);
                            this.loading.set(false);
                            this.error.set('');
                        }),
                        catchError((e) => {
                            this.loading.set(false);
                            this.error.set(errorMessage(e));
                            return EMPTY;
                        }),
                    ),
                ),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe();
    }
}
