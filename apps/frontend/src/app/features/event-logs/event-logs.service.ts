import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EventFilters } from '../../core/models/api-response.models';
import { BotEvent } from '../../core/models/api.models';
import { EventHistoryRow, EventPage } from '../../core/models/event-history';

@Injectable({ providedIn: 'root' })
export class EventLogsService {
    private readonly http = inject(HttpClient);

    list(filters: EventFilters = {}): Observable<EventPage<EventHistoryRow>> {
        return this.page<EventHistoryRow>('/api/events', filters);
    }

    deliveries(id: string, filters: EventFilters): Observable<EventPage<BotEvent>> {
        return this.page<BotEvent>(`/api/events/${encodeURIComponent(id)}/deliveries`, filters);
    }

    private page<T>(url: string, filters: EventFilters): Observable<EventPage<T>> {
        const params = new HttpParams({
            fromObject: Object.fromEntries(
                Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
            ),
        });
        return this.http.get<EventPage<T>>(url, { params }).pipe(
            map((page) => {
                try {
                    if (
                        !page ||
                        !Array.isArray(page.items) ||
                        typeof page.has_more !== 'boolean' ||
                        !Number.isInteger(page.page_size) ||
                        page.page_size < 1 ||
                        page.page_size > 50 ||
                        (page.has_more && !page.next_cursor)
                    )
                        throw new Error();
                    return page;
                } catch {
                    throw new Error('Event history could not be read. Refresh and try again.');
                }
            }),
        );
    }
}
