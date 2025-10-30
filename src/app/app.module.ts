import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { CoreModule } from './core/core.module';

/**
 * Compatibility module kept to expose the global provider graph to tooling and SSR pipelines.
 * Import `provideAnimations` via the CoreModule when Material's runtime animations are required.
 */
@NgModule({
  imports: [BrowserModule, CoreModule, AppRoutingModule, AppComponent],
  bootstrap: [AppComponent],
})
export class AppModule {}
