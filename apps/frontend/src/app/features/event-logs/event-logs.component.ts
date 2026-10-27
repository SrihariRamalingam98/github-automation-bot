import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { catchError, EMPTY, finalize, merge, startWith, Subject, switchMap, tap } from 'rxjs';
import { BotEvent, Repository } from '../../core/models/api.models';
import { EventHistoryRow } from '../../core/models/event-history';
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

    readonly rows = signal<EventHistoryRow[]>([]);
    readonly trackRow = (_index: number, row: EventHistoryRow) => row.key;
    readonly snapshot = signal('');
    readonly nextCursor = signal<string | null>(null);
    readonly previousCursors = signal<string[]>([]);
    readonly historyLoading = signal<string[]>([]);
    readonly historyErrors = signal<Record<string, string>>({});

    readonly repos = signal<Repository[]>([]);

    readonly before = signal('');

    readonly statuses = ['pending', 'processing', 'done', 'failed'];

    readonly columns = ['time', 'repository', 'status', 'retries', 'actions'];

    readonly filters = inject(FormBuilder).nonNullable.group({
        repoId: '',
        type: '',
        status: '',
        limit: 10,
    });

    constructor() {
        this.loadRepositories();
        this.filters.valueChanges
            .pipe(
                tap(() => {
                    this.before.set('');
                    this.rows.set([]);
                    this.snapshot.set('');
                    this.previousCursors.set([]);
                    this.nextCursor.set(null);
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
                            snapshot: this.before() ? this.snapshot() : undefined,
                        })
                        .pipe(
                            tap((page) => {
                                this.rows.update((current) =>
                                    page.items.map((row) => {
                                        const expanded = current.find(
                                            (previous) =>
                                                previous.key === row.key &&
                                                previous.snapshot === row.snapshot,
                                        );
                                        if (
                                            !expanded ||
                                            expanded.deliveries.length <= row.deliveries.length
                                        )
                                            return row;
                                        const fresh = new Set(
                                            row.deliveries.map((delivery) => delivery.id),
                                        );
                                        return {
                                            ...row,
                                            deliveries: [
                                                ...row.deliveries,
                                                ...expanded.deliveries.filter(
                                                    (delivery) => !fresh.has(delivery.id),
                                                ),
                                            ],
                                            history_next_cursor: expanded.history_next_cursor,
                                        };
                                    }),
                                );
                                this.snapshot.set(page.snapshot || '');
                                this.nextCursor.set(page.next_cursor);
                                this.loading.set(false);
                                this.error.set('');
                            }),
                            catchError((e) => {
                                this.nextCursor.set(null);
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
        this.rows.set([]);
        this.snapshot.set('');
        this.previousCursors.set([]);
        this.nextCursor.set(null);
        this.loading.set(true);
        this.reload.next();
    }

    older(): void {
        const next = this.nextCursor();
        if (next && !this.loading()) {
            this.previousCursors.update((cursors) => [...cursors, this.before()]);
            this.before.set(next);
            this.loading.set(true);
            this.reload.next();
        }
    }

    newer(): void {
        if (this.loading() || !this.previousCursors().length) return;
        const cursors = [...this.previousCursors()];
        this.before.set(cursors.pop()!);
        this.previousCursors.set(cursors);
        this.loading.set(true);
        this.reload.next();
    }

    olderDeliveries(row: EventHistoryRow): void {
        if (!row.history_next_cursor || this.historyLoading().includes(row.key)) return;
        this.historyLoading.update((keys) => [...keys, row.key]);
        this.historyErrors.update((errors) => ({ ...errors, [row.key]: '' }));
        this.api
            .deliveries(row.latest_id, {
                before: row.history_next_cursor,
                snapshot: row.snapshot,
                limit: 20,
            })
            .pipe(
                finalize(() =>
                    this.historyLoading.update((keys) => keys.filter((key) => key !== row.key)),
                ),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: (page) =>
                    this.rows.update((rows) =>
                        rows.map((current) => {
                            if (current.key !== row.key || current.snapshot !== row.snapshot)
                                return current;
                            const seen = new Set(current.deliveries.map((delivery) => delivery.id));
                            return {
                                ...current,
                                deliveries: [
                                    ...current.deliveries,
                                    ...page.items.filter((delivery) => !seen.has(delivery.id)),
                                ],
                                history_next_cursor: page.next_cursor,
                            };
                        }),
                    ),
                error: (error: unknown) =>
                    this.historyErrors.update((errors) => ({
                        ...errors,
                        [row.key]: errorMessage(error),
                    })),
            });
    }
}
