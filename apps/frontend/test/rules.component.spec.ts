import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ConfirmDialogService } from '../src/app/core/services/confirm-dialog.service';
import { FeedbackService } from '../src/app/core/services/feedback.service';
import { Rule } from '../src/app/core/models/api.models';
import { RulesComponent } from '../src/app/features/rules/rules.component';
import { RulesService } from '../src/app/features/rules/rules.service';
describe('Rule editor validation and confirmations', () => {
    afterEach(() => TestBed.resetTestingModule());
    function setup(confirmed = false) {
        const save = vi.fn().mockReturnValue(of({ id: '1' }));
        const remove = vi.fn().mockReturnValue(of({ ok: true }));
        const api = {
            editorContext: () => of({ rules: [], repos: [{ id: '12', full_name: 'test/repo' }] }),
            labels: () => of([{ name: 'bug' }]),
            save,
            delete: remove,
        };
        const confirm = vi.fn().mockReturnValue(of(confirmed));
        TestBed.configureTestingModule({
            providers: [
                { provide: RulesService, useValue: api },
                { provide: FeedbackService, useValue: { success: vi.fn(), error: vi.fn() } },
                { provide: ConfirmDialogService, useValue: { confirm } },
            ],
        });
        return {
            component: TestBed.createComponent(RulesComponent).componentInstance,
            save,
            remove,
            confirm,
        };
    }
    it('prevents blank keywords and submits a valid typed rule', () => {
        const { component, save } = setup();
        component.form.patchValue({ repoId: '12', keyword: '   ' });
        component.save();
        expect(save).not.toHaveBeenCalled();
        component.form.patchValue({ keyword: 'bug' });
        component.save();
        expect(save).toHaveBeenCalledWith(
            {
                repoId: '12',
                eventType: 'issues.opened',
                keyword: 'bug',
                label: 'bug',
                enabled: true,
                slackEnabled: true,
            },
            undefined,
        );
    });
    const rule: Rule = {
        id: '1',
        repo_id: '12',
        keyword: 'bug',
        label: 'bug',
        enabled: true,
        slack_enabled: true,
        event_type: 'issues.opened',
    };
    it('does not delete when the confirmation dialog is dismissed', () => {
        const { component, remove } = setup(false);
        component.remove(rule);
        expect(remove).not.toHaveBeenCalled();
        expect(component.busy()).toBe(false);
    });
    it('deletes only after confirmation and clears its busy state', () => {
        const { component, remove } = setup(true);
        component.remove(rule);
        expect(remove).toHaveBeenCalledWith('1');
        expect(component.busy()).toBe(false);
    });
});
