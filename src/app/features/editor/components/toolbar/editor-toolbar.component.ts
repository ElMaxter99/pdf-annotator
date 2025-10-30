import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Language } from '../../../../core/services/translation.service';
import { LanguageSelectorComponent } from '../../../../shared/components/language-selector/language-selector.component';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';

@Component({
  selector: 'app-editor-toolbar',
  standalone: true,
  imports: [CommonModule, LanguageSelectorComponent, TranslationPipe],
  templateUrl: './editor-toolbar.component.html',
  styleUrls: ['./editor-toolbar.component.scss'],
})
export class EditorToolbarComponent {
  @Input() appName = '';
  @Input() version = '';
  @Input() pageIndex = 1;
  @Input() pageCount = 0;
  @Input() scale = 1;
  @Input() pdfLoaded = false;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() hasAnnotations = false;
  @Input() languages: readonly Language[] = [];
  @Input() selectedLanguage!: Language;

  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
  @Output() languageChange = new EventEmitter<Language>();
}
