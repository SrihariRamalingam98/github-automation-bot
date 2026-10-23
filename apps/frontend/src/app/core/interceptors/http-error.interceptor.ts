import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const httpErrorInterceptor: HttpInterceptorFn = (request, next) => {
    const auth = inject(AuthService);
    return next(request).pipe(
        catchError((error: unknown) => {
            if (
                request.url.startsWith('/api/') &&
                error instanceof HttpErrorResponse &&
                error.status === 401 &&
                request.url !== '/api/me'
            ) {
                auth.expire();
            }
            // Preserve the server error for feature loading/error states and feedback.
            return throwError(() => error);
        }),
    );
};
