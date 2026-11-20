import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslationService } from '../../../../i18n/translation.service';
import { confidenceLevel, isRowSelected, type AiRow, isAbsentInB } from '../../../../utils/ai-proposal.utils';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { FieldState, FieldStatus } from '../../../../utils/migration.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

const ORDER: Record<FieldStatus, number> = { missing: 0, new: 1, moved: 2, renamed: 3, same: 4 };

/** Fields of B with their state against A, at the top of the «Anotaciones» tab. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-migration-panel',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './migration-panel.component.html',
})
export class MigrationPanelComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly showSame = signal(false);

  private readonly i18n = inject(TranslationService);

  /** The AI proposal being reviewed (its fields are listed here instead of as «Falta en B»). */
  readonly proposal = computed(() => {
    const session = this.vm.ai();
    return session && session.phase === 'ready' ? session : null;
  });

  readonly rows = computed<FieldState[]>(() => {
    const m = this.vm.migration();
    if (!m) {
      return [];
    }
    const hideMissing = this.proposal() !== null;
    const all = [...m.states]
      .filter((state) => !(hideMissing && state.status === 'missing'))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return this.showSame() ? all : all.filter((state) => state.status !== 'same');
  });

  /** Proposal rows in three groups: worth a look, not found and ready (high confidence). */
  readonly groups = computed(() => {
    const session = this.proposal();
    if (!session) {
      return [];
    }
    const byPlace = (a: AiRow, b: AiRow) => a.page - b.page || a.index - b.index;
    const rows = [...session.rows].sort(byPlace);
    const review = rows.filter((row) => row.ok && confidenceLevel(row.confidence) !== 'high');
    const notFound = rows.filter((row) => !row.ok && !isAbsentInB(row));
    const absent = rows.filter(isAbsentInB);
    const ready = rows.filter((row) => row.ok && confidenceLevel(row.confidence) === 'high');
    return [
      { key: 'review', rows: review },
      { key: 'notFound', rows: notFound },
      { key: 'absent', rows: absent },
      { key: 'ready', rows: ready },
    ].filter((group) => group.rows.length > 0);
  });

  readonly highCount = computed(
    () => (this.proposal()?.rows ?? []).filter((row) => row.ok && confidenceLevel(row.confidence) === 'high').length,
  );

  providerName(): string {
    const provider = this.proposal()?.provider;
    return provider === 'adjust'
      ? this.i18n.translate('ai.review.adjustProvider')
      : provider === 'copilot'
        ? 'Copilot'
        : provider === 'fake'
          ? 'Simulado'
          : 'Claude';
  }

  selected(row: AiRow): boolean {
    return isRowSelected(row, this.vm.aiOverrides());
  }

  level(row: AiRow): string {
    return confidenceLevel(row.confidence);
  }

  /** Placed by the helper without the AI (not shown for «Resuelto sin IA», where every row is). */
  withoutAi(row: AiRow): boolean {
    return row.ok && row.source === 'text' && this.proposal()?.provider !== 'adjust';
  }

  absent(row: AiRow): boolean {
    return isAbsentInB(row);
  }

  /** The reason is shown only when it adds something to the anchor already printed. */
  showReason(row: AiRow): boolean {
    return !!row.reason && !(row.anchorB && row.reason.includes(row.anchorB));
  }

  changesPage(row: AiRow): boolean {
    return row.ok && row.newPage !== row.page;
  }

  /** The «Falta en B» state that matches a field the AI could not place (to offer «Colocar a mano»). */
  missingFor(row: AiRow): FieldState | null {
    const name = this.vm.aiFieldName(row);
    return (
      this.vm.migration()?.states.find((state) => state.status === 'missing' && state.name === name && state.page === row.page) ??
      null
    );
  }

  isFirstReview(row: AiRow): boolean {
    return this.groups().find((group) => group.key === 'review')?.rows[0]?.id === row.id;
  }

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
