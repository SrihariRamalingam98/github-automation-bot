import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { catchError, EMPTY, merge, startWith, Subject, switchMap, tap } from 'rxjs';
import { BotEvent, Repository } from '../../core/models/api.models';
import { errorMessage } from '../../core/services/feedback.service';
import { StreamService } from '../../core/services/stream.service';
import { FeedbackComponent } from '../../shared/components/feedback/feedback.component';
import { StatusComponent } from '../../shared/components/status/status.component';
import { RepositoriesService } from '../repositories/repositories.service';
import { EventLogsService } from './event-logs.service';

@Component({
    selector: 'app-event-logs',
    standalone: true,
    imports: [
        DatePipe,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        MatTableModule,
        FeedbackComponent,
        StatusComponent,
    ],
    templateUrl: './event-logs.component.html',
    styleUrl: './event-logs.component.scss',
})
export class EventLogsComponent {
    private readonly api = inject(EventLogsService);

    private readonly repositories = inject(RepositoriesService);

    private readonly destroy = inject(DestroyRef);

    private readonly reload = new Subject<void>();

    readonly loading = signal(true);

    readonly error = signal('');

    readonly repositoryError = signal('');

    readonly events = signal<BotEvent[]>([]);

    readonly repos = signal<Repository[]>([]);

    readonly before = signal('');

    readonly statuses = ['pending', 'processing', 'done', 'failed'];

    readonly columns = ['time', 'repository', 'status', 'retries', 'actions'];

    readonly filters = inject(FormBuilder).nonNullable.group({
        repoId: '',
        type: '',
        status: '',
    });

    constructor() {
        this.loadRepositories();
        this.filters.valueChanges
            .pipe(
                tap(() => {
                    this.before.set('');
                    this.loading.set(true);
                }),
                takeUntilDestroyed(),
            )
            .subscribe(() => this.reload.next());
        merge(this.reload, inject(StreamService).refresh$)
            .pipe(
                startWith(undefined),
                switchMap(() =>
                    this.api
                        .list({
                            ...this.filters.getRawValue(),
                            before: this.before(),
                        })
                        .pipe(
                            tap((events) => {
                                this.events.set(events);
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

    private loadRepositories(): void {
        this.repositories
            .list()
            .pipe(takeUntilDestroyed(this.destroy))
            .subscribe({
                next: (repos) => {
                    this.repos.set(repos);
                    this.repositoryError.set('');
                },
                error: (error: unknown) =>
                    this.repositoryError.set(
                        'Repository filters could not be loaded. ' + errorMessage(error),
                    ),
            });
    }

    eventLabel(event: BotEvent): string {
        return event.action ? event.event_type + '.' + event.action : event.event_type;
    }

    retryCount(event: BotEvent): number {
        return Math.max(0, event.attempts - 1);
    }

    refresh(): void {
        if (this.repositoryError()) {
            this.loadRepositories();
        }
        this.before.set('');
        this.loading.set(true);
        this.reload.next();
    }

    older(): void {
        const last = this.events().at(-1);
        if (last) {
            this.before.set(last.id);
            this.loading.set(true);
            this.reload.next();
        }
    }
}
