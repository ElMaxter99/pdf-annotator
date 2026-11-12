import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, ViewChild, inject, signal } from '@angular/core';
import { DesktopUpdateService } from '../../../../services/desktop-update.service';
import { FormsModule } from '@angular/forms';
import type { WorkspacePageComponent } from '../../workspace.page';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { LanguageSelectorComponent } from '../../../../components/language-selector/language-selector.component';
import { ToastBellComponent } from '../../../../components/toast-bell/toast-bell.component';
import { MigrationBarComponent } from '../migration/migration-bar.component';
import { ThemeToggleComponent } from '../../../../components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-workspace-header',
  standalone: true,
  templateUrl: './workspace-header.component.html',
  styleUrls: ['./workspace-header.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslationPipe,
    LanguageSelectorComponent,
    ThemeToggleComponent,
    MigrationBarComponent,
    ToastBellComponent,
  ],
})
export class WorkspaceHeaderComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('coordsFileInput', { static: false })
  coordsFileInputRef?: ElementRef<HTMLInputElement>;

  readonly update = inject(DesktopUpdateService);
  readonly prefsOpen = signal(false);
  readonly clearOpen = signal(false);

  togglePrefs(event: Event): void {
    event.stopPropagation();
    this.clearOpen.set(false);
    this.prefsOpen.update((open) => !open);
  }

  toggleClear(event: Event): void {
    event.stopPropagation();
    this.prefsOpen.set(false);
    this.clearOpen.update((open) => !open);
  }

  confirmClear(): void {
    this.clearOpen.set(false);
    this.vm.clearAll();
  }

  /** A click anywhere else, or Esc, closes the open menu. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.toolbar__menu, .toolbar__prefs .toolbar__group')) {
      return;
    }
    this.prefsOpen.set(false);
    this.clearOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.prefsOpen.set(false);
    this.clearOpen.set(false);
  }

  get coordsFileInputElement(): HTMLInputElement | null {
    return this.coordsFileInputRef?.nativeElement ?? null;
  }
}
