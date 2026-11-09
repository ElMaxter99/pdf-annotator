import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { BatchStoreService } from '../../../services/batch-store.service';
import { BatchTabsService } from '../../../services/batch-tabs.service';

/** «Panel del lote» plus one tab per PDF opened in the session. */
@Component({
  selector: 'app-batch-tabs',
  standalone: true,
  imports: [RouterLink, TranslationPipe],
  template: `
    <div class="tabs-bar" role="tablist" [attr.aria-label]="'batch.tabs.label' | t">
      <a class="tab-chip" [class.is-active]="!current()" routerLink="/batch" [attr.aria-current]="!current() ? 'page' : null">▦ {{ 'batch.panel.tab' | t }}</a>
      @for (tab of tabs(); track tab.id) {
        <span class="tab-chip tab-chip--pdf" [class.is-active]="tab.id === current()">
          <a class="ellipsis" [routerLink]="['/batch', tab.id]" [attr.aria-current]="tab.id === current() ? 'page' : null">{{ tab.name }}</a>
          <button type="button" class="tab-close" [attr.aria-label]="'batch.tabs.close' | t : { name: tab.name }" (click)="close(tab.id)">×</button>
        </span>
      }
    </div>
  `,
  styles: [`
    .tabs-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
    .tab-chip { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: var(--muted); background: color-mix(in srgb, var(--text) 8%, transparent); text-decoration: none; max-width: 240px; min-width: 0; }
    .tab-chip a { color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tab-chip.is-active { color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
    :host-context(:root.theme-light) .tab-chip.is-active { color: #0f766e; }
    .tab-close { font: inherit; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0 2px; opacity: .7; border-radius: 6px; &:hover { opacity: 1; } &:focus-visible { outline: 2px solid var(--text); } }
    .ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class BatchTabsComponent {
  private readonly store = inject(BatchStoreService);
  private readonly service = inject(BatchTabsService);
  private readonly router = inject(Router);

  /** Id of the PDF being shown, or empty on the panel. */
  readonly current = input<string>('');
  readonly tabs = computed(() =>
    this.service
      .open()
      .map((id) => this.store.items().find((item) => item.id === id))
      .filter((item): item is NonNullable<typeof item> => !!item)
      .map((item) => ({ id: item.id, name: item.name }))
  );

  close(id: string) {
    const next = this.service.close(id);
    if (id === this.current()) void this.router.navigate(next ? ['/batch', next] : ['/batch']);
  }
}
