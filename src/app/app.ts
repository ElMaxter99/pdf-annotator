import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent],
  template: '<router-outlet /><app-toast-host />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
