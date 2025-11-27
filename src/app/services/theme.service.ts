import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pdf-annotator-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly theme = signal<Theme>('dark');

  constructor() {
    const stored = this.loadStoredTheme();
    this.applyTheme(stored ?? 'dark');
  }

  toggleTheme() {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
  }

  private applyTheme(theme: Theme) {
    this.theme.set(theme);
    const root = this.document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${theme}`);
    root.setAttribute('data-theme', theme);
    this.persistTheme(theme);
  }

  private loadStoredTheme(): Theme | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (value === 'light' || value === 'dark') {
        return value;
      }
      return null;
    } catch {
      return null;
    }
  }

  private persistTheme(theme: Theme) {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }
}
