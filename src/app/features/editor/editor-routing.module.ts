import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { EditorHomePageComponent } from './pages/editor-home/editor-home.component';
import { PdfPreviewPageComponent } from './pages/pdf-preview/pdf-preview.page';
import { PdfSettingsPageComponent } from './pages/pdf-settings/pdf-settings.page';

const routes: Routes = [
  {
    path: '',
    component: EditorHomePageComponent,
  },
  {
    path: 'preview',
    component: PdfPreviewPageComponent,
  },
  {
    path: 'settings',
    component: PdfSettingsPageComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditorRoutingModule {}
