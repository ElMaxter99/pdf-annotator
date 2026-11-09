import { Routes } from '@angular/router';
import { workspaceGuard } from './guards/workspace.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'landing' },
  {
    path: 'landing',
    loadComponent: () =>
      import('./pages/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'workspace',
    canActivate: [workspaceGuard],
    loadComponent: () =>
      import('./pages/workspace/workspace.page').then((m) => m.WorkspacePageComponent),
  },
  {
    path: 'batch',
    loadComponent: () => import('./pages/batch/batch.page').then((m) => m.BatchPageComponent),
  },
  {
    path: 'batch/load',
    loadComponent: () =>
      import('./pages/batch/batch-load.page').then((m) => m.BatchLoadPageComponent),
  },
  {
    path: 'batch/match',
    loadComponent: () =>
      import('./pages/batch/batch-match.page').then((m) => m.BatchMatchPageComponent),
  },
  {
    path: 'batch/:id',
    loadComponent: () =>
      import('./pages/batch/batch-item.page').then((m) => m.BatchItemPageComponent),
  },
  {
    path: 'guide',
    loadComponent: () => import('./pages/guide/guide.page').then((m) => m.GuidePageComponent),
  },
  {
    path: 'guide/:id',
    loadComponent: () => import('./pages/guide/guide.page').then((m) => m.GuidePageComponent),
  },
  { path: '**', redirectTo: 'landing' },
];
