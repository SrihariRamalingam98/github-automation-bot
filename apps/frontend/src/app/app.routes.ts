import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () =>
            import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    },
    {
        path: '',
        canActivate: [authGuard],
        loadComponent: () =>
            import('./layouts/main-layout/main-layout.component').then(
                (m) => m.MainLayoutComponent,
            ),
        children: [
            {
                path: 'dashboard',
                loadComponent: () =>
                    import('./features/dashboard/dashboard.component').then(
                        (m) => m.DashboardComponent,
                    ),
            },
            {
                path: 'repositories',
                loadComponent: () =>
                    import('./features/repositories/repositories.component').then(
                        (m) => m.RepositoriesComponent,
                    ),
            },
            {
                path: 'rules',
                loadComponent: () =>
                    import('./features/rules/rules.component').then((m) => m.RulesComponent),
            },
            {
                path: 'events',
                loadComponent: () =>
                    import('./features/event-logs/event-logs.component').then(
                        (m) => m.EventLogsComponent,
                    ),
            },
            { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
        ],
    },
    { path: '**', redirectTo: 'dashboard' },
];
