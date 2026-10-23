import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [MatButtonModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss',
})
export class LoginComponent {
    readonly loading = inject(LoadingService);

    private readonly router = inject(Router);

    readonly unavailable = inject(ActivatedRoute).snapshot.queryParamMap.has('unavailable');

    readonly expired = inject(ActivatedRoute).snapshot.queryParamMap.has('expired');

    retry(): void {
        void this.router.navigateByUrl('/dashboard');
    }

    login(event: MouseEvent): void {
        if (this.loading.blocking()) {
            event.preventDefault();
            return;
        }
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
            return;
        this.loading.beginRedirect();
    }
}
