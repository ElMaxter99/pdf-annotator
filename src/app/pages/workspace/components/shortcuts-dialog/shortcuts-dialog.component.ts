import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { ShortcutAction, ShortcutDefinition, ShortcutsService } from '../../../../services/shortcuts.service';

interface ShortcutChangeEvent {
  readonly action: ShortcutAction;
  readonly combo: string;
}

@Component({
  selector: 'app-shortcuts-dialog',
  standalone: true,
  templateUrl: './shortcuts-dialog.component.html',
  styleUrls: ['./shortcuts-dialog.component.scss'],
  imports: [CommonModule, TranslationPipe],
})
export class ShortcutsDialogComponent {
  @Input({ required: true }) definitions: readonly ShortcutDefinition[] = [];
  @Input({ required: true }) bindings: Record<ShortcutAction, string[]> = {};
  @Output() close = new EventEmitter<void>();
  @Output() restoreDefaults = new EventEmitter<void>();
  @Output() bindingAdded = new EventEmitter<ShortcutChangeEvent>();
  @Output() bindingRemoved = new EventEmitter<ShortcutChangeEvent>();

  @ViewChild('dialogRoot', { static: true }) dialogRoot?: ElementRef<HTMLDivElement>;

  listeningFor: ShortcutAction | null = null;

  private readonly shortcutsService = inject(ShortcutsService);

  getBindingsFor(action: ShortcutAction): string[] {
    return this.bindings[action] ?? [];
  }

  formatBinding(binding: string): string {
    return this.shortcutsService.formatBindingLabel(binding);
  }

  startListening(action: ShortcutAction) {
    this.listeningFor = action;
    queueMicrotask(() => this.dialogRoot?.nativeElement.focus());
  }

  stopListening() {
    this.listeningFor = null;
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target !== event.currentTarget) {
      return;
    }
    this.close.emit();
  }

  onKeydown(event: KeyboardEvent) {
    if (this.listeningFor) {
      event.preventDefault();

      if (event.key === 'Escape') {
        this.stopListening();
        return;
      }

      const combo = this.shortcutsService.getEventCombo(event);

      if (combo) {
        this.bindingAdded.emit({ action: this.listeningFor, combo });
        this.stopListening();
      }
      return;
    }

    if (event.key === 'Escape') {
      this.close.emit();
    }
  }

  removeBinding(action: ShortcutAction, combo: string) {
    this.bindingRemoved.emit({ action, combo });
  }
}
