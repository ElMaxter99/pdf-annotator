import { EditorSettingsService } from '../../../../services/editor-settings.service';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FocusTrapDirective } from '../../../../directives/focus-trap.directive';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { TranslationService } from '../../../../i18n/translation.service';
import { OptionsService } from '../../../../services/options.service';
import { ThemeService } from '../../../../services/theme.service';
import {
  filterCommands,
  loadRecent,
  moveActive,
  pushRecent,
  saveRecent,
  suggestedCommands,
  type PaletteCommand,
} from '../../../../utils/command-palette.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

const DEFAULT_IDS = ['undo', 'download', 'tab-annotations', 'shortcuts'];

export type PaletteTranslate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Command palette (P-45): Ctrl+K opens a search box over the actions of the editor and the
 * batch. It adds a second way to reach them; buttons and one-key shortcuts stay where they are.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-command-palette',
  standalone: true,
  templateUrl: './command-palette.component.html',
  styleUrls: ['./command-palette.component.scss'],
  imports: [FocusTrapDirective, TranslationPipe],
})
export class CommandPaletteComponent implements OnInit {
  @Input() vm!: WorkspacePageComponent;
  private readonly editorSettings = inject(EditorSettingsService);
  /** Actions of another screen (the batch panel); without it the palette lists the editor's. */
  @Input() source?: (t: PaletteTranslate) => PaletteCommand[];
  @Input() defaultIds: readonly string[] = DEFAULT_IDS;
  @Output() closed = new EventEmitter<void>();
  @Output() shortcutsRequested = new EventEmitter<void>();
  @ViewChild('input', { static: true }) input!: ElementRef<HTMLInputElement>;

  private readonly i18n = inject(TranslationService);
  private readonly theme = inject(ThemeService);
  private readonly options = inject(OptionsService);

  readonly query = signal('');
  readonly activeIndex = signal(0);
  private readonly recent = signal<string[]>(loadRecent());

  private readonly all = computed(() =>
    this.source ? this.source((key, params) => this.t(key, params)) : this.buildCommands(),
  );
  readonly results = computed(() => {
    const query = this.query();
    return query.trim()
      ? filterCommands(this.all(), query)
      : suggestedCommands(this.all(), this.recent(), this.defaultIds);
  });
  readonly searching = computed(() => this.query().trim().length > 0);
  readonly activeId = computed(() => {
    const row = this.results()[this.activeIndex()];
    return row ? this.optionId(row) : null;
  });

  ngOnInit(): void {
    this.activeIndex.set(this.firstEnabled());
  }

  optionId(command: PaletteCommand): string {
    return `palette-opt-${command.id}`;
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params);
  }

  onQuery(value: string): void {
    this.query.set(value);
    this.activeIndex.set(this.firstEnabled());
  }

  onKeydown(event: KeyboardEvent): void {
    const rows = this.results();
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const next = moveActive(rows, this.activeIndex(), event.key === 'ArrowDown' ? 1 : -1);
        if (next >= 0) {
          this.activeIndex.set(next);
          this.scrollActiveIntoView();
        }
        break;
      }
      case 'Enter':
        event.preventDefault();
        this.run(rows[this.activeIndex()]);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closed.emit();
        break;
      default:
        break;
    }
  }

  run(command: PaletteCommand | undefined): void {
    if (!command || command.disabledReason) {
      return;
    }
    this.recent.set(pushRecent(this.recent(), command.id));
    saveRecent(this.recent());
    this.closed.emit();
    // After the palette is gone, so focus goes back first and the action may take it again.
    setTimeout(() => command.run());
  }

  openShortcuts(): void {
    this.closed.emit();
    if (this.source) {
      this.shortcutsRequested.emit();
      return;
    }
    setTimeout(() => this.vm.toggleShortcuts(true));
  }

  private firstEnabled(): number {
    const index = this.results().findIndex((command) => !command.disabledReason);
    return index < 0 ? 0 : index;
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => {
      const id = this.activeId();
      if (id) {
        document.getElementById(id)?.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private buildCommands(): PaletteCommand[] {
    const vm = this.vm;
    const t = (key: string, params?: Record<string, string | number>) => this.t(key, params);
    const hasPdf = !!vm.pdfDoc();
    const noPdf = hasPdf ? undefined : t('palette.why.noPdf');
    const batch = vm.batchCtx();
    const list: PaletteCommand[] = [];
    const add = (command: PaletteCommand) => list.push(command);
    const ctrl = this.i18n.translate('palette.ctrl');

    add({
      id: 'undo',
      icon: '↶',
      label: t('controls.undo'),
      keywords: 'undo',
      shortcut: `${ctrl}+Z`,
      disabledReason: vm.canUndo() ? undefined : t('palette.why.nothingToUndo'),
      run: () => vm.undo(),
    });
    add({
      id: 'redo',
      icon: '↷',
      label: t('controls.redo'),
      keywords: 'redo',
      shortcut: `${ctrl}+Y`,
      disabledReason: vm.canRedo() ? undefined : t('palette.why.nothingToRedo'),
      run: () => vm.redo(),
    });
    add({
      id: 'download',
      icon: '⬇',
      label: t('controls.downloadPdf'),
      keywords: 'download export pdf',
      disabledReason: !hasPdf
        ? noPdf
        : vm.coords().length
          ? undefined
          : t('palette.why.noAnnotations'),
      run: () => void vm.downloadAnnotatedPDF(),
    });
    add({
      id: 'clear',
      icon: '🧹',
      label: t('controls.clear'),
      keywords: 'clear delete remove',
      hint: t('palette.hint.confirms'),
      disabledReason: vm.coords().length ? undefined : t('palette.why.noAnnotations'),
      run: () => vm.clearRequest.update((n) => n + 1),
    });

    add({ id: 'zoom-in', icon: '＋', label: t('controls.zoomIn'), keywords: 'zoom', shortcut: '+', disabledReason: noPdf, run: () => void vm.zoomIn() });
    add({ id: 'zoom-out', icon: '−', label: t('controls.zoomOut'), keywords: 'zoom', shortcut: '−', disabledReason: noPdf, run: () => void vm.zoomOut() });
    add({ id: 'fit-width', icon: '⤢', label: t('controls.fitWidth'), keywords: 'zoom fit width', shortcut: '0', disabledReason: noPdf, run: () => void vm.fitWidth() });
    add({ id: 'fit-page', icon: '⤡', label: t('palette.cmd.fitPage'), keywords: 'zoom fit page', shortcut: '⇧ 1', disabledReason: noPdf, run: () => void vm.fitPage() });
    add({ id: 'zoom-actual', icon: '1:1', label: t('palette.cmd.zoomActual'), keywords: 'zoom 100', shortcut: `${ctrl}+0`, disabledReason: noPdf, run: () => void vm.zoomActualSize() });
    add({ id: 'page-prev', icon: '⟨', label: t('controls.prev'), keywords: 'page', shortcut: '←', disabledReason: !hasPdf ? noPdf : vm.pageShown() === 1 ? t('palette.why.firstPage') : undefined, run: () => void vm.prevPage() });
    add({ id: 'page-next', icon: '⟩', label: t('controls.next'), keywords: 'page', shortcut: '→', disabledReason: !hasPdf ? noPdf : vm.pageShown() === vm.pageTotalShown() ? t('palette.why.lastPage') : undefined, run: () => void vm.nextPage() });

    for (const mode of vm.previewModes) {
      const dataOff = mode === 'data' && !vm.previewSettings.hasTestData();
      add({
        id: `view-${mode}`,
        icon: '◐',
        label: t('palette.cmd.view', { mode: t(`preview.mode.${mode}`) }),
        keywords: 'view preview',
        hint: vm.previewSettings.mode() === mode ? t('palette.hint.current') : undefined,
        disabledReason: !hasPdf ? noPdf : dataOff ? t('preview.mode.dataDisabled') : undefined,
        run: () => vm.setPreviewMode(mode),
      });
    }

    const tabs = ['document', 'annotations', 'settings'] as const;
    for (const tab of tabs) {
      add({
        id: `tab-${tab}`,
        icon: '▤',
        label: t('palette.cmd.tab', { tab: t(`sidebar.tabs.${tab}`) }),
        keywords: 'panel tab sidebar',
        run: () => {
          vm.sidebarMinimized.set(false);
          vm.setSidebarTab(tab);
        },
      });
    }

    if (batch) {
      const withA = vm.templateFieldsA() > 0;
      const noA = withA ? undefined : t('palette.why.noTemplateA');
      const hasB = !!vm.migration();
      const noB = hasB ? noA : (noA ?? t('palette.why.noVersionB'));
      add({ id: 'put-copy', icon: '✦', label: t('palette.cmd.putCopy'), keywords: 'template a copy', hint: t('palette.hint.batch'), disabledReason: noB, run: () => vm.putACopyRequest.update((n) => n + 1) });
      add({ id: 'put-missing', icon: '✦', label: t('palette.cmd.putMissing'), keywords: 'template a missing', hint: t('palette.hint.batch'), disabledReason: noB, run: () => vm.applyTemplateA('missing') });
      add({ id: 'put-adjust', icon: '✦', label: t('palette.cmd.putAdjust'), keywords: 'template a adjust texts', hint: t('palette.hint.batch'), disabledReason: noB, run: () => void vm.startAdjust() });
      if (vm.aiHelper.available) {
        add({ id: 'put-ai', icon: '✦', label: t('palette.cmd.putAi'), keywords: 'template a ai ia', hint: t('palette.hint.batch'), disabledReason: noB, run: () => void vm.startAi() });
      }
      add({ id: 'batch-panel', icon: '‹', label: t('palette.cmd.batchPanel'), keywords: 'batch lote panel back', hint: t('palette.hint.batch'), run: () => void vm.backToBatch() });
      add({ id: 'batch-prev', icon: '‹', label: t('palette.cmd.batchPrev'), keywords: 'batch lote previous', hint: t('palette.hint.batch'), disabledReason: batch.index === 0 ? t('palette.why.firstPdf') : undefined, run: () => void vm.goBatchItem(-1) });
      add({ id: 'batch-next', icon: '›', label: t('palette.cmd.batchNext'), keywords: 'batch lote next', hint: t('palette.hint.batch'), disabledReason: batch.index === batch.total - 1 ? t('palette.why.lastPdf') : undefined, run: () => void vm.goBatchItem(1) });
      vm.batchItemsForPalette().forEach((item, index) => {
        if (item.id === batch.item.id) {
          return;
        }
        add({
          id: `go-${item.id}`,
          icon: '›',
          label: t('palette.cmd.goTo', { name: item.bName ?? item.name }),
          keywords: `${item.name} ${item.bName ?? ''} pdf`,
          hint: t('palette.hint.position', { index: index + 1, total: batch.total }),
          run: () => void vm.openBatchItem(item.id),
        });
      });
    }

    const light = this.theme.theme() === 'light';
    add({
      id: 'theme',
      icon: light ? '☾' : '☀',
      label: t(light ? 'palette.cmd.themeDark' : 'palette.cmd.themeLight'),
      keywords: 'theme dark light tema',
      run: () => this.theme.toggleTheme(),
    });
    for (const lang of vm.languages) {
      add({
        id: `lang-${lang}`,
        icon: '🌐',
        label: t('palette.cmd.language', { language: t(`app.languages.${lang}`) }),
        keywords: `language idioma ${lang}`,
        hint: vm.languageModel() === lang ? t('palette.hint.current') : undefined,
        run: () => vm.onLanguageChange(lang),
      });
    }
    const snapOn = this.editorSettings.snapToAnnotations();
    add({
      id: 'snap-annotations',
      icon: '⇥',
      label: t(snapOn ? 'palette.cmd.snapOff' : 'palette.cmd.snapOn'),
      keywords: 'snap align alinear imán iman anotaciones arrastrar magnet',
      run: () => this.editorSettings.setSnapToAnnotations(!snapOn),
    });
    add({ id: 'shortcuts', icon: '⌨', label: t('shortcuts.open'), keywords: 'shortcuts keyboard help atajos', shortcut: '?', run: () => vm.toggleShortcuts(true) });
    if (this.options.available()) {
      add({ id: 'options', icon: '⚙', label: t('options.open'), keywords: 'options opciones settings ajustes ia updates actualizaciones', shortcut: 'Ctrl+,', run: () => this.options.open() });
    }
    add({ id: 'about', icon: 'ⓘ', label: t('about.open'), keywords: 'about version', run: () => vm.toggleAbout(true) });

    return list;
  }
}
