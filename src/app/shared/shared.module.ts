import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';
import { TranslationPipe } from './pipes/translation.pipe';

@NgModule({
  imports: [CommonModule, FormsModule, LanguageSelectorComponent, TranslationPipe],
  exports: [CommonModule, FormsModule, LanguageSelectorComponent, TranslationPipe],
})
export class SharedModule {}
