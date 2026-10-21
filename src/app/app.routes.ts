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
  { path: '**', redirectTo: 'landing' },
];
