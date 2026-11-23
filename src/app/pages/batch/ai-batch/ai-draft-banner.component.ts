import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { AiBatchService } from '../../../services/ai-batch.service';
import { AiBatchButtonComponent, providerName } from './ai-batch-button.component';

/** Aviso fijo al volver a un lote cuyo traslado con IA se cortó (mesas P-127 a P-129): qué se conserva y tres salidas. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-draft-banner',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AiBatchButtonComponent],
  templateUrl: './ai-draft-banner.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiDraftBannerComponent {
  readonly queue = inject(AiBatchService);
  /** «Elegir cuáles…»: the panel marks these PDFs. */
  readonly choose = output<readonly string[]>();

  readonly Math = Math;
  readonly summary = this.queue.interrupted;
  readonly params = computed(() => {
    const s = this.summary();
    if (!s) {
      return {};
    }
    return {
      provider: providerName(s.provider || 'claude'),
      when: s.startedAt ? new Date(s.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—',
      total: s.all.length,
      saved: s.saved.length,
      failed: s.failed.length,
      interrupted: s.interrupted.length,
      notStarted: s.notStarted.length,
      count: s.missing,
    };
  });
}
