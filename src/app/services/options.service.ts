import { Injectable, computed, inject, signal } from '@angular/core';
import { AiHelperService } from './ai-helper.service';
import { DesktopUpdateService } from './desktop-update.service';

export type OptionsSection = 'updates' | 'ai';

/**
 * «Opciones» de la app (mesas P-150 a P-152): una ventana con los ajustes que no son del documento. Cada sección
 * solo existe donde tiene sentido (actualizaciones en la app de escritorio, IA con ayudante local); sin ninguna
 * (web pública) no hay Opciones y la entrada no se muestra.
 */
@Injectable({ providedIn: 'root' })
export class OptionsService {
  private readonly update = inject(DesktopUpdateService);
  private readonly ai = inject(AiHelperService);

  readonly isOpen = signal(false);
  readonly section = signal<OptionsSection>('updates');

  readonly sections = computed<OptionsSection[]>(() => {
    const list: OptionsSection[] = [];
    if (this.update.isDesktop) list.push('updates');
    if (this.ai.available) list.push('ai');
    return list;
  });
  readonly available = computed(() => this.sections().length > 0);

  open(section?: OptionsSection): void {
    const sections = this.sections();
    if (!sections.length) return;
    this.section.set(section && sections.includes(section) ? section : sections[0]);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  select(section: OptionsSection): void {
    if (this.sections().includes(section)) this.section.set(section);
  }
}
