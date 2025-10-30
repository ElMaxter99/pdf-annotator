import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { CoreModule } from './core/core.module';

/**
 * Compatibility module kept to expose the global provider graph to tooling and SSR pipelines.
 */
@NgModule({
  imports: [BrowserModule, BrowserAnimationsModule, CoreModule, AppRoutingModule, AppComponent],
  bootstrap: [AppComponent],
})
export class AppModule {}
