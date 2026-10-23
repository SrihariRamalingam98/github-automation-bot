import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';
import {
    ConfirmDialogComponent,
    ConfirmDialogData,
} from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
    private readonly dialog = inject(MatDialog);

    confirm(data: ConfirmDialogData): Observable<boolean> {
        return this.dialog
            .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
                data,
                width: '440px',
                maxWidth: '95vw',
                autoFocus: 'first-tabbable',
                restoreFocus: true,
            })
            .afterClosed()
            .pipe(map((result) => result === true));
    }
}
