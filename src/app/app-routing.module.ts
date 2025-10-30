import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

/**
 * Enrutador raíz. Utiliza lazy loading para las áreas públicas (`landing`)
 * y privadas (`editor`), manteniendo el paquete inicial ligero.
 */
const routes: Routes = [
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

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
