import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Repository } from '../src/app/core/models/api.models';
import { ConfirmDialogService } from '../src/app/core/services/confirm-dialog.service';
import { FeedbackService } from '../src/app/core/services/feedback.service';
import { RepositoriesComponent } from '../src/app/features/repositories/repositories.component';
import { RepositoriesService } from '../src/app/features/repositories/repositories.service';
describe('Repository disconnect confirmation', () => {
    afterEach(() => TestBed.resetTestingModule());
    const repo: Repository = { id: '12', full_name: 'test/repo', hook_id: '4', created_at: null };
    function setup(confirmed: boolean) {
        const disconnect = vi.fn().mockReturnValue(of({ ok: true }));
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: RepositoriesService,
                    useValue: { workspace: () => of({ repos: [repo], available: [] }), disconnect },
                },
                { provide: ConfirmDialogService, useValue: { confirm: () => of(confirmed) } },
                { provide: FeedbackService, useValue: { success: vi.fn(), error: vi.fn() } },
            ],
        });
        return {
            component: TestBed.createComponent(RepositoriesComponent).componentInstance,
            disconnect,
        };
    }
    it('does not disconnect after cancel', () => {
        const { component, disconnect } = setup(false);
        component.disconnect(repo);
        expect(disconnect).not.toHaveBeenCalled();
        expect(component.busy()).toBe(false);
    });
    it('disconnects once after confirmation', () => {
        const { component, disconnect } = setup(true);
        component.disconnect(repo);
        expect(disconnect).toHaveBeenCalledExactlyOnceWith('12');
        expect(component.busy()).toBe(false);
    });
});
