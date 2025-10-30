import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EditorHomeComponent } from './pages/editor-home/editor-home.component';
import { PdfPreviewComponent } from './pages/pdf-preview/pdf-preview.component';
import { PdfSettingsComponent } from './pages/pdf-settings/pdf-settings.component';

// Rutas hijas del editor: comparten el mismo workspace para garantizar un estado único
// y permiten habilitar vistas especializadas (home, preview, settings) vía lazy loading.
const routes: Routes = [
  { path: '', component: EditorHomeComponent },
  { path: 'preview', component: PdfPreviewComponent },
  { path: 'settings', component: PdfSettingsComponent },
];

@NgModule({
  imports: [
    RouterModule.forChild(routes),
    EditorHomeComponent,
    PdfPreviewComponent,
    PdfSettingsComponent,
  ],
  exports: [RouterModule],
})
export class EditorRoutingModule {}
