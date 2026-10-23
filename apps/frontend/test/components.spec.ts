import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FeedbackComponent } from '../src/app/shared/components/feedback/feedback.component';
import { StatusComponent } from '../src/app/shared/components/status/status.component';
describe('Accessible shared UI components', () => {
    afterEach(() => TestBed.resetTestingModule());
    it('renders failures as an alert and suppresses empty state', () => {
        const fixture = TestBed.createComponent(FeedbackComponent);
        fixture.componentRef.setInput('error', 'Request failed');
        fixture.componentRef.setInput('empty', true);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('[role=alert]')?.textContent).toContain('Request failed');
        expect(element.querySelector('.empty-state')).toBeNull();
    });
    it('renders an accessible loading spinner', () => {
        const fixture = TestBed.createComponent(FeedbackComponent);
        fixture.componentRef.setInput('loading', true);
        fixture.detectChanges();
        expect(
            (fixture.nativeElement as HTMLElement).querySelector('[aria-label=Loading]'),
        ).toBeTruthy();
    });
    it('uses visible text as well as color for failed status', () => {
        const fixture = TestBed.createComponent(StatusComponent);
        fixture.componentRef.setInput('value', 'failed');
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).querySelector('.failure')?.textContent).toBe(
            'failed',
        );
    });
});
