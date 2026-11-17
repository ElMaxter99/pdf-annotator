import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, ViewChild, effect, signal, ChangeDetectionStrategy } from '@angular/core';
import { VersionChipComponent } from '../../../../components/version-chip/version-chip.component';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { WorkspacePageComponent } from '../../workspace.page';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { LanguageSelectorComponent } from '../../../../components/language-selector/language-selector.component';
import { ToastBellComponent } from '../../../../components/toast-bell/toast-bell.component';
import { MigrationBarComponent } from '../migration/migration-bar.component';
import { ThemeToggleComponent } from '../../../../components/theme-toggle/theme-toggle.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-workspace-header',
  standalone: true,
  templateUrl: './workspace-header.component.html',
  styleUrls: ['./workspace-header.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslationPipe,
    LanguageSelectorComponent,
    ThemeToggleComponent,
    MigrationBarComponent,
    ToastBellComponent,
    VersionChipComponent,
  ],
})
export class WorkspaceHeaderComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('coordsFileInput', { static: false })
  coordsFileInputRef?: ElementRef<HTMLInputElement>;

  readonly prefsOpen = signal(false);
  readonly clearOpen = signal(false);
  private seenClearRequest = -1;

  constructor() {
    // The command palette asks for «Limpiar»: the same confirmation opens as with the button.
    effect(() => {
      const request = this.vm.clearRequest();
      if (this.seenClearRequest >= 0 && request !== this.seenClearRequest) {
        this.prefsOpen.set(false);
        this.clearOpen.set(true);
      }
      this.seenClearRequest = request;
    });
  }

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
