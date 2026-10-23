import { ApiErrorResponse } from '../models/api-response.models';
import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

export function errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
        const body = error.error as Partial<ApiErrorResponse> | null;
        if (body?.message)
            return Array.isArray(body.message) ? body.message.join('. ') : body.message;
        return error.status === 0
            ? 'Unable to reach the server. Please retry.'
            : `Request failed (${error.status}). Please retry.`;
    }
    return 'Something went wrong. Please retry.';
}
@Injectable({ providedIn: 'root' })
export class FeedbackService {
    private readonly snack = inject(MatSnackBar);

    success(message: string): void {
        this.snack.open(message, 'Dismiss', { duration: 5000 });
    }

    error(error: unknown): void {
        this.snack.open(errorMessage(error), 'Dismiss', { duration: 8000 });
    }
}
