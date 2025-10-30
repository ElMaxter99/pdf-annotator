import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { EditorSidebarComponent } from './components/sidebar/editor-sidebar.component';
import { EditorToolbarComponent } from './components/toolbar/editor-toolbar.component';
import { EditorRoutingModule } from './editor-routing.module';
import { EditorHomePageComponent } from './pages/editor-home/editor-home.page';

/**
 * Feature module that contains the complete PDF annotation workspace and its supporting components.
 */
@NgModule({
  declarations: [EditorHomePageComponent, EditorToolbarComponent, EditorSidebarComponent],
  imports: [CommonModule, SharedModule, EditorRoutingModule],
})
export class EditorModule {}
