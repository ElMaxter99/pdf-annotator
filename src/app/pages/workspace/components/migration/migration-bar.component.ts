import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, signal } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { WorkspacePageComponent } from '../../workspace.page';
import { AdjustReviewComponent } from './adjust-review.component';

/** Top bar of the editor while a PDF of a batch is open: B is edited, A is the reference. */
@Component({
  selector: 'app-migration-bar',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AdjustReviewComponent],
  templateUrl: './migration-bar.component.html',
})
export class MigrationBarComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly modes = ['overlay', 'toggle', 'split'] as const;
  readonly menuOpen = signal(false);
  /** Mode waiting for confirmation because B already has fields. */
  readonly confirmMode = signal<'replace' | null>(null);
  readonly readyOpen = signal(false);

  toggleMenu(): void {
    this.confirmMode.set(null);
    this.menuOpen.update((open) => !open);
  }

  putCopy(): void {
    if (this.vm.annotationCount() > 0) {
      this.confirmMode.set('replace');
      return;
    }
    this.closeMenu();
    this.vm.applyTemplateA('replace');
  }

  putAdjust(): void {
    this.closeMenu();
    void this.vm.startAdjust();
  }

  putMissing(): void {
    this.closeMenu();
    this.vm.applyTemplateA('missing');
  }

  confirmReplace(): void {
    this.closeMenu();
    this.vm.applyTemplateA('replace');
  }

  closeMenu(): void {
    this.menuOpen.set(false);
    this.confirmMode.set(null);
  }

  openReady(): void {
    this.readyOpen.set(true);
  }

  confirmReady(): void {
    this.readyOpen.set(false);
    void this.vm.markReady();
  }

  /** Esc closes the open menu or dialog. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.vm.adjust()) {
      this.vm.cancelAdjust();
    } else if (this.readyOpen()) {
      this.readyOpen.set(false);
    } else if (this.menuOpen()) {
      this.closeMenu();
    }
  }

  /** Holding «A» shows only the reference (never while typing). */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (this.isReferenceKey(event) && !event.repeat) {
      this.vm.holdingReference.set(true);
    }
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'a') {
      this.vm.holdingReference.set(false);
    }
  }

  @HostListener('window:blur')
  onBlur(): void {
    this.vm.holdingReference.set(false);
  }

  private isReferenceKey(event: KeyboardEvent): boolean {
    if (event.key.toLowerCase() !== 'a' || event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
      return false;
    }
    return !this.vm.preview() && !this.vm.editing();
  }
}
