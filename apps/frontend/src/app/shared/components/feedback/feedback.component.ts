import { Component, input } from '@angular/core';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { LoadingSpinnerComponent } from '../loading-spinner/loading-spinner.component';

@Component({
    selector: 'app-feedback',
    standalone: true,
    imports: [LoadingSpinnerComponent, EmptyStateComponent],
    templateUrl: './feedback.component.html',
    styleUrl: './feedback.component.scss',
})
export class FeedbackComponent {
    readonly loading = input(false);

    readonly error = input('');

    readonly empty = input(false);

    readonly title = input('Nothing here yet');

    readonly description = input('Your activity will appear here.');
}
