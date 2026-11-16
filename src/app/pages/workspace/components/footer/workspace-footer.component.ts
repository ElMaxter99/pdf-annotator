import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, inject } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { VersionChipComponent } from '../../../../components/version-chip/version-chip.component';
import type { WorkspacePageComponent } from '../../workspace.page';

@Component({
  selector: 'app-workspace-footer',
  standalone: true,
  templateUrl: './workspace-footer.component.html',
  styleUrls: ['./workspace-footer.component.scss'],
  imports: [CommonModule, TranslationPipe, VersionChipComponent],
})
export class WorkspaceFooterComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  toggleZoomMenu(): void {
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
