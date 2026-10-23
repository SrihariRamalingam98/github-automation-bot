import { Component, input } from '@angular/core';

@Component({
    selector: 'app-empty-state',
    standalone: true,
    templateUrl: './empty-state.component.html',
    styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
    readonly title = input('Nothing here yet');

    readonly description = input('Your activity will appear here.');
}
