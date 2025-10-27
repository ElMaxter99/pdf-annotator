import { Pipe, PipeTransform } from '@angular/core';

import { TranslationService } from './translation.service';

@Pipe({
  name: 't',
  standalone: true,
  pure: false,
})
export class TranslationPipe implements PipeTransform {
  constructor(private readonly translation: TranslationService) {}

  transform(key: string, params?: Record<string, unknown>): string {
    return this.translation.translate(key, params);
  }
}
