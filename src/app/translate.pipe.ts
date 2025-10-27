import { Pipe, PipeTransform } from '@angular/core';
import { I18nService, TranslationParams } from './i18n.service';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(key: string, params?: TranslationParams): string {
    if (!key) {
      return '';
    }
    return this.i18n.translate(key, params);
  }
}
