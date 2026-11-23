import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { VersionChipComponent } from '../../../../components/version-chip/version-chip.component';
import type { WorkspacePageComponent } from '../../workspace.page';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-workspace-footer',
  standalone: true,
  templateUrl: './workspace-footer.component.html',
  styleUrls: ['./workspace-footer.component.scss'],
  imports: [CommonModule, TranslationPipe, VersionChipComponent],
})
export class WorkspaceFooterComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Position of the only selected annotation, announced to screen readers (nudges, drags). */
  selectedSpot(): { name: string; x: number; y: number } | null {
    const selected = this.vm.selection();
    if (selected?.fields.length !== 1) {
      return null;
    }
    const field = this.vm.coords()[selected.pageIndex]?.fields[selected.fields[0]];
    if (!field) {
      return null;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    return { name: field.mapField, x: round(field.x), y: round(field.y) };
  }

  readonly viewMenuOpen = signal(false);

  toggleViewMenu(event: Event): void {
    event.stopPropagation();
    const open = !this.viewMenuOpen();
    this.viewMenuOpen.set(open);
    if (open) {
      this.vm.zoomMenuOpen.set(false);
      setTimeout(() => {
        const items = this.host.nativeElement.querySelectorAll<HTMLElement>('[data-view-item]:not(:disabled)');
        (this.host.nativeElement.querySelector<HTMLElement>('[data-view-item].zoom-menu__item--on') ?? items[0])?.focus();
      }, 0);
    }
  }

  chooseView(mode: 'sample' | 'map' | 'data'): void {
    this.vm.setPreviewMode(mode);
    this.viewMenuOpen.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('.footer__vista')?.focus();
  }

  onViewMenuKey(event: KeyboardEvent): void {
    const items = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('[data-view-item]:not(:disabled)'),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.viewMenuOpen.set(false);
      this.host.nativeElement.querySelector<HTMLElement>('.footer__vista')?.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.viewMenuOpen() && !(event.target as HTMLElement | null)?.closest('.footer__viewwrap')) {
      this.viewMenuOpen.set(false);
    }
  }

  toggleZoomMenu(): void {
    this.viewMenuOpen.set(false);
    const open = !this.vm.zoomMenuOpen();
    this.vm.zoomMenuOpen.set(open);
    if (open) {
      setTimeout(() => {
        const items = this.host.nativeElement.querySelectorAll<HTMLElement>('.zoom-menu__item');
        (this.host.nativeElement.querySelector<HTMLElement>('.zoom-menu__item--on') ?? items[0])?.focus();
      }, 0);
    }
  }

  onZoomMenuKey(event: KeyboardEvent): void {
    const items = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>('.zoom-menu__item'),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.vm.zoomMenuOpen.set(false);
      this.host.nativeElement.querySelector<HTMLElement>('.footer__zoom--btn')?.focus();
    }
  }
}
