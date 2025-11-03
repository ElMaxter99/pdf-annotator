import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { Language } from '../../i18n/translation.service';
import { ThemeVariant } from '../../models/theme.model';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { LogoComponent } from '../logo/logo.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  imports: [CommonModule, FormsModule, TranslationPipe, LanguageSelectorComponent, LogoComponent],
})
export class LandingComponent {
  @Input({ required: true }) languages: readonly Language[] = [];
  @Input({ required: true }) selectedLanguage!: Language;
  @Input({ required: true }) appName = '';
  @Input({ required: true }) version = '';
  @Input({ required: true }) currentYear!: number;
  @Input({ required: true }) appAuthor = '';
  @Input({ required: true }) fileDropActive = false;
  @Input({ required: true }) theme!: ThemeVariant;

  @Output() languageChange = new EventEmitter<Language>();
  @Output() fileSelected = new EventEmitter<Event>();
  @Output() fileUploadKeydown = new EventEmitter<KeyboardEvent>();
  @Output() fileDragOver = new EventEmitter<DragEvent>();
  @Output() fileDragLeave = new EventEmitter<DragEvent>();
  @Output() fileDrop = new EventEmitter<DragEvent>();
  @Output() openFilePicker = new EventEmitter<void>();
  @Output() toggleTheme = new EventEmitter<void>();

  @ViewChild('pdfFileInput', { static: false })
  pdfFileInputRef?: ElementRef<HTMLInputElement>;

  get pdfFileInputElement(): HTMLInputElement | null {
    return this.pdfFileInputRef?.nativeElement ?? null;
  }
}
