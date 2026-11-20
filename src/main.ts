import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { shouldLoadVercelInsights } from './app/utils/vercel-insights.utils';

//Vercel imports
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// Analítica solo en Vercel: ni en la app de escritorio (Electron) ni en Docker o en local, donde no existe /_vercel.
const isDesktop = !!(window as unknown as { desktop?: unknown }).desktop;
if (shouldLoadVercelInsights(window.location.hostname, isDesktop)) {
  inject(); // Vercel analytics pkg
  injectSpeedInsights(); // Vercel speed insights pkg
}
