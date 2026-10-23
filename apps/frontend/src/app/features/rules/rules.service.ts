import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { SuccessResponse } from '../../core/models/api-response.models';
import { Label, Repository, Rule, RuleInput } from '../../core/models/api.models';
import { RepositoriesService } from '../repositories/repositories.service';

export interface RuleEditorContext {
    rules: Rule[];
    repos: Repository[];
}
@Injectable({ providedIn: 'root' })
export class RulesService {
    private readonly http = inject(HttpClient);

    private readonly repositories = inject(RepositoriesService);

    list(): Observable<Rule[]> {
        return this.http.get<Rule[]>('/api/rules');
    }

    editorContext(): Observable<RuleEditorContext> {
        return forkJoin({ rules: this.list(), repos: this.repositories.list() });
    }

    labels(repoId: string): Observable<Label[]> {
        return this.repositories.labels(repoId);
    }

    save(rule: RuleInput, id?: string): Observable<Rule> {
        return id
            ? this.http.put<Rule>(`/api/rules/${id}`, rule)
            : this.http.post<Rule>('/api/rules', rule);
    }

    delete(id: string): Observable<SuccessResponse> {
        return this.http.delete<SuccessResponse>(`/api/rules/${id}`);
    }
}
