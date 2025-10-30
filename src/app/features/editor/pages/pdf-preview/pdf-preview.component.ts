import { Component } from '@angular/core';
import { EditorWorkspaceComponent } from '../../components/workspace/editor-workspace.component';

/**
 * Página dedicada a la vista previa del PDF. Reutiliza el workspace principal
 * para mantener todo el comportamiento sincronizado con el resto de rutas del editor.
 */
@Component({
  selector: 'app-pdf-preview-page',
  standalone: true,
  imports: [EditorWorkspaceComponent],
  templateUrl: './pdf-preview.component.html',
  styleUrls: ['./pdf-preview.component.scss'],
})
export class PdfPreviewComponent {}
