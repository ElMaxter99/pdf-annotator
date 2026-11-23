import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslationService } from '../../../../i18n/translation.service';
import { confidenceLevel, isRowSelected, type AiRow, isAbsentInB, PROPOSAL_GROUPS, proposalGroup } from '../../../../utils/ai-proposal.utils';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { InfoTipComponent } from '../../../../components/info-tip/info-tip.component';
import type { FieldState, FieldStatus } from '../../../../utils/migration.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

const ORDER: Record<FieldStatus, number> = { missing: 0, new: 1, moved: 2, renamed: 3, same: 4 };

/** Fields of B with their state against A, at the top of the «Anotaciones» tab. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-migration-panel',
  standalone: true,
  imports: [CommonModule, TranslationPipe, InfoTipComponent],
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

  readonly summaryOpen = signal(false);

  /** What still asks for a decision: «Falta en B» without placing or dismissing. «Listo» (or a proposal under review) takes them out. */
  readonly pendingStates = computed<FieldState[]>(() => {
    const m = this.vm.migration();
    if (!m || m.item.status === 'ready' || this.proposal() !== null) {
      return [];
    }
    return m.states.filter((state) => state.status === 'missing');
  });

  /** «Quitados de B»: missing fields that no longer ask for anything (the PDF is «Listo» or a proposal is open). */
  readonly removedCount = computed(() =>
    this.pendingStates().length || this.proposal() ? 0 : (this.vm.migration()?.summary.missing ?? 0),
  );

  /** Informative states (new, moved, renamed, same and removed), shown in the collapsed summary. */
  readonly summaryRows = computed<FieldState[]>(() => {
    const m = this.vm.migration();
    if (!m) {
      return [];
    }
    const pending = this.pendingStates().length > 0;
    const hideMissing = this.proposal() !== null;
    const all = [...m.states]
      .filter((state) => state.status !== 'missing' || (!pending && !hideMissing))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return this.showSame() ? all : all.filter((state) => state.status !== 'same');
  });

  /** Proposal rows by where they come from and how sure they are (`proposalGroup`): sure, to check, new in B, not placed, gone. */
  readonly groups = computed(() => {
    const session = this.proposal();
    if (!session) {
      return [];
    }
    const byPlace = (a: AiRow, b: AiRow) => a.page - b.page || a.index - b.index || a.newPage - b.newPage;
    const rows = [...session.rows].sort(byPlace);
    return PROPOSAL_GROUPS.map((key) => ({ key, rows: rows.filter((row) => proposalGroup(row) === key) })).filter(
      (group) => group.rows.length > 0,
    );
  });

  readonly highCount = computed(() => (this.proposal()?.rows ?? []).filter((row) => proposalGroup(row) === 'ready').length);

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
