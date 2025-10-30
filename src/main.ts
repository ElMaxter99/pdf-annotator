import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

//Vercel imports
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

inject(); // Vercel analytics pkg
injectSpeedInsights(); // Vercel speed insights pkg
