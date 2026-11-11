import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WorkspacePageComponent } from '../../workspace.page';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { JsonTreeComponent } from '../json-tree/json-tree.component';
import { BatchDocumentComponent } from '../batch-document/batch-document.component';
import { MigrationPanelComponent } from '../migration/migration-panel.component';
import { PageThumbnailsComponent } from '../page-thumbnails/page-thumbnails.component';

@Component({
  selector: 'app-workspace-sidebar',
  standalone: true,
  templateUrl: './workspace-sidebar.component.html',
  styleUrls: ['./workspace-sidebar.component.scss'],
  imports: [CommonModule, FormsModule, TranslationPipe, JsonTreeComponent, PageThumbnailsComponent, MigrationPanelComponent, BatchDocumentComponent],
})
export class WorkspaceSidebarComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('pdfFileInput', { static: false }) pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customFontInput', { static: false }) customFontInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('jsonEditor', { static: false }) jsonEditorRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('jsonTree', { static: false }) jsonTreeComponent?: JsonTreeComponent;

  get pdfFileInputElement(): HTMLInputElement | null {
    return this.pdfFileInputRef?.nativeElement ?? null;
  }

  get customFontInputElement(): HTMLInputElement | null {
    return this.customFontInputRef?.nativeElement ?? null;
  }

  get jsonEditorElement(): HTMLTextAreaElement | null {
    return this.jsonEditorRef?.nativeElement ?? null;
  }
}
