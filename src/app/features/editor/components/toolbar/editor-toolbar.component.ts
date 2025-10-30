import { Component, EventEmitter, Input, Output } from '@angular/core';

import { Language } from '../../../../core/i18n/translation.service';

@Component({
  selector: 'app-editor-toolbar',
  templateUrl: './editor-toolbar.component.html',
  styleUrls: ['./editor-toolbar.component.scss'],
})
export class EditorToolbarComponent {
  @Input({ required: true }) appName!: string;
  @Input({ required: true }) version!: string;
  @Input({ required: true }) pageIndex!: number;
  @Input({ required: true }) pageCount!: number;
  @Input({ required: true }) scale!: number;
  @Input({ required: true }) hasPdf!: boolean;
  @Input({ required: true }) canUndo!: boolean;
  @Input({ required: true }) canRedo!: boolean;
  @Input({ required: true }) hasCoords!: boolean;
  @Input({ required: true }) languages!: readonly Language[];
  @Input({ required: true }) languageModel!: Language;

  @Output() readonly prev = new EventEmitter<void>();
  @Output() readonly next = new EventEmitter<void>();
  @Output() readonly zoomOut = new EventEmitter<void>();
  @Output() readonly zoomIn = new EventEmitter<void>();
  @Output() readonly undo = new EventEmitter<void>();
  @Output() readonly redo = new EventEmitter<void>();
  @Output() readonly clear = new EventEmitter<void>();
  @Output() readonly download = new EventEmitter<void>();
  @Output() readonly languageChange = new EventEmitter<Language>();

  onLanguageChange(language: Language) {
    this.languageChange.emit(language);
  }
}
