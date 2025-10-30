import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { CoreModule } from './core/core.module';

/**
 * Aggregates framework modules so they can be brought into the standalone
 * bootstrap via {@link importProvidersFrom}. Keeping the module makes the
 * dependency graph explicit while the router remains lazily loaded.
 */
@NgModule({
  imports: [BrowserModule, CoreModule, AppRoutingModule],
})
export class AppModule {}
