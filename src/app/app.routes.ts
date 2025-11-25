import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'landing' },
  {
    path: 'landing',
    loadComponent: () =>
      import('./pages/landing/landing.page').then((m) => m.LandingPageComponent),
  },
  {
    path: 'workspace',
    loadComponent: () =>
      import('./pages/workspace/workspace.page').then((m) => m.WorkspacePageComponent),
  },
  {
    path: 'contact-qa',
    loadComponent: () =>
      import('./pages/contact-qa/contact-qa.page').then((m) => m.ContactQaPageComponent),
  },
  { path: '**', redirectTo: 'landing' },
];
