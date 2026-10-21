import { Component, ElementRef, EventEmitter, Output, ViewChild, AfterViewInit } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

interface ShortcutGroup {
  readonly titleKey: string;
  readonly items: readonly {
    readonly keys: readonly string[];
    readonly labelKey: string;
    readonly sep?: '/';
  }[];
}

@Component({
  selector: 'app-shortcuts-dialog',
  standalone: true,
  templateUrl: './shortcuts-dialog.component.html',
  imports: [TranslationPipe],
})
export class ShortcutsDialogComponent implements AfterViewInit {
  @Output() closed = new EventEmitter<void>();
  @ViewChild('closeButton', { static: true }) closeButton!: ElementRef<HTMLButtonElement>;

  readonly groups: readonly ShortcutGroup[] = [
    {
      titleKey: 'shortcuts.groups.navigation',
      items: [
        { keys: ['←', 'PgUp'], sep: '/', labelKey: 'shortcuts.items.prevPage' },
        { keys: ['→', 'PgDn'], sep: '/', labelKey: 'shortcuts.items.nextPage' },
        { keys: ['Home', 'End'], sep: '/', labelKey: 'shortcuts.items.firstLastPage' },
        { keys: ['+', '−'], sep: '/', labelKey: 'shortcuts.items.zoom' },
        { keys: ['0'], labelKey: 'shortcuts.items.fitWidth' },
        { keys: ['B'], labelKey: 'shortcuts.items.toggleSidebar' },
      ],
    },
    {
      titleKey: 'shortcuts.groups.annotations',
      items: [
        { keys: ['Click'], labelKey: 'shortcuts.items.addAnnotation' },
        { keys: ['Enter'], labelKey: 'shortcuts.items.confirm' },
        { keys: ['Esc'], labelKey: 'shortcuts.items.cancel' },
        { keys: ['Ctrl/⌘', 'Z'], labelKey: 'shortcuts.items.undo' },
        { keys: ['Ctrl/⌘', 'Y'], labelKey: 'shortcuts.items.redo' },
        { keys: ['Ctrl/⌘', 'S'], labelKey: 'shortcuts.items.applyJson' },
      ],
    },
    {
      titleKey: 'shortcuts.groups.selection',
      items: [
        { keys: ['Shift', 'Click'], labelKey: 'shortcuts.items.selectToggle' },
        { keys: ['▭'], labelKey: 'shortcuts.items.selectLasso' },
        { keys: ['Ctrl/⌘', 'A'], labelKey: 'shortcuts.items.selectAll' },
        { keys: ['←', '↑', '→', '↓'], sep: '/', labelKey: 'shortcuts.items.selectMove' },
        { keys: ['Supr', 'Del'], sep: '/', labelKey: 'shortcuts.items.selectDelete' },
        { keys: ['Ctrl/⌘', 'C / V'], labelKey: 'shortcuts.items.selectCopy' },
        { keys: ['Ctrl/⌘', 'D'], labelKey: 'shortcuts.items.selectDuplicate' },
        { keys: ['Esc'], labelKey: 'shortcuts.items.selectClear' },
      ],
    },
    {
      titleKey: 'shortcuts.groups.general',
      items: [{ keys: ['?'], labelKey: 'shortcuts.items.help' }],
    },
  ];

  ngAfterViewInit() {
    this.closeButton.nativeElement.focus();
  }
}
