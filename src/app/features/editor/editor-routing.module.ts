import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EditorHomePageComponent } from './pages/editor-home/editor-home.page';

const routes: Routes = [
  {
    path: '',
    component: EditorHomePageComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class EditorRoutingModule {}
