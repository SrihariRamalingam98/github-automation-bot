import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { finalize, of, switchMap, catchError, EMPTY } from 'rxjs';
import { Repository, Rule, Label } from '../../core/models/api.models';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { errorMessage, FeedbackService } from '../../core/services/feedback.service';
import { FeedbackComponent } from '../../shared/components/feedback/feedback.component';
import { RulesService } from './rules.service';

@Component({
    selector: 'app-rules',
    standalone: true,
    imports: [
        ReactiveFormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatCheckboxModule,
        FeedbackComponent,
    ],
    templateUrl: './rules.component.html',
    styleUrl: './rules.component.scss',
})
export class RulesComponent {
    private readonly api = inject(RulesService);

    private readonly confirmDialog = inject(ConfirmDialogService);

    private readonly feedback = inject(FeedbackService);

    private readonly destroy = inject(DestroyRef);

    readonly loading = signal(true);

    readonly busy = signal(false);

    readonly error = signal('');

    readonly labelError = signal('');

    readonly rules = signal<Rule[]>([]);

    readonly repos = signal<Repository[]>([]);

    readonly labels = signal<Label[]>([]);

    readonly editing = signal<string | undefined>(undefined);

    readonly form = inject(FormBuilder).nonNullable.group({
        repoId: ['', Validators.required],
        eventType: ['issues.opened', Validators.required],
        keyword: ['bug', [Validators.required, Validators.maxLength(80), Validators.pattern(/\S/)]],
        label: ['bug', Validators.required],
        slackEnabled: true,
        enabled: true,
    });

    constructor() {
        this.load();
        this.form.controls.repoId.valueChanges
            .pipe(
                switchMap((id) => {
                    this.labelError.set('');
                    return id
                        ? this.api.labels(id).pipe(
                              catchError(() => {
                                  this.labelError.set(
                                      'Could not load labels. Retry by selecting the repository again.',
                                  );
                                  return of([] as Label[]);
                              }),
                          )
                        : of([] as Label[]);
                }),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe((labels) => this.labels.set(labels));
    }

    repoName(id: string): string {
        return this.repos().find((r) => r.id === id)?.full_name || id;
    }

    load(): void {
        this.loading.set(true);
        this.error.set('');
        this.api
            .editorContext()
            .pipe(
                finalize(() => this.loading.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: (data) => {
                    this.rules.set(data.rules);
                    this.repos.set(data.repos);
                },
                error: (e) => this.error.set(errorMessage(e)),
            });
    }

    save(): void {
        if (this.form.invalid || this.busy()) {
            this.form.markAllAsTouched();
            return;
        }
        this.busy.set(true);
        this.api
            .save(this.form.getRawValue(), this.editing())
            .pipe(
                finalize(() => this.busy.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: () => {
                    this.feedback.success('Rule saved.');
                    this.reset();
                    this.load();
                },
                error: (e) => this.feedback.error(e),
            });
    }

    edit(rule: Rule): void {
        this.editing.set(rule.id);
        this.form.setValue({
            repoId: rule.repo_id,
            eventType: rule.event_type,
            keyword: rule.keyword,
            label: rule.label,
            slackEnabled: rule.slack_enabled,
            enabled: rule.enabled,
        });
        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    reset(): void {
        this.editing.set(undefined);
        this.form.reset({
            repoId: '',
            eventType: 'issues.opened',
            keyword: 'bug',
            label: 'bug',
            slackEnabled: true,
            enabled: true,
        });
    }

    toggle(rule: Rule): void {
        this.busy.set(true);
        this.api
            .save(
                {
                    repoId: rule.repo_id,
                    eventType: rule.event_type,
                    keyword: rule.keyword,
                    label: rule.label,
                    slackEnabled: rule.slack_enabled,
                    enabled: !rule.enabled,
                },
                rule.id,
            )
            .pipe(
                finalize(() => this.busy.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: () => {
                    this.feedback.success('Rule updated.');
                    this.load();
                },
                error: (e) => this.feedback.error(e),
            });
    }

    remove(rule: Rule): void {
        if (this.busy()) {
            return;
        }
        this.busy.set(true);
        this.confirmDialog
            .confirm({
                title: 'Delete automation rule?',
                message:
                    'Delete the rule matching "' +
                    rule.keyword +
                    '"? This action cannot be undone.',
                confirmLabel: 'Delete rule',
            })
            .pipe(
                switchMap((confirmed) => (confirmed ? this.api.delete(rule.id) : EMPTY)),
                finalize(() => this.busy.set(false)),
                takeUntilDestroyed(this.destroy),
            )
            .subscribe({
                next: () => {
                    this.feedback.success('Rule deleted.');
                    this.load();
                },
                error: (e) => this.feedback.error(e),
            });
    }
}
