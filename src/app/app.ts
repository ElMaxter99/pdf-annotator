import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateInstallComponent } from './components/update-install/update-install.component';
import { UpdateCardComponent } from './components/update-card/update-card.component';
import { UpdatePanelComponent } from './components/update-panel/update-panel.component';
import { StoragePanelComponent } from './components/storage-panel/storage-panel.component';
import { ToastHostComponent } from './components/toast-host/toast-host.component';
import { ThemeService } from './services/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, UpdateCardComponent, UpdatePanelComponent, UpdateInstallComponent, StoragePanelComponent],
  template: '<router-outlet /><app-toast-host /><app-update-card /><app-update-panel /><app-update-install /><app-storage-panel />',
})
export class App {
  private readonly themeService = inject(ThemeService);
}
