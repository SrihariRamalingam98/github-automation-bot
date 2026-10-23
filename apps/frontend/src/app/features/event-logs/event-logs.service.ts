import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EventFilters } from '../../core/models/api-response.models';
import { BotEvent } from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class EventLogsService {
    private readonly http = inject(HttpClient);

    list(filters: EventFilters = {}): Observable<BotEvent[]> {
        const params = new HttpParams({
            fromObject: Object.fromEntries(
                Object.entries(filters).filter(([, value]) => Boolean(value)),
            ),
        });
        return this.http.get<BotEvent[]>('/api/events', { params });
    }
}
