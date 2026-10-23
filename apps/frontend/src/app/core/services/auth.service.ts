import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { SuccessResponse } from '../models/api-response.models';
import { CurrentUser } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly http = inject(HttpClient);

    private readonly router = inject(Router);

    readonly user = signal<CurrentUser | null>(null);

    load(): Observable<CurrentUser> {
        return this.http.get<CurrentUser>('/api/me').pipe(tap((user) => this.user.set(user)));
    }

    expire(): void {
        this.user.set(null);
        void this.router.navigate(['/login'], { queryParams: { expired: 1 } });
    }

    logout(): Observable<SuccessResponse> {
        return this.http.post<SuccessResponse>('/api/logout', {}).pipe(
            tap(() => {
                this.user.set(null);
                void this.router.navigateByUrl('/login');
            }),
        );
    }
}
