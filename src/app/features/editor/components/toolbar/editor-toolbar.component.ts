import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Language } from '../../../../core/services/translation.service';

@Component({
  selector: 'app-editor-toolbar',
  templateUrl: './editor-toolbar.component.html',
  styleUrls: ['./editor-toolbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Toolbar rendering component exposing high-level editor actions as dumb outputs.
 */
export class EditorToolbarComponent {
  @Input({ required: true }) appName!: string;
  @Input({ required: true }) version!: string;
  @Input({ required: true }) pageIndex!: number;
  @Input({ required: true }) pageCount!: number;
  @Input({ required: true }) scale!: number;
  @Input({ required: true }) canUndo!: boolean;
  @Input({ required: true }) canRedo!: boolean;
  @Input({ required: true }) hasPdf!: boolean;
  @Input({ required: true }) hasAnnotations!: boolean;
  @Input({ required: true }) languages!: readonly Language[];
  @Input({ required: true }) selectedLanguage!: Language;

  @Output() prevPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() zoomIn = new EventEmitter<void>();
  @Output() zoomOut = new EventEmitter<void>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() clearAll = new EventEmitter<void>();
  @Output() downloadAnnotated = new EventEmitter<void>();
  @Output() languageChange = new EventEmitter<Language>();
}
