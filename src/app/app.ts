import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateCardComponent } from './components/update-card/update-card.component';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, UpdateCardComponent],
  template: '<router-outlet /><app-toast-host /><app-update-card />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
