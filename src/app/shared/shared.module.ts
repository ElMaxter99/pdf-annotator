import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { TranslationPipe } from './pipes/translation.pipe';

/**
 * Reúne componentes y pipes reutilizables disponibles en toda la aplicación.
 */
@NgModule({
  declarations: [LanguageSelectorComponent, TranslationPipe],
  imports: [CommonModule, FormsModule],
  exports: [CommonModule, FormsModule, LanguageSelectorComponent, TranslationPipe],
})
export class SharedModule {}
