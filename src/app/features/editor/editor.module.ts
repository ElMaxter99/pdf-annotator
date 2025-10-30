import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { EditorToolbarComponent } from './components/toolbar/editor-toolbar.component';
import { EditorSidebarComponent } from './components/sidebar/editor-sidebar.component';
import { EditorCanvasComponent } from './components/canvas/editor-canvas.component';
import { EditorRoutingModule } from './editor-routing.module';
import { EditorHomePageComponent } from './pages/editor-home/editor-home.component';
import { PdfPreviewPageComponent } from './pages/pdf-preview/pdf-preview.page';
import { PdfSettingsPageComponent } from './pages/pdf-settings/pdf-settings.page';

/**
 * Módulo principal del editor. Expone la home y páginas auxiliares.
 */
@NgModule({
  declarations: [
    EditorHomePageComponent,
    PdfPreviewPageComponent,
    PdfSettingsPageComponent,
    EditorToolbarComponent,
    EditorSidebarComponent,
    EditorCanvasComponent,
  ],
  imports: [SharedModule, EditorRoutingModule],
})
export class EditorModule {}
