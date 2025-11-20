import { CommonModule } from '@angular/common';
import { Component, Input, computed } from '@angular/core';
import type { WorkspacePageComponent } from '../../workspace.page';
import { DiffKind } from '../../../../models/annotation-diff.model';

@Component({
  selector: 'app-annotation-diff',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './annotation-diff.component.html',
  styleUrls: ['./annotation-diff.component.scss'],
})
export class AnnotationDiffComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly summary = computed(() => {
    const diffs = this.vm.diffEntries();
    return {
      total: diffs.length,
      added: diffs.filter((item) => item.kind === 'added').length,
      removed: diffs.filter((item) => item.kind === 'removed').length,
      modified: diffs.filter((item) => item.kind === 'modified').length,
      accepted: diffs.filter((item) => item.resolution === 'accepted').length,
    };
  });

  trackById(_index: number, item: { id: string }) {
    return item.id;
  }

  formatKind(kind: DiffKind): string {
    switch (kind) {
      case 'added':
        return 'Añadido';
      case 'removed':
        return 'Eliminado';
      case 'modified':
        return 'Modificado';
    }
  }
}
