import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { CoreModule } from './core/core.module';

/**
 * Módulo raíz que agrupa los proveedores globales y declara el componente shell.
 */
@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, BrowserAnimationsModule, CoreModule, AppRoutingModule],
  exports: [AppComponent],
  bootstrap: [AppComponent],
})
export class AppModule {}
