import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateCardComponent } from './components/update-card/update-card.component';
import { UpdatePanelComponent } from './components/update-panel/update-panel.component';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { ThemeService } from './services/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, UpdateCardComponent, UpdatePanelComponent],
  template: '<router-outlet /><app-toast-host /><app-update-card /><app-update-panel />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
