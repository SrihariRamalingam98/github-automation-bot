import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
    const path = request.url.split('?')[0];
    const backgroundRead =
        request.method === 'GET' && ['/api/events', '/api/overview'].includes(path);
    // Polling and the long-lived stream must not show a loader or interrupt interaction.
    if (!request.url.startsWith('/api/') || path === '/api/stream' || backgroundRead) {
        return next(request);
    }
    const loading = inject(LoadingService);
    return defer(() => {
        const finish = loading.begin();
        return defer(() => next(request)).pipe(finalize(finish));
    });
};
