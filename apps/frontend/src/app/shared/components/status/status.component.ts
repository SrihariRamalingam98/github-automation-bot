import { Component, input } from '@angular/core';

@Component({
    selector: 'app-status',
    standalone: true,
    templateUrl: './status.component.html',
    styleUrl: './status.component.scss',
})
export class StatusComponent {
    readonly value = input.required<string>();
}
