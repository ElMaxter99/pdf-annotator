import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { EditorRoutingModule } from './editor-routing.module';
import { EditorHomeComponent } from './pages/editor-home/editor-home.component';
import { PdfPreviewComponent } from './pages/pdf-preview/pdf-preview.component';
import { PdfSettingsComponent } from './pages/pdf-settings/pdf-settings.component';
import { EditorWorkspaceComponent } from './components/workspace/editor-workspace.component';
import { EditorToolbarComponent } from './components/toolbar/editor-toolbar.component';
import { EditorSidebarComponent } from './components/sidebar/editor-sidebar.component';
import { EditorFooterComponent } from './components/footer/editor-footer.component';
import { EditorCanvasComponent } from './components/canvas/editor-canvas.component';
import { AnnotationFormComponent } from './components/annotation-form/annotation-form.component';

@NgModule({
  imports: [
    SharedModule,
    EditorRoutingModule,
    EditorHomeComponent,
    PdfPreviewComponent,
    PdfSettingsComponent,
    EditorWorkspaceComponent,
    EditorToolbarComponent,
    EditorSidebarComponent,
    EditorFooterComponent,
    EditorCanvasComponent,
    AnnotationFormComponent,
  ],
})
export class EditorModule {}
