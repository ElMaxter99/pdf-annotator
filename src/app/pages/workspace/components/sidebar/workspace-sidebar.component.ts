import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WorkspacePageComponent } from '../../workspace.page';
import { InfoTipComponent } from '../../../../components/info-tip/info-tip.component';
import { JsonCodeEditorComponent } from '../../../../components/json-code-editor/json-code-editor.component';
import { JsonFormatMenuComponent } from '../../../../components/json-format-menu/json-format-menu.component';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { JsonTreeComponent } from '../json-tree/json-tree.component';
import { BatchDocumentComponent } from '../batch-document/batch-document.component';
import { MigrationPanelComponent } from '../migration/migration-panel.component';
import { PageThumbnailsComponent } from '../page-thumbnails/page-thumbnails.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-workspace-sidebar',
  standalone: true,
  templateUrl: './workspace-sidebar.component.html',
  styleUrls: ['./workspace-sidebar.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslationPipe,
    JsonFormatMenuComponent,
    JsonCodeEditorComponent,
    JsonTreeComponent,
    PageThumbnailsComponent,
    MigrationPanelComponent,
    BatchDocumentComponent,
    InfoTipComponent,
  ],
})
export class WorkspaceSidebarComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('pdfFileInput', { static: false }) pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customFontInput', { static: false })
  customFontInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('jsonEditor', { static: false }) jsonEditorRef?: JsonCodeEditorComponent;
  @ViewChild('jsonTree', { static: false }) jsonTreeComponent?: JsonTreeComponent;

  openFromRail(tab: 'document' | 'annotations' | 'settings'): void {
    this.vm.setSidebarTab(tab);
    this.vm.sidebarMinimized.set(false);
  }

  get pdfFileInputElement(): HTMLInputElement | null {
    return this.pdfFileInputRef?.nativeElement ?? null;
  }

  get customFontInputElement(): HTMLInputElement | null {
    return this.customFontInputRef?.nativeElement ?? null;
  }

  foldJson(fold: boolean): void {
    if (fold) {
      this.jsonEditorRef?.foldAll();
    } else {
      this.jsonEditorRef?.unfoldAll();
    }
  }

  /** «Pegar JSON» of the empty state: opens the text editor and puts the cursor in it. */
  pasteJson(): void {
    this.vm.jsonPanelCollapsed.set(false);
    this.vm.setJsonViewMode('text');
    setTimeout(() => this.jsonEditorRef?.focus());
  }
}
