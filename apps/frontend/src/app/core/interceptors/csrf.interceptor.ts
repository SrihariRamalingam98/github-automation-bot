import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const csrfInterceptor: HttpInterceptorFn = (request, next) => {
    if (!request.url.startsWith('/api/')) {
        return next(request);
    }
    const token = inject(AuthService).user()?.csrfToken;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    return next(
        request.clone({
            withCredentials: true,
            ...(token && mutating ? { setHeaders: { 'X-CSRF-Token': token } } : {}),
        }),
    );
};
