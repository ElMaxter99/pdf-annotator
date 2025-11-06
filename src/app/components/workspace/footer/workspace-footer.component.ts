import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { WorkspacePageComponent } from '../../../pages/workspace/workspace.page';

@Component({
  selector: 'app-workspace-footer',
  standalone: true,
  templateUrl: './workspace-footer.component.html',
  styleUrls: ['./workspace-footer.component.scss'],
  imports: [CommonModule],
})
export class WorkspaceFooterComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
}
