import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { UpdateChannelComponent } from '../../../../components/update-channel/update-channel.component';
import type { WorkspacePageComponent } from '../../workspace.page';

@Component({
  selector: 'app-workspace-footer',
  standalone: true,
  templateUrl: './workspace-footer.component.html',
  styleUrls: ['./workspace-footer.component.scss'],
  imports: [CommonModule, TranslationPipe, UpdateChannelComponent],
})
export class WorkspaceFooterComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
}
