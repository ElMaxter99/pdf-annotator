import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { BatchStoreService } from '../../services/batch-store.service';

/** Switch between the one-PDF editor and the batch flow; sits in the header of both views. */
@Component({
  selector: 'app-mode-switch',
  standalone: true,
  imports: [RouterLink, TranslationPipe],
  template: `
    <nav class="mode" [attr.aria-label]="'batch.mode.label' | t">
      <a class="mode__opt" routerLink="/landing" [class.is-active]="active() === 'editor'"
        [attr.aria-current]="active() === 'editor' ? 'page' : null" [attr.title]="'batch.mode.editorHint' | t">
        {{ 'batch.mode.editor' | t }}
      </a>
      <a class="mode__opt" [routerLink]="batchLink()" [class.is-active]="active() === 'batch'"
        [attr.aria-current]="active() === 'batch' ? 'page' : null" [attr.title]="'batch.mode.batchHint' | t">
        {{ 'batch.mode.batch' | t }}
      </a>
    </nav>
  `,
  styles: [
    `
      .mode { display: inline-flex; padding: 4px; border-radius: 999px; background: color-mix(in srgb, var(--text) 8%, transparent); }
      .mode__opt { font-size: 13px; font-weight: 600; text-decoration: none; color: var(--muted); border-radius: 999px; padding: 6px 14px; white-space: nowrap; transition: background .15s ease-out, color .15s ease-out; }
      .mode__opt.is-active { background: var(--accent); color: var(--bg); }
      :host-context(:root.theme-light) .mode__opt.is-active { background: #0b7a70; color: #fff; }
      .mode__opt:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { .mode__opt { transition: none; } }
    `,
  ],
})
export class ModeSwitchComponent {
  private readonly store = inject(BatchStoreService);
  readonly active = input.required<'editor' | 'batch'>();
  readonly batchLink = computed(() => (this.store.items().length > 0 ? '/batch' : '/batch/load'));

  constructor() {
    if (typeof window !== 'undefined') void this.store.load();
  }
}
