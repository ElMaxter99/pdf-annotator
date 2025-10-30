import { Component, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppModule } from './app/app.module';

// Vercel analytics imports
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

@Component({
  selector: 'app-shell-bootstrap',
  standalone: true,
  imports: [AppModule],
  template: '<app-root></app-root>',
})
class AppShellComponent {}

bootstrapApplication(AppShellComponent, {
  providers: [importProvidersFrom(AppModule)],
}).catch((err: unknown) => console.error(err));

inject();
injectSpeedInsights();
