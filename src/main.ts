import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { BrowserModule } from '@angular/platform-browser';
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';
import { CoreModule } from './app/core/core.module';

// Bootstraps the standalone shell while still reusing the provider graph defined in feature modules.
bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(BrowserModule, CoreModule, AppRoutingModule),
  ],
}).catch((err: unknown) => console.error(err));

inject();
injectSpeedInsights();
