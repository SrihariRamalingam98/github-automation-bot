import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { finalize, EMPTY, switchMap } from 'rxjs';
import { AvailableRepository, Repository } from '../../core/models/api.models';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { errorMessage, FeedbackService } from '../../core/services/feedback.service';
import { FeedbackComponent } from '../../shared/components/feedback/feedback.component';
import { StatusComponent } from '../../shared/components/status/status.component';
import { RepositoriesService } from './repositories.service';

@Component({
    selector: 'app-repositories',
    standalone: true,
    imports: [
        DatePipe,
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        MatCardModule,
        FeedbackComponent,
        StatusComponent,
    ],
    templateUrl: './repositories.component.html',
    styleUrl: './repositories.component.scss',
})
export class RepositoriesComponent {
    private readonly api = inject(RepositoriesService);

    private readonly confirmDialog = inject(ConfirmDialogService);

    private readonly feedback = inject(FeedbackService);

    private readonly destroy = inject(DestroyRef);

    readonly loading = signal(true);

    readonly busy = signal(false);

    readonly error = signal('');

    readonly repos = signal<Repository[]>([]);

    readonly available = signal<AvailableRepository[]>([]);

    readonly selected = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
    });

    constructor() {
        this.load();
    }

    load(): void {
        this.loading.set(true);
        this.error.set('');
        this.api
            .workspace()
            .pipe(
                finalize(() => this.loading.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: (data) => {
                    this.repos.set(data.repos);
                    this.available.set(data.available);
                },
                error: (e) => this.error.set(errorMessage(e)),
            });
    }

    connect(): void {
        if (this.selected.invalid || this.busy()) return;
        this.busy.set(true);
        this.api
            .connect(this.selected.value)
            .pipe(
                finalize(() => this.busy.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: () => {
                    this.feedback.success('Repository connected. Webhook is ready.');
                    this.selected.reset();
                    this.load();
                },
                error: (e) => {
                    this.feedback.error(e);
                    this.load();
                },
            });
    }

    webhookDescription(repo: Repository): string {
        return repo.hook_id
            ? 'Webhook registered - #' + repo.hook_id
            : 'Registration incomplete. Disconnect and retry. Check GitHub for an orphaned webhook if registration timed out.';
    }

    disconnect(repo: Repository): void {
        if (this.busy()) {
            return;
        }
        this.busy.set(true);
        this.confirmDialog
            .confirm({
                title: 'Disconnect repository?',
                message:
                    'Disconnect ' +
                    repo.full_name +
                    '? This removes the webhook, disables rules and stops pending events. Event history is preserved.',
                confirmLabel: 'Disconnect repository',
            })
            .pipe(
                switchMap((confirmed) => (confirmed ? this.api.disconnect(repo.id) : EMPTY)),
                finalize(() => this.busy.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: () => {
                    this.feedback.success('Repository disconnected. Event history preserved.');
                    this.load();
                },
                error: (e) => this.feedback.error(e),
            });
    }
}
