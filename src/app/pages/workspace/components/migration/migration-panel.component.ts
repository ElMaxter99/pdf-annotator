import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { FieldState, FieldStatus } from '../../../../utils/migration.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

const ORDER: Record<FieldStatus, number> = { missing: 0, new: 1, moved: 2, renamed: 3, same: 4 };

/** Fields of B with their state against A, at the top of the «Anotaciones» tab. */
@Component({
  selector: 'app-migration-panel',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './migration-panel.component.html',
})
export class MigrationPanelComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly showSame = signal(false);

  readonly rows = computed<FieldState[]>(() => {
    const m = this.vm.migration();
    if (!m) {
      return [];
    }
    const all = [...m.states].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return this.showSame() ? all : all.filter((state) => state.status !== 'same');
  });

  rowKey(state: FieldState): string {
    return `${state.status}|${state.page}|${state.name}|${state.b?.fieldIndex ?? 'a'}`;
  }

  missingNames(m: NonNullable<ReturnType<WorkspacePageComponent['migration']>>): string[] {
    return m.states.filter((s) => s.status === 'missing').map((s) => s.name);
  }

  onLink(state: FieldState, event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (select.value) {
      this.vm.linkField(state, select.value);
    }
    select.value = '';
  }
}
