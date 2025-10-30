import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { Language } from '../../../../core/i18n/translation.service';

/**
 * Toolbar with navigation, zoom, history and export actions for the editor.
 * Receives all state as inputs so it stays presentation focused.
 */
@Component({
  selector: 'app-editor-toolbar',
  standalone: false,
  templateUrl: './editor-toolbar.component.html',
  styleUrls: ['./editor-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorToolbarComponent {
  @Input() appName = '';
  @Input() version = '';
  @Input() pageIndex = 1;
  @Input() pageCount = 0;
  @Input() scale = 1;
  @Input() hasPdf = false;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() hasCoords = false;
  @Input() languages: readonly Language[] = [];
  @Input() selectedLanguage!: Language;

  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() clearAll = new EventEmitter<void>();
  @Output() downloadPdf = new EventEmitter<void>();
  @Output() languageChange = new EventEmitter<Language>();

  onLanguageChange(language: Language) {
    this.languageChange.emit(language);
  }
}
