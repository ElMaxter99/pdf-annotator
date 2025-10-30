import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TranslationPipe } from '../core/i18n/translation.pipe';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';

/**
 * Module that groups reusable presentation components, directives and pipes.
 */
@NgModule({
  declarations: [LanguageSelectorComponent, TranslationPipe],
  imports: [CommonModule, FormsModule],
  exports: [CommonModule, FormsModule, LanguageSelectorComponent, TranslationPipe],
})
export class SharedModule {}
