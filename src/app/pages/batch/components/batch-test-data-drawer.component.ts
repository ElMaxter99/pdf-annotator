import { Component, inject, output } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import { PreviewSettingsService } from '../../../services/preview-settings.service';
import { ToastService } from '../../../services/toast.service';

const MAX_TEST_DATA_BYTES = 5 * 1024 * 1024;

/** Optional test data for the batch preview: it lasts only for the session, like in the editor. */
@Component({
  selector: 'app-batch-test-data-drawer',
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: './batch-test-data-drawer.component.html',
  styleUrls: ['../batch-ui.scss'],
})
export class BatchTestDataDrawerComponent {
  readonly preview = inject(PreviewSettingsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly closed = output<void>();

  onText(event: Event) {
    this.preview.setTestDataText((event.target as HTMLTextAreaElement).value);
  }

  async onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_TEST_DATA_BYTES) {
      this.toast.error(this.i18n.translate('preview.testData.tooLarge'));
      return;
    }
    try {
      this.preview.setTestDataText(await file.text());
    } catch {
      this.toast.error(this.i18n.translate('preview.testData.readFailed'));
    }
  }

  errorText(): string {
    const error = this.preview.testDataError();
    if (!error) return '';
    if (error.message === 'size') return this.i18n.translate('preview.testData.tooLarge');
    if (error.message === 'shape') return this.i18n.translate('preview.testData.shapeError');
    return error.line
      ? this.i18n.translate('preview.testData.syntaxError', { line: error.line, column: error.column ?? 1 })
      : this.i18n.translate('preview.testData.syntaxError', { line: 1, column: 1 });
  }
}
