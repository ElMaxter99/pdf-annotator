import { Component } from '@angular/core';
import { EditorWorkspaceComponent } from '../../components/workspace/editor-workspace.component';

/**
 * Página pensada para gestionar configuraciones avanzadas del editor. De momento reutiliza
 * el workspace principal para mantener la lógica centralizada en un solo componente.
 */
@Component({
  selector: 'app-pdf-settings-page',
  standalone: true,
  imports: [EditorWorkspaceComponent],
  templateUrl: './pdf-settings.component.html',
  styleUrls: ['./pdf-settings.component.scss'],
})
export class PdfSettingsComponent {}
