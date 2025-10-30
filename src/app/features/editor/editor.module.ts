import { NgModule } from '@angular/core';

import { SharedModule } from '../../shared/shared.module';
import { EditorRoutingModule } from './editor-routing.module';
import { EditorToolbarComponent } from './components/toolbar/editor-toolbar.component';
import { EditorSidebarComponent } from './components/sidebar/editor-sidebar.component';
import { EditorViewerComponent } from './components/viewer/editor-viewer.component';
import { EditorHomeComponent } from './pages/editor-home/editor-home.component';

/**
 * Private editor area grouped as a feature module to isolate its dependencies
 * and allow lazy loading.
 */
@NgModule({
  declarations: [
    EditorHomeComponent,
    EditorToolbarComponent,
    EditorSidebarComponent,
    EditorViewerComponent,
  ],
  imports: [SharedModule, EditorRoutingModule],
})
export class EditorModule {}
