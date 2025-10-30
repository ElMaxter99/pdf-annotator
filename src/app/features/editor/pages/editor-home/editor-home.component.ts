import { Component } from '@angular/core';
import { EditorWorkspaceComponent } from '../../components/workspace/editor-workspace.component';

/**
 * Página principal del editor. Renderiza el workspace completo con todas las herramientas
 * de anotación y se usa como ruta por defecto dentro del módulo privado.
 */
@Component({
  selector: 'app-editor-home',
  standalone: true,
  imports: [EditorWorkspaceComponent],
  templateUrl: './editor-home.component.html',
  styleUrls: ['./editor-home.component.scss'],
})
export class EditorHomeComponent {}
