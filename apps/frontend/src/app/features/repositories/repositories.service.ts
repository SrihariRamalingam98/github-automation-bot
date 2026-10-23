import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
import {
    ConnectedRepositoryResponse,
    SuccessResponse,
} from '../../core/models/api-response.models';
import { AvailableRepository, Label, Repository } from '../../core/models/api.models';

export interface RepositoryWorkspace {
    repos: Repository[];
    available: AvailableRepository[];
}
@Injectable({ providedIn: 'root' })
export class RepositoriesService {
    private readonly http = inject(HttpClient);

    list(): Observable<Repository[]> {
        return this.http.get<Repository[]>('/api/repos');
    }

    available(): Observable<AvailableRepository[]> {
        return this.http.get<AvailableRepository[]>('/api/available-repos');
    }

    workspace(): Observable<RepositoryWorkspace> {
        return forkJoin({ repos: this.list(), available: this.available() }).pipe(
            map((data) => {
                const connected = new Set(data.repos.map((repo) => repo.full_name));
                return {
                    repos: data.repos,
                    available: data.available.filter((repo) => !connected.has(repo.name)),
                };
            }),
        );
    }

    connect(fullName: string): Observable<ConnectedRepositoryResponse> {
        return this.http.post<ConnectedRepositoryResponse>('/api/repos', { fullName });
    }

    disconnect(id: string): Observable<SuccessResponse> {
        return this.http.delete<SuccessResponse>(`/api/repos/${id}`);
    }

    labels(id: string): Observable<Label[]> {
        return this.http.get<Label[]>(`/api/repos/${id}/labels`);
    }
}
