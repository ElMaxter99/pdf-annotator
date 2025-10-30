import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Módulos principales cargados de forma diferida para mantener el arranque ligero y escalar
// nuevas secciones sin penalizar el rendimiento inicial de la SPA.
const routes: Routes = [
  { path: '', redirectTo: 'landing', pathMatch: 'full' },
  {
    path: 'landing',
    loadChildren: () => import('./features/landing/landing.module').then((m) => m.LandingModule),
  },
  {
    path: 'editor',
    loadChildren: () => import('./features/editor/editor.module').then((m) => m.EditorModule),
  },
  { path: '**', redirectTo: 'landing' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
