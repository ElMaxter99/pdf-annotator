import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'landing',
  },
  {
    path: 'landing',
    loadChildren: () =>
      import('./features/landing/landing.module').then((m) => m.LandingModule),
  },
  {
    path: 'editor',
    loadChildren: () =>
      import('./features/editor/editor.module').then((m) => m.EditorModule),
  },
  {
    path: '**',
    redirectTo: 'landing',
  },
];
