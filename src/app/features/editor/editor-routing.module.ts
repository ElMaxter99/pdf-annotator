import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { EditorHomeComponent } from './pages/editor-home/editor-home.component';

const routes: Routes = [
  {
    path: '',
    component: EditorHomeComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditorRoutingModule {}
