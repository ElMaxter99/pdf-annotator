import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
})
export class ThemeToggleComponent {
  private readonly themeService = inject(ThemeService);
  readonly theme = this.themeService.theme;
  readonly isLight = computed(() => this.theme() === 'light');

  toggleTheme() {
    this.themeService.toggleTheme();
  }
}
