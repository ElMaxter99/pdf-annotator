import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { TranslationPipe } from './pipes/translation.pipe';

/**
 * SharedModule groups reusable UI pieces (components, pipes) consumed by multiple features.
 */
@NgModule({
  declarations: [LanguageSelectorComponent, TranslationPipe],
  imports: [CommonModule, FormsModule],
  exports: [CommonModule, FormsModule, LanguageSelectorComponent, TranslationPipe],
})
export class SharedModule {}
