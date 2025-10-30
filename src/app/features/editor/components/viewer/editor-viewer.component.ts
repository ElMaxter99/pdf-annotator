import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Container for the PDF canvas area. Content projection keeps the existing
 * rendering logic in the host component while providing a clear separation of
 * layout responsibilities.
 */
@Component({
  selector: 'app-editor-viewer',
  standalone: false,
  templateUrl: './editor-viewer.component.html',
  styleUrls: ['./editor-viewer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorViewerComponent {}
