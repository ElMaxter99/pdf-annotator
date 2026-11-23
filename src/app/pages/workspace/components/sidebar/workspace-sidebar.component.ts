import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Input, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WorkspacePageComponent } from '../../workspace.page';
import { InfoTipComponent } from '../../../../components/info-tip/info-tip.component';
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
  imports: [CommonModule, FormsModule, TranslationPipe, JsonTreeComponent, PageThumbnailsComponent, MigrationPanelComponent, BatchDocumentComponent, InfoTipComponent],
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

  /** Cierra la ventana «Formato al copiar» al pulsar fuera de ella. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.vm?.jsonCopyOpen()) return;
    const target = event.target as Element | null;
    if (!target?.closest?.('.json-copy')) this.vm.closeJsonCopyPanel();
  }

  /** «Pegar JSON» of the empty state: opens the text editor and puts the cursor in it. */
  pasteJson(): void {
    this.vm.jsonPanelCollapsed.set(false);
    this.vm.setJsonViewMode('text');
    setTimeout(() => this.jsonEditorRef?.nativeElement.focus());
  }
}
