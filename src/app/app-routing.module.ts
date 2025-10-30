import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

/**
 * Root level routes using lazy loading to keep the landing and editor features decoupled.
 */
const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'landing',
  },
  {
    path: 'landing',
    loadChildren: () => import('./features/landing/landing.module').then((m) => m.LandingModule),
  },
  {
    path: 'editor',
    loadChildren: () => import('./features/editor/editor.module').then((m) => m.EditorModule),
  },
  {
    path: '**',
    redirectTo: 'landing',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
