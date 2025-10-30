import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { routes } from './app.routes';

/**
 * Central routing table. Each top-level section is lazy loaded to keep the
 * runtime bundle light and allow independent evolution of the feature modules.
 */
@NgModule({
  imports: [RouterModule.forRoot(routes, { bindToComponentInputs: true })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
