import { Component, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppModule } from './app/app.module';

@Component({
  selector: 'app-shell-bootstrap',
  standalone: true,
  imports: [AppModule],
  template: '<app-root></app-root>',
})
class AppShellComponent {}

const bootstrap = () =>
  bootstrapApplication(AppShellComponent, {
    providers: [importProvidersFrom(AppModule)],
  });

export default bootstrap;
