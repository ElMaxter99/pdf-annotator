import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WorkspacePageComponent } from '../../workspace.page';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { LanguageSelectorComponent } from '../../../../components/language-selector/language-selector.component';
import { GuidedTourAnchorDirective } from '../../../../shared/guided-tour/guided-tour-anchor.directive';

@Component({
  selector: 'app-workspace-header',
  standalone: true,
  templateUrl: './workspace-header.component.html',
  styleUrls: ['./workspace-header.component.scss'],
  imports: [CommonModule, FormsModule, TranslationPipe, LanguageSelectorComponent, GuidedTourAnchorDirective],
})
export class WorkspaceHeaderComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('coordsFileInput', { static: false })
  coordsFileInputRef?: ElementRef<HTMLInputElement>;

  get coordsFileInputElement(): HTMLInputElement | null {
    return this.coordsFileInputRef?.nativeElement ?? null;
  }
}
