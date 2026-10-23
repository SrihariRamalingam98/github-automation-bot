import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
import { BotEvent, Overview } from '../../core/models/api.models';
import { EventLogsService } from '../event-logs/event-logs.service';

export interface DashboardSnapshot {
    overview: Overview;
    events: BotEvent[];
}
@Injectable({ providedIn: 'root' })
export class DashboardService {
    private readonly http = inject(HttpClient);

    private readonly events = inject(EventLogsService);

    statistics(): Observable<Overview> {
        return this.http.get<Overview>('/api/overview');
    }

    snapshot(): Observable<DashboardSnapshot> {
        return forkJoin({ overview: this.statistics(), events: this.events.list() }).pipe(
            map((data) => ({ overview: data.overview, events: data.events.slice(0, 8) })),
        );
    }
}
