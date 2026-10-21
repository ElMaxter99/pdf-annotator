import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  computed,
  AfterViewChecked,
  effect,
  untracked,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { Language, TranslationService } from '../../i18n/translation.service';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../app-version';
import '../../promise-with-resolvers.polyfill';
import '../../array-buffer-transfer.polyfill';
import { FieldType, PageAnnotations, PageField } from '../../models/annotation.model';
import { AnnotationTemplatesService, AnnotationTemplate } from '../../annotation-templates.service';
import {
  DEFAULT_GUIDE_SETTINGS,
  GuideSettings,
  cloneGuideSettings,
  differsFromDefaultGuideSettings,
} from '../../models/guide-settings.model';
import { WorkspaceHeaderComponent } from './components/header/workspace-header.component';
import { WorkspaceSidebarComponent } from './components/sidebar/workspace-sidebar.component';
import { WorkspaceViewerComponent } from './components/viewer/workspace-viewer.component';
import { ShortcutsDialogComponent } from './components/shortcuts-dialog/shortcuts-dialog.component';
import { WorkspaceFooterComponent } from './components/footer/workspace-footer.component';
import { PageThumbnail } from '../../models/page-thumbnail.model';
import {
  CustomFontEntry,
  DEFAULT_FONT_ID,
  FontCatalogService,
  FontOption,
} from '../../fonts/font-catalog.service';
import { FontVariantDescriptor } from '../../fonts/font-variant';
import {
  AnnotationImportService,
  emptyImportReport,
  ImportReport,
} from '../../services/annotation-import.service';
import { ToastService } from '../../services/toast.service';
import { AnnotationStore } from '../../services/annotation-store';
import { PdfExportService } from '../../services/pdf-export.service';
import { SessionStoreService } from '../../services/session-store.service';
import { PendingFileService, PendingRestore } from '../../services/pending-file.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { isPdfFile } from '../../utils/pdf-file.utils';
import {
  extractPagesCollection,
  normalizeFieldDecimals,
  normalizeFieldType,
  sanitizeOptionalAppender,
  sanitizeTextPreservingSpacing,
} from '../../utils/annotation-fields.utils';
import {
  addFieldToPages,
  cloneAnnotationPages,
  removeFieldFromPages,
  updateFieldInPages,
} from '../../utils/annotation-pages.utils';
import { downloadBlob, toArrayBuffer } from '../../utils/download.utils';
import { AlignMode, alignBoxes } from '../../utils/alignment.utils';
import { LooseJsonError, parseLooseJson } from '../../utils/loose-json';
import {
  ensureHex,
  hexToRgbComponents,
  normalizeColor,
  normalizeHexInput,
  parseColorComponents,
  parseRgbText,
  rgbToHex,
  toRgbString,
} from '../../utils/color.utils';
import { formatNumberWithTruncation, toFiniteNumber } from '../../utils/number.utils';

const PDF_WORKER_MODULE_SRC = '/assets/pdfjs/pdf.worker.entry.mjs';
const PDF_WORKER_TYPE_MODULE = 'module';

function supportsModuleWorkers(): boolean {
  if (
    typeof Worker === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }

  let url: string | null = null;

  try {
    const blob = new Blob([''], { type: 'application/javascript' });
    url = URL.createObjectURL(blob);
    const tester = new Worker(url, { type: 'module' });
    tester.terminate();
    return true;
  } catch {
    return false;
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

const workerOptions = (pdfjsLib as any).GlobalWorkerOptions as {
  workerSrc?: string;
  workerType?: string;
};

if (supportsModuleWorkers()) {
  workerOptions.workerSrc = PDF_WORKER_MODULE_SRC;
  workerOptions.workerType = PDF_WORKER_TYPE_MODULE;
} else {
  workerOptions.workerSrc = undefined;
  workerOptions.workerType = undefined;
}

type PreviewState = { page: number; field: PageField } | null;

type EditState = { pageIndex: number; fieldIndex: number; field: PageField } | null;

type JsonViewMode = 'text' | 'tree';

type EditorMode = 'preview' | 'edit';

type JsonTreePreviewStatus = 'empty' | 'ready' | 'error';

interface JsonTreePreview {
  status: JsonTreePreviewStatus;
  value: unknown | null;
  /** Position of the syntax error (status `error`). */
  errorAt?: { line: number; column: number };
  /** Whether the document has a usable `pages` list (status `ready`). */
  hasPages?: boolean;
  /** Raw number of field entries across all pages (status `ready`). */
  fieldCount?: number;
}

const SIDEBAR_TABS = ['document', 'annotations', 'templates', 'advanced'] as const;
type SidebarTab = (typeof SIDEBAR_TABS)[number];

const AUTO_APPLY_JSON_DELAY_MS = 300;
const SESSION_SAVE_DELAY_MS = 800;

/** The JSON parsed fine but has no `pages` list. */
class JsonShapeError extends Error {}
const MAX_JSON_IMPORT_BYTES = 5 * 1024 * 1024;

type OverlayGuide = {
  orientation: 'horizontal' | 'vertical';
  position: number;
  highlighted?: boolean;
};


interface FontDropdownUiState {
  readonly open: boolean;
  readonly query: string;
}

const DEFAULT_OPACITY = 1;

@Component({
  selector: 'app-workspace-page',
  standalone: true,
  templateUrl: './workspace.page.html',
  styleUrls: ['./workspace.page.scss'],
  providers: [AnnotationStore],
  imports: [
    CommonModule,
    FormsModule,
    WorkspaceHeaderComponent,
    WorkspaceSidebarComponent,
    WorkspaceViewerComponent,
    WorkspaceFooterComponent,
    ShortcutsDialogComponent,
  ],
})
export class WorkspacePageComponent implements OnInit, AfterViewChecked, OnDestroy {
  pdfDoc: PDFDocumentProxy | null = null;
  readonly vm: WorkspacePageComponent;
  pageIndex = signal(1);
  scale = signal(1.5);
  cursorPdfCoords = signal<{ x: number; y: number } | null>(null);
  readonly pageThumbnails = signal<readonly PageThumbnail[]>([]);
  private thumbnailObjectUrls: string[] = [];
  private thumbnailGenerationToken = 0;
  preview = signal<PreviewState>(null);
  editing = signal<EditState>(null);
  previewHexInput = signal('#000000');
  previewRgbInput = signal('rgb(0, 0, 0)');
  editHexInput = signal('#000000');
  editRgbInput = signal('rgb(0, 0, 0)');
  coordsTextModel = JSON.stringify({ pages: [] }, null, 2);
  jsonTreePreview: JsonTreePreview = this.buildJsonTreePreview(this.coordsTextModel);
  guidesFeatureEnabled = signal(false);
  advancedOptionsOpen = signal(false);
  includeAdvancedJsonFields = signal(false);
  private readonly fontDropdownState = signal<Record<EditorMode, FontDropdownUiState>>({
    preview: { open: false, query: '' },
    edit: { open: false, query: '' },
  });
  private pendingFontSearchFocus: EditorMode | null = null;
  guideSettings = signal<GuideSettings>(cloneGuideSettings(DEFAULT_GUIDE_SETTINGS));
  snapPointsXText = signal('');
  snapPointsYText = signal('');
  fileDropActive = signal(false);
  readonly jsonViewMode = signal<JsonViewMode>('text');
  readonly jsonPanelCollapsed = signal(false);
  readonly sidebarMinimized = signal(false);
  readonly sidebarTab = signal<SidebarTab>('document');
  readonly annotationCount = computed(() =>
    this.store.coords().reduce((total, page) => total + page.fields.length, 0)
  );
  readonly shortcutsOpen = signal(false);
  private readonly translationService = inject(TranslationService);
  private readonly document = inject(DOCUMENT);
  private readonly templatesService = inject(AnnotationTemplatesService);
  private readonly metadataService = inject(AppMetadataService);
  private readonly pendingFileService = inject(PendingFileService);
  private readonly pdfExportService = inject(PdfExportService);
  private readonly toast = inject(ToastService);
  private readonly sessionStore = inject(SessionStoreService);
  private readonly store = inject(AnnotationStore);
  private readonly annotationImport = inject(AnnotationImportService);
  private readonly fontCatalog = inject(FontCatalogService);
  readonly coords = this.store.coords;
  readonly customFontsFeatureEnabled = this.fontCatalog.customFontsFeatureEnabled;
  readonly customFonts = this.fontCatalog.customFonts;
  readonly fontOptions = this.fontCatalog.fontOptions;
  readonly templates = signal<AnnotationTemplate[]>([]);
  readonly defaultTemplateId = this.templatesService.defaultTemplateId;
  templateNameModel = '';
  selectedTemplateId: string | null = null;
  readonly version = APP_VERSION;
  readonly appName = APP_NAME;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();
  readonly defaultFontId = DEFAULT_FONT_ID;
  private readonly coordsFileInputChangeHandler = (event: Event) =>
    this.onCoordsFileSelected(event);
  private coordsFileInputFallback: HTMLInputElement | null = null;
  private autoApplyCoordsTimer: ReturnType<typeof setTimeout> | null = null;

  private dragInfo: {
    pageIndex: number;
    fieldIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    fontSize: number;
    width: number;
    moved: boolean;
  } | null = null;
  private draggingElement: HTMLDivElement | null = null;
  /** Original file of the open PDF, kept so the session can be saved and restored. */
  private sessionFile: File | null = null;
  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pdfByteSources = new Map<string, { bytes: Uint8Array; weight: number }>();
  private overlayDragRect: { left: number; top: number; width: number; height: number } | null =
    null;
  private overlayGuides: OverlayGuide[] = [];
  private clipboard: PageField | null = null;

  /** Annotations picked with Shift/Ctrl+click or Ctrl+A. Always on one page, never locked. */
  readonly selection = signal<{ pageIndex: number; fields: readonly number[] } | null>(null);
  readonly selectionCount = computed(() => this.selection()?.fields.length ?? 0);
  private selectionClipboard: PageField[] = [];
  private groupDrag: {
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    dx: number;
    dy: number;
    items: { el: HTMLElement; startLeft: number; startTop: number; width: number; fontPx: number }[];
  } | null = null;

  @ViewChild(WorkspaceHeaderComponent) private headerComponent?: WorkspaceHeaderComponent;
  @ViewChild(WorkspaceSidebarComponent) private sidebarComponent?: WorkspaceSidebarComponent;
  @ViewChild(WorkspaceViewerComponent) private viewerComponent?: WorkspaceViewerComponent;

  get pdfCanvasRef(): ElementRef<HTMLCanvasElement> | undefined {
    return this.viewerComponent?.pdfCanvasRef;
  }

  get overlayCanvasRef(): ElementRef<HTMLCanvasElement> | undefined {
    return this.viewerComponent?.overlayCanvasRef;
  }

  get annotationsLayerRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.annotationsLayerRef;
  }

  get pdfViewerRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.pdfViewerRef;
  }

  get previewEditorRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.previewEditorRef;
  }

  get editEditorRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.editEditorRef;
  }

  get previewFontDropdownRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.previewFontDropdownRef;
  }

  get editFontDropdownRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.editFontDropdownRef;
  }

  toggleJsonPanelCollapsed(): void {
    this.jsonPanelCollapsed.update((current) => !current);
  }

  setJsonPanelCollapsed(collapsed: boolean): void {
    this.jsonPanelCollapsed.set(collapsed);
  }

  setSidebarTab(tab: SidebarTab): void {
    this.sidebarTab.set(tab);
  }

  /** Arrow keys / Home / End move between tabs, as in the WAI-ARIA tabs pattern. */
  onSidebarTabKeydown(event: KeyboardEvent): void {
    const index = SIDEBAR_TABS.indexOf(this.sidebarTab());
    let next = index;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % SIDEBAR_TABS.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + SIDEBAR_TABS.length) % SIDEBAR_TABS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = SIDEBAR_TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.setSidebarTab(SIDEBAR_TABS[next]);
    this.runAfterRender(() =>
      this.document?.getElementById(`sidebar-tab-${SIDEBAR_TABS[next]}`)?.focus()
    );
  }

  toggleSidebarMinimized(): void {
    this.sidebarMinimized.update((current) => !current);
  }

  setSidebarMinimized(minimized: boolean): void {
    this.sidebarMinimized.set(minimized);
  }

  get previewFontSearchRef(): ElementRef<HTMLInputElement> | undefined {
    return this.viewerComponent?.previewFontSearchRef;
  }

  get editFontSearchRef(): ElementRef<HTMLInputElement> | undefined {
    return this.viewerComponent?.editFontSearchRef;
  }

  get pdfFileInputRef(): ElementRef<HTMLInputElement> | undefined {
    return this.sidebarComponent?.pdfFileInputRef;
  }

  get coordsFileInputRef(): ElementRef<HTMLInputElement> | undefined {
    return this.headerComponent?.coordsFileInputRef;
  }

  get customFontInputRef(): ElementRef<HTMLInputElement> | undefined {
    return this.sidebarComponent?.customFontInputRef;
  }

  get jsonEditorRef(): ElementRef<HTMLTextAreaElement> | undefined {
    return this.sidebarComponent?.jsonEditorRef;
  }

  get jsonTreeComponent() {
    return this.sidebarComponent?.jsonTreeComponent;
  }



  constructor() {
    this.store.setFieldComparator((a, b) => this.areFieldsEqual(a, b));
    effect(() => {
      this.store.coords();
      this.pageIndex();
      this.scale();
      untracked(() => this.scheduleSessionSave());
    });
    this.vm = this;
    this.setDocumentMetadata();
    const storedTemplates = this.templatesService.getTemplates();
    this.templates.set(storedTemplates);

    const initialTemplate =
      storedTemplates.find((template) => template.id === this.templatesService.defaultTemplateId) ??
      storedTemplates[0] ??
      null;

    this.selectedTemplateId = initialTemplate?.id ?? null;

    if (initialTemplate) {
      this.applyTemplate(initialTemplate);
    } else {
      this.syncCoordsTextModel();
    }
  }

  ngOnInit(): void {
    const pendingFile = this.pendingFileService.consumePendingFile();
    const pendingRestore = this.pendingFileService.consumePendingRestore();
    if (pendingFile) {
      this.loadPdfFile(pendingFile, pendingRestore).catch((error) =>
        console.error('No se pudo cargar el PDF pendiente.', error)
      );
    }
  }

  ngOnDestroy() {
    this.revokeThumbnailUrls();
    if (this.autoApplyCoordsTimer) {
      clearTimeout(this.autoApplyCoordsTimer);
      this.autoApplyCoordsTimer = null;
    }
    this.flushSessionSave();
    if (!this.document) {
      return;
    }
    if (this.coordsFileInputFallback) {
      this.coordsFileInputFallback.removeEventListener('change', this.coordsFileInputChangeHandler);
      if (this.coordsFileInputFallback.parentElement) {
        this.coordsFileInputFallback.parentElement.removeChild(this.coordsFileInputFallback);
      }
      this.coordsFileInputFallback = null;
    }
  }

  setFieldFont(mode: EditorMode, fontId: string) {
    if (mode === 'edit') {
      const editState = this.editing();
      if (editState?.field.locked) {
        return;
      }
    }
    const normalized = this.fontCatalog.normalizeFontFamily(fontId);
    this.updateWorkingField(mode, (field) =>
      this.ensureFieldStyle({ ...field, fontFamily: normalized })
    );
    this.redrawAllForPage();
  }

  fontDropdownOpen(mode: EditorMode): boolean {
    return this.fontDropdownState()[mode].open;
  }

  toggleFontDropdown(mode: EditorMode) {
    if (mode === 'edit') {
      const editState = this.editing();
      if (editState?.field.locked) {
        return;
      }
    }
    let opened = false;
    this.fontDropdownState.update((state) => {
      const nextOpen = !state[mode].open;
      opened = nextOpen;
      const nextState: Record<EditorMode, FontDropdownUiState> = {
        ...state,
        [mode]: { open: nextOpen, query: nextOpen ? '' : '' },
      };

      if (nextOpen) {
        const other: EditorMode = mode === 'preview' ? 'edit' : 'preview';
        if (state[other].open) {
          nextState[other] = { open: false, query: '' };
        }
      }

      return nextState;
    });

    if (opened) {
      this.scheduleFontSearchFocus(mode);
    } else if (this.pendingFontSearchFocus === mode) {
      this.pendingFontSearchFocus = null;
    }
  }

  private scheduleFontSearchFocus(mode: EditorMode) {
    this.pendingFontSearchFocus = mode;
    if (this.focusFontSearch(mode)) {
      this.pendingFontSearchFocus = null;
      return;
    }

    this.runAfterRender(() => {
      if (this.pendingFontSearchFocus === mode && this.focusFontSearch(mode)) {
        this.pendingFontSearchFocus = null;
      }
    });
  }

  private focusFontSearch(mode: EditorMode): boolean {
    const ref = mode === 'preview' ? this.previewFontSearchRef : this.editFontSearchRef;
    const input = ref?.nativeElement ?? null;

    if (!input) {
      return false;
    }

    const activeElement = this.document?.activeElement as Element | null;
    if (activeElement !== input) {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    }

    if (typeof input.setSelectionRange === 'function') {
      const length = input.value.length;
      input.setSelectionRange(length, length);
    }

    return this.document?.activeElement === input;
  }

  closeFontDropdown(mode: EditorMode) {
    this.fontDropdownState.update((state) => {
      if (!state[mode].open && !state[mode].query) {
        return state;
      }

      return {
        ...state,
        [mode]: { open: false, query: '' },
      };
    });

    if (this.pendingFontSearchFocus === mode) {
      this.pendingFontSearchFocus = null;
    }
  }

  fontSearchQuery(mode: EditorMode): string {
    return this.fontDropdownState()[mode].query;
  }

  onFontSearch(mode: EditorMode, value: string) {
    const query = typeof value === 'string' ? value : '';
    this.fontDropdownState.update((state) => ({
      ...state,
      [mode]: { ...state[mode], query },
    }));
  }

  filteredFontOptions(mode: EditorMode): FontOption[] {
    const query = this.fontDropdownState()[mode].query.trim().toLowerCase();
    const options = this.fontOptions();
    if (!query) {
      return [...options];
    }
    return options.filter((option) => option.label.toLowerCase().includes(query));
  }

  chooseFontOption(mode: EditorMode, fontId: string) {
    this.setFieldFont(mode, fontId);
    this.closeFontDropdown(mode);
  }

  fontSummaryOption(fontId: string | null | undefined): FontOption {
    return this.fontCatalog.getFontOptionById(this.fontCatalog.normalizeFontFamily(fontId));
  }

  setFieldOpacity(mode: EditorMode, value: string | number) {
    if (mode === 'edit') {
      const editState = this.editing();
      if (editState?.field.locked) {
        return;
      }
    }
    const normalized = this.normalizeOpacityValue(value);
    this.updateWorkingField(mode, (field) =>
      this.ensureFieldStyle({
        ...field,
        opacity:
          normalized ?? (typeof field.opacity === 'number' ? field.opacity : DEFAULT_OPACITY),
      })
    );
    this.redrawAllForPage();
  }

  setFieldBackground(mode: EditorMode, value: string) {
    if (mode === 'edit') {
      const editState = this.editing();
      if (editState?.field.locked) {
        return;
      }
    }
    const normalized = this.normalizeBackgroundColor(value);
    if (!normalized) {
      this.clearFieldBackground(mode);
      return;
    }
    this.updateWorkingField(mode, (field) =>
      this.ensureFieldStyle({ ...field, backgroundColor: normalized })
    );
    this.redrawAllForPage();
  }

  clearFieldBackground(mode: EditorMode) {
    if (mode === 'edit') {
      const editState = this.editing();
      if (editState?.field.locked) {
        return;
      }
    }
    this.updateWorkingField(mode, (field) =>
      this.ensureFieldStyle({ ...field, backgroundColor: null })
    );
    this.redrawAllForPage();
  }

  triggerCustomFontPicker() {
    if (typeof FontFace === 'undefined') {
      this.toast.error(this.translationService.translate('fonts.custom.unsupported'));
      return;
    }
    const input = this.customFontInputRef?.nativeElement;
    if (input) {
      input.click();
    }
  }

  async onCustomFontSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (!files.length) {
      return;
    }

    for (const file of files) {
      await this.registerCustomFont(file);
    }

    if (input) {
      input.value = '';
    }

    this.redrawAllForPage();
  }

  removeCustomFont(id: string) {
    const optionId = this.fontCatalog.toCustomFontOptionId(id);
    const previousFonts = this.customFonts();
    if (!previousFonts.some((font) => font.id === id)) {
      return;
    }

    this.customFonts.set(previousFonts.filter((font) => font.id !== id));
    this.handleRemovedFontOptions([optionId]);
  }

  canUndo() {
    return this.store.canUndo();
  }

  canRedo() {
    return this.store.canRedo();
  }

  undo() {
    if (!this.store.undo()) {
      return;
    }
    this.afterHistoryJump();
  }

  redo() {
    if (!this.store.redo()) {
      return;
    }
    this.afterHistoryJump();
  }

  private afterHistoryJump() {
    this.selection.set(null);
    this.preview.set(null);
    this.editing.set(null);
    this.syncCoordsTextModel();
    this.redrawAllForPage();
  }

  onLanguageChange(language: Language) {
    this.translationService.setLanguage(language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  toggleGuidesFeature(enabled: boolean) {
    if (enabled) {
      this.dismissEditors();
      this.guidesFeatureEnabled.set(true);
      this.advancedOptionsOpen.set(true);
      this.refreshOverlay();
      return;
    }

    this.guidesFeatureEnabled.set(false);
    this.overlayDragRect = null;
    this.overlayGuides = [];
    this.refreshOverlay(null, []);
  }

  toggleAdvancedOptions(open: boolean) {
    if (open) {
      this.dismissEditors();
    }
    this.advancedOptionsOpen.set(open);
  }

  toggleCustomFontsFeature(enabled: boolean) {
    if (enabled) {
      this.dismissEditors();
      this.customFontsFeatureEnabled.set(true);
      this.advancedOptionsOpen.set(true);
      return;
    }

    const removedFonts = this.customFonts();
    const removedOptionIds = removedFonts.map((font) => this.fontCatalog.toCustomFontOptionId(font.id));
    this.customFontsFeatureEnabled.set(false);
    if (removedOptionIds.length) {
      this.handleRemovedFontOptions(removedOptionIds);
      this.customFonts.set([]);
    } else {
      this.redrawAllForPage();
    }
  }

  toggleGuideSetting(
    key:
      | 'showGrid'
      | 'showRulers'
      | 'showAlignment'
      | 'snapToGrid'
      | 'snapToMargins'
      | 'snapToCenters'
      | 'snapToCustom',
    checked: boolean
  ) {
    this.guideSettings.update((settings) => ({ ...settings, [key]: checked }));
    this.refreshOverlay();
  }

  setCoordinateMode(mode: 'canvas' | 'pdf') {
    const usePdfCoordinates = mode === 'pdf';
    const currentSettings = this.guideSettings();
    if (currentSettings.usePdfCoordinates === usePdfCoordinates) {
      return;
    }

    let nextSnapPointsY = [...currentSettings.snapPointsY];
    let nextSnapText = this.snapPointsYText();
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (canvas && canvas.height > 0) {
      const scale = this.scale();
      const pdfHeight = canvas.height / scale;
      if (pdfHeight > 0) {
        nextSnapPointsY = currentSettings.snapPointsY.map((value) => {
          const clamped = Math.max(0, Math.min(value, pdfHeight));
          const converted = pdfHeight - clamped;
          return +converted.toFixed(2);
        });
        nextSnapPointsY.sort((a, b) => a - b);
        nextSnapText = nextSnapPointsY.join(', ');
      }
    }

    this.guideSettings.update((settings) => ({
      ...settings,
      usePdfCoordinates,
      snapPointsY: nextSnapPointsY,
    }));
    this.snapPointsYText.set(nextSnapText);
    this.refreshOverlay();
  }

  updateGuideNumber(key: 'gridSize' | 'marginSize' | 'snapTolerance', rawValue: string | number) {
    const numeric = toFiniteNumber(rawValue);
    if (numeric === null) {
      return;
    }
    const sanitized =
      key === 'snapTolerance' ? Math.max(0, Math.round(numeric)) : Math.max(0.1, numeric);
    this.guideSettings.update((settings) => ({ ...settings, [key]: sanitized }));
    this.refreshOverlay();
  }

  onSnapPointsInput(axis: 'x' | 'y', rawValue: string) {
    const parsed = this.parseNumericList(rawValue);
    if (axis === 'x') {
      this.snapPointsXText.set(rawValue);
      this.guideSettings.update((settings) => ({ ...settings, snapPointsX: parsed }));
    } else {
      this.snapPointsYText.set(rawValue);
      this.guideSettings.update((settings) => ({ ...settings, snapPointsY: parsed }));
    }
    this.refreshOverlay();
  }

  private setDocumentMetadata() {
    this.metadataService.applyDefaultMetadata();
  }

  private parseNumericList(value: string): number[] {
    return value
      .split(/[\s,;]+/)
      .map((token) => toFiniteNumber(token))
      .filter((num): num is number => num !== null && num >= 0)
      .map((num) => +num.toFixed(2))
      .filter((num, index, arr) => arr.indexOf(num) === index)
      .sort((a, b) => a - b);
  }

  private refreshOverlay(
    activeRect?: { left: number; top: number; width: number; height: number } | null,
    guides?: OverlayGuide[]
  ) {
    if (activeRect !== undefined) {
      this.overlayDragRect = activeRect;
    }
    if (guides !== undefined) {
      this.overlayGuides = guides ?? [];
    }

    const overlay = this.overlayCanvasRef?.nativeElement;
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!overlay || !pdfCanvas) {
      return;
    }

    overlay.width = pdfCanvas.width;
    overlay.height = pdfCanvas.height;

    const ctx = overlay.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!this.guidesFeatureEnabled()) {
      return;
    }

    const settings = this.guideSettings();
    const scale = this.scale();

    this.drawGrid(ctx, settings, overlay.width, overlay.height, scale);
    this.drawRulers(ctx, settings, overlay.width, overlay.height, scale);
    this.drawStaticGuides(ctx, settings, overlay.width, overlay.height, scale);

    if (this.overlayDragRect) {
      this.drawActiveGuides(ctx, overlay.width, overlay.height, settings.showAlignment);
    }
  }

  private projectYPoint(point: number, height: number, scale: number, usePdfCoordinates: boolean) {
    const pdfHeight = height / scale;
    const clamped = Math.max(0, Math.min(point, pdfHeight));
    if (usePdfCoordinates) {
      return height - clamped * scale;
    }
    return clamped * scale;
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    settings: GuideSettings,
    width: number,
    height: number,
    scale: number
  ) {
    if (!settings.showGrid) {
      return;
    }

    const spacingPx = Math.max(settings.gridSize, 0.1) * scale;
    if (spacingPx < 4) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.09)';
    ctx.lineWidth = 1;

    for (let x = spacingPx; x < width; x += spacingPx) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }

    for (let y = spacingPx; y < height; y += spacingPx) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawRulers(
    ctx: CanvasRenderingContext2D,
    settings: GuideSettings,
    width: number,
    height: number,
    scale: number
  ) {
    if (!settings.showRulers) {
      return;
    }

    const rulerSize = 22;
    const majorStep = Math.max(50 * scale, 40);
    const minorStep = Math.max(10 * scale, 8);
    const usePdfCoordinates = settings.usePdfCoordinates;
    const pdfHeight = height / scale;
    const formatValue = (value: number) => (Math.round(value * 10) / 10).toString();

    ctx.save();

    ctx.fillStyle = 'rgba(10, 10, 18, 0.55)';
    ctx.fillRect(0, 0, width, rulerSize);
    ctx.fillRect(0, 0, rulerSize, height);

    ctx.strokeStyle = 'rgba(94, 234, 212, 0.35)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += minorStep) {
      const isMajor = Math.abs(x % majorStep) < 1e-6;
      const tickHeight = isMajor ? rulerSize : rulerSize * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, tickHeight);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += minorStep) {
      const isMajor = Math.abs(y % majorStep) < 1e-6;
      const tickWidth = isMajor ? rulerSize : rulerSize * 0.6;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(tickWidth, Math.round(y) + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(245, 245, 245, 0.7)';
    ctx.font = '10px "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';

    for (let x = majorStep; x < width; x += majorStep) {
      const value = x / scale;
      ctx.fillText(formatValue(value), x + 4, 4);
    }

    ctx.save();
    ctx.rotate(-Math.PI / 2);
    for (let y = majorStep; y < height; y += majorStep) {
      const rawUnits = usePdfCoordinates ? (height - y) / scale : y / scale;
      ctx.fillText(formatValue(rawUnits), -y - 24, 4);
    }
    ctx.fillText(formatValue(usePdfCoordinates ? pdfHeight : 0), -24, 4);
    ctx.fillText(formatValue(usePdfCoordinates ? 0 : pdfHeight), -height - 24, 4);
    ctx.restore();

    ctx.restore();
  }

  private drawStaticGuides(
    ctx: CanvasRenderingContext2D,
    settings: GuideSettings,
    width: number,
    height: number,
    scale: number
  ) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.25)';

    if (settings.snapToMargins) {
      const marginPx = Math.max(settings.marginSize, 0) * scale;
      if (marginPx > 0 && marginPx < width) {
        ctx.beginPath();
        ctx.moveTo(Math.round(marginPx) + 0.5, 0);
        ctx.lineTo(Math.round(marginPx) + 0.5, height);
        ctx.moveTo(Math.round(width - marginPx) + 0.5, 0);
        ctx.lineTo(Math.round(width - marginPx) + 0.5, height);
        ctx.stroke();
      }

      if (marginPx > 0 && marginPx < height) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round(marginPx) + 0.5);
        ctx.lineTo(width, Math.round(marginPx) + 0.5);
        ctx.moveTo(0, Math.round(height - marginPx) + 0.5);
        ctx.lineTo(width, Math.round(height - marginPx) + 0.5);
        ctx.stroke();
      }
    }

    if (settings.snapToCenters) {
      const centerX = width / 2;
      const centerY = height / 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(centerX) + 0.5, 0);
      ctx.lineTo(Math.round(centerX) + 0.5, height);
      ctx.moveTo(0, Math.round(centerY) + 0.5);
      ctx.lineTo(width, Math.round(centerY) + 0.5);
      ctx.stroke();
    }

    if (settings.snapToCustom) {
      settings.snapPointsX.forEach((point) => {
        const linePx = point * scale;
        if (linePx >= 0 && linePx <= width) {
          ctx.beginPath();
          ctx.moveTo(Math.round(linePx) + 0.5, 0);
          ctx.lineTo(Math.round(linePx) + 0.5, height);
          ctx.stroke();
        }
      });

      settings.snapPointsY.forEach((point) => {
        const linePx = this.projectYPoint(point, height, scale, settings.usePdfCoordinates);
        if (linePx >= 0 && linePx <= height) {
          ctx.beginPath();
          ctx.moveTo(0, Math.round(linePx) + 0.5);
          ctx.lineTo(width, Math.round(linePx) + 0.5);
          ctx.stroke();
        }
      });
    }

    ctx.restore();
  }

  private drawActiveGuides(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    showAlignment: boolean
  ) {
    const rect = this.overlayDragRect;
    if (!rect) {
      return;
    }

    const guides = this.overlayGuides;

    ctx.save();
    ctx.lineWidth = 1;

    guides.forEach((guide) => {
      if (!showAlignment && !guide.highlighted) {
        return;
      }
      const color = guide.highlighted ? 'rgba(94, 234, 212, 0.85)' : 'rgba(94, 234, 212, 0.35)';
      ctx.strokeStyle = color;
      ctx.setLineDash(guide.highlighted ? [4, 4] : [8, 6]);
      if (guide.orientation === 'vertical') {
        const x = Math.min(Math.max(guide.position, 0), width);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
        ctx.stroke();
      } else {
        const y = Math.min(Math.max(guide.position, 0), height);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
        ctx.stroke();
      }
    });

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      Math.round(rect.left) + 0.5,
      Math.round(rect.top) + 0.5,
      rect.width,
      rect.height
    );
    ctx.restore();
  }

  private applySnapping(
    baseLeft: number,
    baseTop: number,
    bounds: { minLeft: number; maxLeft: number; minTop: number; maxTop: number },
    el: HTMLDivElement,
    pdfCanvas: HTMLCanvasElement,
    fontSizePx: number
  ): { left: number; top: number; guides: OverlayGuide[] } {
    if (!this.guidesFeatureEnabled()) {
      return { left: baseLeft, top: baseTop, guides: [] };
    }

    const settings = this.guideSettings();
    const tolerance = Math.max(settings.snapTolerance, 0);
    const scale = this.scale();
    const width = pdfCanvas.width;
    const height = pdfCanvas.height;
    const elementWidth = el.offsetWidth;
    const elementHeight = el.offsetHeight;
    const usePdfCoordinates = settings.usePdfCoordinates;
    const baselineOffset = Number.isFinite(fontSizePx) ? fontSizePx : 0;
    const pdfBaselineOffset = usePdfCoordinates ? baselineOffset : 0;

    type Candidate = { candidate: number; line: number; delta: number };

    const verticalCandidates: Candidate[] = [];
    const horizontalCandidates: Candidate[] = [];

    const pushVertical = (candidate: number, line: number) => {
      if (!Number.isFinite(candidate) || !Number.isFinite(line)) {
        return;
      }
      const clampedCandidate = Math.min(Math.max(candidate, bounds.minLeft), bounds.maxLeft);
      const clampedLine = Math.min(Math.max(line, 0), width);
      verticalCandidates.push({
        candidate: clampedCandidate,
        line: clampedLine,
        delta: Math.abs(clampedCandidate - baseLeft),
      });
    };

    const pushHorizontal = (candidate: number, line: number) => {
      if (!Number.isFinite(candidate) || !Number.isFinite(line)) {
        return;
      }
      const clampedCandidate = Math.min(Math.max(candidate, bounds.minTop), bounds.maxTop);
      const clampedLine = Math.min(Math.max(line, 0), height);
      horizontalCandidates.push({
        candidate: clampedCandidate,
        line: clampedLine,
        delta: Math.abs(clampedCandidate - baseTop),
      });
    };

    if (settings.snapToMargins) {
      const marginPx = Math.max(settings.marginSize, 0) * scale;
      if (marginPx > 0) {
        pushVertical(marginPx, marginPx);
        pushVertical(width - marginPx - elementWidth, width - marginPx);
        pushHorizontal(marginPx, marginPx);
        pushHorizontal(height - marginPx - elementHeight, height - marginPx);
      }
    }

    if (settings.snapToCenters) {
      const centerX = width / 2;
      const centerY = height / 2;
      pushVertical(centerX - elementWidth / 2, centerX);
      pushHorizontal(centerY - elementHeight / 2, centerY);
    }

    if (settings.snapToGrid) {
      const spacingPx = Math.max(settings.gridSize, 0.1) * scale;
      if (spacingPx >= 2) {
        const snappedLeft = Math.round(baseLeft / spacingPx) * spacingPx;
        const snappedTop = Math.round(baseTop / spacingPx) * spacingPx;
        pushVertical(snappedLeft, snappedLeft);
        pushHorizontal(snappedTop, snappedTop);
      }
    }

    if (settings.snapToCustom) {
      settings.snapPointsX.forEach((point) => {
        const linePx = point * scale;
        pushVertical(linePx, linePx);
      });
      settings.snapPointsY.forEach((point) => {
        const linePx = this.projectYPoint(point, height, scale, usePdfCoordinates);
        const candidateTop = linePx - pdfBaselineOffset;
        pushHorizontal(candidateTop, linePx);
      });
    }

    let snappedLeft = Math.min(Math.max(baseLeft, bounds.minLeft), bounds.maxLeft);
    let snappedTop = Math.min(Math.max(baseTop, bounds.minTop), bounds.maxTop);

    const bestVertical = verticalCandidates
      .filter((cand) => cand.delta <= tolerance)
      .sort((a, b) => a.delta - b.delta)[0];
    if (bestVertical) {
      snappedLeft = bestVertical.candidate;
    }

    const bestHorizontal = horizontalCandidates
      .filter((cand) => cand.delta <= tolerance)
      .sort((a, b) => a.delta - b.delta)[0];
    if (bestHorizontal) {
      snappedTop = bestHorizontal.candidate;
    }

    const guideMap = new Map<string, OverlayGuide>();
    const includeGuide = (
      orientation: 'vertical' | 'horizontal',
      cand: Candidate,
      highlighted: boolean
    ) => {
      const key = `${orientation}-${cand.line.toFixed(2)}`;
      const existing = guideMap.get(key);
      if (existing && existing.highlighted) {
        return;
      }
      if (!highlighted && !settings.showAlignment) {
        return;
      }
      if (!highlighted && cand.delta > tolerance * 1.5) {
        return;
      }
      guideMap.set(key, {
        orientation,
        position: cand.line,
        highlighted,
      });
    };

    verticalCandidates.forEach((cand) => {
      const highlighted = !!bestVertical && Math.abs(cand.candidate - bestVertical.candidate) < 0.5;
      includeGuide('vertical', cand, highlighted);
    });

    horizontalCandidates.forEach((cand) => {
      const highlighted =
        !!bestHorizontal && Math.abs(cand.candidate - bestHorizontal.candidate) < 0.5;
      includeGuide('horizontal', cand, highlighted);
    });

    return { left: snappedLeft, top: snappedTop, guides: Array.from(guideMap.values()) };
  }

  ngAfterViewChecked() {
    if (this.pendingFontSearchFocus) {
      if (this.focusFontSearch(this.pendingFontSearchFocus)) {
        this.pendingFontSearchFocus = null;
      }
    }

    if (this.preview()) {
      this.focusEditorIfNeeded(this.previewEditorRef?.nativeElement ?? null);
      return;
    }

    if (this.editing()) {
      this.focusEditorIfNeeded(this.editEditorRef?.nativeElement ?? null);
    }
  }

  private focusEditorIfNeeded(editorEl: HTMLElement | null) {
    if (!editorEl) {
      return;
    }

    const activeElement = this.document?.activeElement as HTMLElement | null;
    if (activeElement && editorEl.contains(activeElement)) {
      return;
    }

    const focusTarget = editorEl.querySelector<HTMLElement>('input, select, textarea, button');
    focusTarget?.focus();
  }

  onEditorKeydown(event: KeyboardEvent, mode: 'preview' | 'edit') {
    const triggerAction = (action: 'confirm' | 'cancel') => {
      event.preventDefault();
      this.invokeEditorAction(mode, action);
    };

    switch (event.key) {
      case 'Enter':
        triggerAction('confirm');
        break;
      case 'Escape':
        triggerAction('cancel');
        break;
      default:
        break;
    }
  }

  private invokeEditorAction(mode: 'preview' | 'edit', action: 'confirm' | 'cancel') {
    if (mode === 'preview') {
      action === 'confirm' ? this.confirmPreview() : this.cancelPreview();
    } else {
      action === 'confirm' ? this.confirmEdit() : this.cancelEdit();
    }
  }

  get pageCount() {
    return this.pdfDoc?.numPages ?? 0;
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.loadPdfFile(file);
    } finally {
      input.value = '';
    }
  }

  openPdfFilePicker() {
    this.fileDropActive.set(false);
    const input = this.pdfFileInputRef?.nativeElement;
    if (!input) {
      return;
    }

    input.value = '';
    input.click();
  }

  onFileUploadKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') {
      return;
    }
    event.preventDefault();
    this.openPdfFilePicker();
  }

  onFileDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.fileDropActive.set(true);
  }

  onFileDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node) {
      if (event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
    }
    this.fileDropActive.set(false);
  }

  async onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.fileDropActive.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    await this.loadPdfFile(file);
  }

  /** Re-applies annotations, page and zoom saved by a previous visit (treated as untrusted input). */
  private applyRestoredSession(restore: PendingRestore) {
    const normalized = this.annotationImport.normalizeImportedCoordinates(
      { pages: restore.coords },
      (field) => this.prepareFieldForStorage(field)
    );
    if (normalized === null) {
      this.toast.error(this.translationService.translate('toast.sessionRestoreFailed'));
      return;
    }

    this.replaceCoords(normalized, { skipHistory: true });
    if (Number.isFinite(restore.scale) && restore.scale >= 0.25 && restore.scale <= 8) {
      this.scale.set(restore.scale);
    }
    const lastPage = this.pdfDoc?.numPages ?? 1;
    this.pageIndex.set(Math.min(lastPage, Math.max(1, Math.round(restore.pageIndex) || 1)));
  }

  private scheduleSessionSave() {
    if (this.sessionSaveTimer) {
      clearTimeout(this.sessionSaveTimer);
      this.sessionSaveTimer = null;
    }

    const file = this.sessionFile;
    if (!file || !this.pdfDoc || typeof window === 'undefined') {
      return;
    }

    const hasAnnotations = this.store.coords().length > 0;
    if (!hasAnnotations && !this.store.canUndo()) {
      return; // nothing worth keeping yet: do not overwrite a previous session
    }

    this.sessionSaveTimer = setTimeout(() => {
      this.sessionSaveTimer = null;
      this.persistSession(file);
    }, SESSION_SAVE_DELAY_MS);
  }

  private persistSession(file: File) {
    if (!this.store.coords().length) {
      void this.sessionStore.clear();
      return;
    }
    void this.sessionStore.save({
      name: file.name,
      pdf: file,
      coords: this.store.snapshot(),
      pageIndex: this.pageIndex(),
      scale: this.scale(),
      savedAt: Date.now(),
    });
  }

  /** Writes a pending save right away (page closing or leaving the workspace). */
  @HostListener('window:pagehide')
  flushSessionSave() {
    if (!this.sessionSaveTimer) {
      return;
    }
    clearTimeout(this.sessionSaveTimer);
    this.sessionSaveTimer = null;
    if (this.sessionFile) {
      this.persistSession(this.sessionFile);
    }
  }

  private async loadPdfFile(file: File, restore: PendingRestore | null = null) {
    if (!isPdfFile(file)) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.pdfByteSources.clear();
    this.sessionFile = file;
    const buf = await file.arrayBuffer();
    const typed = new Uint8Array(buf);
    this.rememberPdfBytes(typed, 0);

    const loadingTask = pdfjsLib.getDocument({ data: typed });
    const loadedPdf = await loadingTask.promise;
    this.pdfDoc = loadedPdf;
    this.cursorPdfCoords.set(null);

    try {
      const canonicalData = await loadedPdf.getData();
      this.rememberPdfBytes(canonicalData, 1);
    } catch (error) {
      console.warn('No se pudo obtener una copia canonizada del PDF cargado.', error);
    }

    if (typeof loadedPdf.saveDocument === 'function') {
      try {
        const sanitizedData = await loadedPdf.saveDocument();
        const typedSanitized =
          sanitizedData instanceof Uint8Array ? sanitizedData : new Uint8Array(sanitizedData);
        this.rememberPdfBytes(typedSanitized, 2);
      } catch (error) {
        console.warn('No se pudo sanear el PDF cargado.', error);
      }
    }

    this.pageIndex.set(1);
    this.resetHistory();
    this.clearAll({ skipHistory: true });
    if (restore) {
      this.applyRestoredSession(restore);
    }
    await this.render();
    if (restore) {
      this.redrawAllForPage();
    } else if (typeof window !== 'undefined' && window.innerWidth < 960) {
      await this.fitWidth();
    }
    this.generatePageThumbnails().catch((error) =>
      console.error('No se pudieron generar las miniaturas del documento.', error)
    );
    this.fileDropActive.set(false);
  }

  private rendering = false;
  private renderRequestedWhileBusy = false;

  /**
   * Draws the current page. pdf.js cannot render twice on the same canvas at once, so calls that
   * arrive mid-render (e.g. a held zoom key) are coalesced into one more pass with the latest
   * scale/page, and the annotations are repainted afterwards.
   */
  async render() {
    if (this.rendering) {
      this.renderRequestedWhileBusy = true;
      return;
    }

    this.rendering = true;
    let coalesced = false;
    try {
      do {
        this.renderRequestedWhileBusy = false;
        await this.renderOnce();
        coalesced = coalesced || this.renderRequestedWhileBusy;
      } while (this.renderRequestedWhileBusy);
    } finally {
      this.rendering = false;
    }

    if (coalesced) {
      this.redrawAllForPage();
    }
  }

  private async renderOnce() {
    if (!this.pdfDoc) {
      return;
    }

    const page: PDFPageProxy = await this.pdfDoc.getPage(this.pageIndex());
    const viewport = page.getViewport({ scale: this.scale() });

    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    this.refreshOverlay();
  }

  private revokeThumbnailUrls() {
    for (const url of this.thumbnailObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.thumbnailObjectUrls = [];
  }

  private computeThumbnailScale(pageWidth: number) {
    if (!Number.isFinite(pageWidth) || pageWidth <= 0) {
      return 0.25;
    }

    const targetWidth = 120;
    const rawScale = targetWidth / pageWidth;
    return Math.min(1, Math.max(rawScale, 0.15));
  }

  private async generatePageThumbnails() {
    const doc = this.pdfDoc;
    this.thumbnailGenerationToken += 1;
    const generationToken = this.thumbnailGenerationToken;

    this.pageThumbnails.set([]);
    this.revokeThumbnailUrls();

    if (!doc) {
      return;
    }

    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('OffscreenCanvas no está disponible; se omite la generación de miniaturas.');
      return;
    }

    const thumbnails: PageThumbnail[] = [];
    const objectUrls: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        if (generationToken !== this.thumbnailGenerationToken) {
          objectUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        const page = await doc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: this.computeThumbnailScale(baseViewport.width) });
        const width = Math.max(1, Math.round(viewport.width));
        const height = Math.max(1, Math.round(viewport.height));

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
          if (typeof page.cleanup === 'function') {
            page.cleanup();
          }
          continue;
        }

        ctx.clearRect(0, 0, width, height);

        await page
          .render({
            canvasContext: ctx as unknown as CanvasRenderingContext2D,
            canvas: null,
            viewport,
          })
          .promise;

        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const url = URL.createObjectURL(blob);

        objectUrls.push(url);
        thumbnails.push({
          pageNumber,
          imageUrl: url,
          width,
          height,
        });

        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }
    } catch (error) {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      throw error;
    }

    if (generationToken !== this.thumbnailGenerationToken) {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      return;
    }

    this.thumbnailObjectUrls = objectUrls;
    this.pageThumbnails.set(thumbnails);
  }

  private domToPdfCoords(evt: MouseEvent) {
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const xPx = evt.clientX - rect.left;
    const yPx = evt.clientY - rect.top;
    const scale = this.scale();
    return { x: +(xPx / scale).toFixed(2), y: +((canvas.height - yPx) / scale).toFixed(2) };
  }

  onViewerMouseMove(evt: MouseEvent) {
    if (!this.pdfDoc) {
      this.cursorPdfCoords.set(null);
      return;
    }

    const coords = this.domToPdfCoords(evt);
    this.cursorPdfCoords.set(coords);
  }

  onViewerMouseLeave() {
    this.cursorPdfCoords.set(null);
  }

  onHitboxClick(evt: MouseEvent) {
    if (!this.pdfDoc || this.editing()) return;
    this.clearSelection();
    const pt = this.domToPdfCoords(evt);
    if (!pt) return;

    const defaultColor = '#000000';
    const baseField: PageField = {
      x: pt.x,
      y: pt.y,
      mapField: '',
      fontSize: 14,
      color: defaultColor,
      type: 'text',
      value: '',
      appender: '',
      decimals: null,
      fontFamily: DEFAULT_FONT_ID,
      opacity: DEFAULT_OPACITY,
      backgroundColor: null,
      locked: false,
      hidden: false,
    };
    const styledField = this.ensureFieldStyle(baseField);
    this.preview.set({
      page: this.pageIndex(),
      field: styledField,
    });
    this.updatePreviewColorState(defaultColor);
  }








  private updatePreviewColorState(color: string) {
    const hex = ensureHex(color);
    if (hex) {
      this.previewHexInput.set(hex);
      this.previewRgbInput.set(toRgbString(hex));
    } else {
      this.previewHexInput.set(color.trim());
      this.previewRgbInput.set(toRgbString(color));
    }
  }

  private updateEditingColorState(color: string) {
    const hex = ensureHex(color);
    if (hex) {
      this.editHexInput.set(hex);
      this.editRgbInput.set(toRgbString(hex));
    } else {
      this.editHexInput.set(color.trim());
      this.editRgbInput.set(toRgbString(color));
    }
  }

  setPreviewColorFromHex(value: string) {
    this.previewHexInput.set(value);
    const normalized = normalizeHexInput(value);
    if (!normalized) return;
    this.preview.update((p) => (p ? { ...p, field: { ...p.field, color: normalized } } : p));
    this.updatePreviewColorState(normalized);
  }

  setPreviewColorFromRgb(value: string) {
    this.previewRgbInput.set(value);
    const rgb = parseRgbText(value);
    if (!rgb) return;
    const hex = rgbToHex(rgb);
    this.preview.update((p) => (p ? { ...p, field: { ...p.field, color: hex } } : p));
    this.updatePreviewColorState(hex);
  }

  onPreviewColorPicker(value: string) {
    this.preview.update((p) => (p ? { ...p, field: { ...p.field, color: value } } : p));
    this.updatePreviewColorState(value);
  }

  setEditColorFromHex(value: string) {
    const editState = this.editing();
    if (editState?.field.locked) {
      return;
    }
    this.editHexInput.set(value);
    const normalized = normalizeHexInput(value);
    if (!normalized) return;
    this.editing.update((e) => {
      if (!e || e.field.locked) {
        return e;
      }
      return { ...e, field: { ...e.field, color: normalized } };
    });
    this.updateEditingColorState(normalized);
  }

  setEditColorFromRgb(value: string) {
    const editState = this.editing();
    if (editState?.field.locked) {
      return;
    }
    this.editRgbInput.set(value);
    const rgb = parseRgbText(value);
    if (!rgb) return;
    const hex = rgbToHex(rgb);
    this.editing.update((e) => {
      if (!e || e.field.locked) {
        return e;
      }
      return { ...e, field: { ...e.field, color: hex } };
    });
    this.updateEditingColorState(hex);
  }

  onEditColorPicker(value: string) {
    const editState = this.editing();
    if (editState?.field.locked) {
      return;
    }
    this.editing.update((e) => {
      if (!e || e.field.locked) {
        return e;
      }
      return { ...e, field: { ...e.field, color: value } };
    });
    this.updateEditingColorState(value);
  }

  confirmPreview() {
    const p = this.preview();
    if (!p || !this.fieldHasRenderableContent(p.field)) {
      this.preview.set(null);
      this.closeFontDropdown('preview');
      return;
    }
    const normalizedField = this.prepareFieldForStorage(p.field);
    if (
      this.applyCoordsChange(() =>
        this.coords.update((pages) => addFieldToPages(p.page, normalizedField, pages))
      )
    ) {
      this.syncCoordsTextModel();
      this.redrawAllForPage();
    }
    this.preview.set(null);
    this.closeFontDropdown('preview');
  }

  cancelPreview() {
    this.preview.set(null);
    this.closeFontDropdown('preview');
  }

  startEditing(pageIndex: number, fieldIndex: number, field: PageField) {
    if (this.selection()) {
      this.selection.set(null);
      this.redrawAllForPage();
    }
    const sanitized = this.prepareFieldForStorage(field);
    if (this.fieldRequiresStorageUpdate(field, sanitized)) {
      if (
        this.applyCoordsChange(() =>
          this.coords.update((pages) =>
            updateFieldInPages(pageIndex, fieldIndex, sanitized, pages)
          )
        )
      ) {
        this.syncCoordsTextModel();
        this.redrawAllForPage();
      }
    }
    const formField = this.prepareFieldForForm(sanitized);
    this.editing.set({ pageIndex, fieldIndex, field: formField });
    this.updateEditingColorState(formField.color);
    this.preview.set(null);
    this.focusJsonOnSelection(pageIndex, fieldIndex);
  }

  confirmEdit() {
    const e = this.editing();
    if (!e) return;
    if (!this.fieldHasRenderableContent(e.field)) {
      this.editing.set(null);
      this.closeFontDropdown('edit');
      return;
    }
    const normalized = this.prepareFieldForStorage(e.field);
    if (
      this.applyCoordsChange(() =>
        this.coords.update((pages) =>
          updateFieldInPages(e.pageIndex, e.fieldIndex, normalized, pages)
        )
      )
    ) {
      this.syncCoordsTextModel();
      this.redrawAllForPage();
    }
    this.editing.set(null);
    this.closeFontDropdown('edit');
  }

  cancelEdit() {
    this.editing.set(null);
    this.closeFontDropdown('edit');
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    const hasPrimaryModifier = event.ctrlKey || event.metaKey;

    if (!hasPrimaryModifier) {
      this.handlePlainShortcut(event, key);
      return;
    }

    if (key === 's') {
      event.preventDefault();
      this.applyCoordsText();
      return;
    }

    if (key === 'z' && !event.shiftKey) {
      if (this.canUndo()) {
        event.preventDefault();
        this.undo();
      }
      return;
    }

    if (key === 'y' || (key === 'z' && event.shiftKey)) {
      if (this.canRedo()) {
        event.preventDefault();
        this.redo();
      }
      return;
    }

    this.handleSelectionShortcut(event, key);
  }

  /** Ctrl/⌘+A, C, V and D work on the annotation selection (never while typing in a field). */
  private handleSelectionShortcut(event: KeyboardEvent, key: string) {
    if (!this.pdfDoc || this.isEditableElement(event.target) || this.preview() || this.editing()) {
      return;
    }

    switch (key) {
      case 'a':
        event.preventDefault();
        this.selectAllOnPage();
        break;
      case 'c':
        if (this.copySelection()) {
          event.preventDefault();
        }
        break;
      case 'v':
        if (this.selectionClipboard.length && this.pasteSelection()) {
          event.preventDefault();
        }
        break;
      case 'd':
        if (this.selection()) {
          event.preventDefault();
          this.duplicateSelection();
        }
        break;
      default:
        break;
    }
  }

  private handlePlainShortcut(event: KeyboardEvent, key: string) {
    if (event.altKey || event.defaultPrevented) {
      return;
    }

    if (key === 'escape' && this.shortcutsOpen()) {
      event.preventDefault();
      this.toggleShortcuts(false);
      return;
    }

    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      tag === 'BUTTON' ||
      target?.isContentEditable
    ) {
      return;
    }

    if (this.selection() && !this.preview() && !this.editing()) {
      const step = event.shiftKey ? 10 : 1;
      const nudges: Record<string, [number, number]> = {
        arrowleft: [-step, 0],
        arrowright: [step, 0],
        arrowup: [0, step],
        arrowdown: [0, -step],
      };
      if (key === 'escape') {
        event.preventDefault();
        this.clearSelection();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        event.preventDefault();
        this.deleteSelection();
        return;
      }
      if (nudges[key]) {
        event.preventDefault();
        this.moveSelection(nudges[key][0], nudges[key][1], 'nudge');
        return;
      }
    }

    const needsDocument = () => !!this.pdfDoc;
    switch (key) {
      case '?':
        event.preventDefault();
        this.toggleShortcuts();
        break;
      case 'arrowleft':
      case 'pageup':
        if (needsDocument()) {
          event.preventDefault();
          void this.prevPage();
        }
        break;
      case 'arrowright':
      case 'pagedown':
        if (needsDocument()) {
          event.preventDefault();
          void this.nextPage();
        }
        break;
      case 'home':
        if (needsDocument()) {
          event.preventDefault();
          void this.setPageIndex(1);
        }
        break;
      case 'end':
        if (needsDocument()) {
          event.preventDefault();
          void this.setPageIndex(this.pageCount);
        }
        break;
      case '+':
      case '=':
        if (needsDocument()) {
          event.preventDefault();
          void this.zoomIn();
        }
        break;
      case '-':
      case '_':
        if (needsDocument()) {
          event.preventDefault();
          void this.zoomOut();
        }
        break;
      case '0':
        if (needsDocument()) {
          event.preventDefault();
          void this.fitWidth();
        }
        break;
      case 'b':
        event.preventDefault();
        this.toggleSidebarMinimized();
        break;
      default:
        break;
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent) {
    const editState = this.editing();
    if (!editState) return;

    const modal = this.editEditorRef?.nativeElement;
    if (!modal) return;

    const target = event.target as Node | null;
    if (target && modal.contains(target)) {
      return;
    }

    this.cancelEdit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as Node | null;
    if (target) {
      this.handleFontDropdownOutsideClick(target);
    }

    if (!this.preview() && !this.editing()) {
      return;
    }

    const viewer = this.pdfViewerRef?.nativeElement;

    if (!viewer || !target) {
      return;
    }

    if (viewer.contains(target)) {
      return;
    }

    if (this.preview()) {
      this.cancelPreview();
    }

    if (this.editing()) {
      this.cancelEdit();
    }
  }

  deleteAnnotation() {
    const e = this.editing();
    if (!e) return;
    if (
      this.applyCoordsChange(() =>
        this.coords.update((pages) => removeFieldFromPages(e.pageIndex, e.fieldIndex, pages))
      )
    ) {
      this.syncCoordsTextModel();
      this.redrawAllForPage();
    }
    this.editing.set(null);
  }

  copyAnnotation(): boolean {
    const editState = this.editing();
    if (!editState) {
      return false;
    }

    const sanitized = this.prepareFieldForStorage(editState.field);
    this.clipboard = { ...sanitized };
    return true;
  }

  pasteAnnotation(targetPageNum?: number): boolean {
    if (!this.clipboard || !this.pdfDoc) {
      return false;
    }

    const pageNum = targetPageNum ?? this.pageIndex();
    const pdfCanvas = this.pdfCanvasRef?.nativeElement ?? null;
    const newField: PageField = { ...this.clipboard };

    if (pdfCanvas) {
      const scale = this.scale();
      const offset = this.roundToTwo(8 / scale);
      const maxX = this.roundToTwo(pdfCanvas.width / scale);
      const maxY = this.roundToTwo(pdfCanvas.height / scale);
      newField.x = this.roundToTwo(this.clamp(newField.x + offset, 0, maxX));
      newField.y = this.roundToTwo(this.clamp(newField.y + offset, 0, maxY));
    }

    let insertedFieldIndex = -1;
    let insertedPageIndex = -1;

    const changed = this.applyCoordsChange(() => {
      this.coords.update((pages) => {
        const updated = addFieldToPages(pageNum, newField, pages);
        insertedPageIndex = updated.findIndex((page) => page.num === pageNum);
        if (insertedPageIndex >= 0) {
          insertedFieldIndex = updated[insertedPageIndex].fields.length - 1;
        }
        return updated;
      });
    });

    if (changed) {
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();

    if (insertedPageIndex >= 0 && insertedFieldIndex >= 0) {
      const pages = this.coords();
      const page = pages[insertedPageIndex];
      const field = page?.fields[insertedFieldIndex];
      if (field) {
        this.startEditing(insertedPageIndex, insertedFieldIndex, field);
      }
    }

    return true;
  }

  duplicateAnnotation() {
    const editState = this.editing();
    if (!editState) {
      return;
    }

    const pages = this.coords();
    const pageNum = pages[editState.pageIndex]?.num ?? this.pageIndex();
    if (!this.copyAnnotation()) {
      return;
    }

    this.pasteAnnotation(pageNum);
  }

  private fieldHasRenderableContent(field: PageField): boolean {
    const valueText = typeof field.value === 'string' ? field.value.trim() : '';
    if (valueText) {
      return true;
    }

    const type = normalizeFieldType(field.type);
    if (type === 'check' || type === 'radio') {
      return true;
    }

    return field.mapField.trim().length > 0;
  }

  private fieldRequiresStorageUpdate(original: PageField, sanitized: PageField): boolean {
    return !this.areFieldsEqual(original, sanitized);
  }

  private prepareFieldForStorage(field: PageField): PageField {
    const styled = this.ensureFieldStyle(field);
    const type = normalizeFieldType(styled.type);
    const base: PageField = {
      x: styled.x,
      y: styled.y,
      mapField: typeof styled.mapField === 'string' ? styled.mapField : '',
      fontSize: styled.fontSize,
      color: normalizeColor(styled.color),
      type,
      fontFamily: styled.fontFamily ?? DEFAULT_FONT_ID,
      opacity: styled.opacity ?? DEFAULT_OPACITY,
      backgroundColor: styled.backgroundColor ?? null,
      locked: !!styled.locked,
      hidden: !!styled.hidden,
    };

    const value = sanitizeTextPreservingSpacing(styled.value);
    if (value !== undefined) {
      base.value = value;
    }

    if (type === 'number') {
      const decimals = normalizeFieldDecimals(styled.decimals);
      if (decimals !== undefined) {
        base.decimals = decimals;
      }
      const appender = sanitizeOptionalAppender(styled.appender);
      if (appender !== undefined) {
        base.appender = appender;
      }
    }

    return base;
  }

  private prepareFieldForForm(field: PageField): PageField {
    const styled = this.ensureFieldStyle(field);
    const decimals =
      typeof styled.decimals === 'number' && Number.isFinite(styled.decimals)
        ? Math.max(0, Math.round(styled.decimals))
        : null;

    return {
      ...styled,
      value: typeof styled.value === 'string' ? styled.value : '',
      appender: typeof styled.appender === 'string' ? styled.appender : '',
      decimals,
      locked: !!styled.locked,
      hidden: !!styled.hidden,
    };
  }




  private updateWorkingField(mode: EditorMode, mutator: (field: PageField) => PageField) {
    if (mode === 'preview') {
      this.preview.update((state) => {
        if (!state) {
          return state;
        }
        const nextField = mutator(state.field);
        return nextField === state.field ? state : { ...state, field: nextField };
      });
      return;
    }

    this.editing.update((state) => {
      if (!state) {
        return state;
      }
      if (mode === 'edit' && state.field.locked) {
        return state;
      }
      const nextField = mutator(state.field);
      return nextField === state.field ? state : { ...state, field: nextField };
    });
  }







  private normalizeOpacityValue(value: unknown): number | undefined {
    const numeric = toFiniteNumber(value);
    if (numeric === null) {
      return undefined;
    }
    const clamped = Math.min(Math.max(numeric, 0), 1);
    return Math.round(clamped * 100) / 100;
  }

  private normalizeBackgroundColor(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'transparent') {
      return undefined;
    }
    return normalizeColor(trimmed);
  }

  private ensureFieldStyle(field: PageField): PageField {
    const fontFamily = this.fontCatalog.normalizeFontFamily(field.fontFamily);
    const opacity = this.normalizeOpacityValue(field.opacity) ?? DEFAULT_OPACITY;
    const background = this.normalizeBackgroundColor(field.backgroundColor) ?? null;
    const locked = !!field.locked;
    const hidden = !!field.hidden;
    const legacyField = field as PageField & {
      fontWeight?: unknown;
      textAlign?: unknown;
    };
    const hasLegacyWeight = Object.prototype.hasOwnProperty.call(legacyField, 'fontWeight');
    const hasLegacyAlign = Object.prototype.hasOwnProperty.call(legacyField, 'textAlign');

    if (
      field.fontFamily === fontFamily &&
      (field.opacity ?? DEFAULT_OPACITY) === opacity &&
      (field.backgroundColor ?? null) === background &&
      (field.locked ?? false) === locked &&
      (field.hidden ?? false) === hidden &&
      !hasLegacyWeight &&
      !hasLegacyAlign
    ) {
      return field;
    }

    const { fontWeight: _legacyWeight, textAlign: _legacyAlign, ...rest } = legacyField;

    return {
      ...rest,
      fontFamily,
      opacity,
      backgroundColor: background,
      locked,
      hidden,
    };
  }



  private async registerCustomFont(file: File) {
    if (typeof FontFace === 'undefined') {
      this.toast.error(this.translationService.translate('fonts.custom.unsupported'));
      return;
    }

    try {
      await this.fontCatalog.registerCustomFont(file);
    } catch (error) {
      console.error('No se pudo cargar la fuente personalizada.', error);
      this.toast.error(this.translationService.translate('fonts.custom.error'));
    }
  }

  private handleFontDropdownOutsideClick(target: Node) {
    if (this.fontDropdownOpen('preview')) {
      const dropdown = this.previewFontDropdownRef?.nativeElement;
      if (!dropdown || !dropdown.contains(target)) {
        this.closeFontDropdown('preview');
      }
    }

    if (this.fontDropdownOpen('edit')) {
      const dropdown = this.editFontDropdownRef?.nativeElement;
      if (!dropdown || !dropdown.contains(target)) {
        this.closeFontDropdown('edit');
      }
    }
  }

  private handleRemovedFontOptions(optionIds: readonly string[]) {
    if (!optionIds.length) {
      return;
    }

    const removedSet = new Set(optionIds);
    const fallbackId = DEFAULT_FONT_ID;

    const applyFallback = (field: PageField): PageField =>
      this.ensureFieldStyle({
        ...field,
        fontFamily: fallbackId,
      });

    this.preview.update((state) => {
      if (!state) {
        return state;
      }
      const currentFamily = state.field.fontFamily;
      if (currentFamily && removedSet.has(currentFamily)) {
        const nextField = applyFallback(state.field);
        return { ...state, field: nextField };
      }
      const styledField = this.ensureFieldStyle(state.field);
      return styledField === state.field ? state : { ...state, field: styledField };
    });

    this.editing.update((state) => {
      if (!state) {
        return state;
      }
      const currentFamily = state.field.fontFamily;
      if (currentFamily && removedSet.has(currentFamily)) {
        const nextField = applyFallback(state.field);
        return { ...state, field: nextField };
      }
      const styledField = this.ensureFieldStyle(state.field);
      return styledField === state.field ? state : { ...state, field: styledField };
    });

    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) =>
        pages.map((page) => {
          let pageChanged = false;
          const nextFields = page.fields.map((field) => {
            const currentFamily = field.fontFamily;
            if (currentFamily && removedSet.has(currentFamily)) {
              pageChanged = true;
              return applyFallback(field);
            }
            const styledField = this.ensureFieldStyle(field);
            if (styledField !== field) {
              pageChanged = true;
            }
            return styledField;
          });
          return pageChanged ? { ...page, fields: nextFields } : page;
        })
      )
    );

    if (changed) {
      this.syncCoordsTextModel();
    }

    this.redrawAllForPage();
  }

  private dismissEditors() {
    if (this.preview()) {
      this.preview.set(null);
    }
    if (this.editing()) {
      this.editing.set(null);
    }
    this.closeFontDropdown('preview');
    this.closeFontDropdown('edit');
  }

  private createRuntimeId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private computeHorizontalBounds(
    width: number,
    canvasWidth: number
  ): { minLeft: number; maxLeft: number } {
    const elementWidth = Math.max(width, 0);
    const min = 0;
    const max = Math.max(canvasWidth - elementWidth, 0);
    return { minLeft: min, maxLeft: max < min ? min : max };
  }

  private runAfterRender(callback: () => void) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => callback());
    } else {
      setTimeout(callback, 0);
    }
  }

  private focusJsonOnSelection(pageIndex: number, fieldIndex: number) {
    if (pageIndex < 0 || fieldIndex < 0) {
      return;
    }

    this.runAfterRender(() => {
      if (this.jsonViewMode() === 'tree') {
        this.focusJsonTreeNode(pageIndex, fieldIndex);
      } else {
        this.focusJsonTextRange(pageIndex, fieldIndex);
      }
    });
  }

  private focusJsonTreeNode(pageIndex: number, fieldIndex: number) {
    if (this.jsonTreePreview.status !== 'ready') {
      return;
    }

    const component = this.jsonTreeComponent;
    if (!component) {
      return;
    }

    const pages = this.coords();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return;
    }

    const fields = pages[pageIndex]?.fields ?? [];
    if (fieldIndex < 0 || fieldIndex >= fields.length) {
      return;
    }

    component.focusPath(this.buildJsonTreePath(pageIndex, fieldIndex), { smooth: true });
  }

  private buildJsonTreePath(pageIndex: number, fieldIndex: number): string {
    return `root/pages/${pageIndex}/fields/${fieldIndex}`;
  }

  private focusJsonTextRange(pageIndex: number, fieldIndex: number) {
    const textarea = this.jsonEditorRef?.nativeElement;
    if (!textarea) {
      return;
    }

    const pages = this.coords();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return;
    }

    const fields = pages[pageIndex]?.fields ?? [];
    if (fieldIndex < 0 || fieldIndex >= fields.length) {
      return;
    }

    const range = this.locateJsonFieldRange(pageIndex, fieldIndex, textarea.value);
    if (!range) {
      return;
    }

    this.highlightTextareaRange(textarea, range);
  }

  private locateJsonFieldRange(
    pageIndex: number,
    fieldIndex: number,
    text: string
  ): { start: number; end: number } | null {
    if (!text) {
      return null;
    }

    const pages = this.coords();
    if (pageIndex < 0 || pageIndex >= pages.length) {
      return null;
    }

    const targetPage = pages[pageIndex];
    if (!targetPage.fields.length || fieldIndex < 0 || fieldIndex >= targetPage.fields.length) {
      return null;
    }

    let searchFrom = 0;

    for (let i = 0; i < pages.length; i += 1) {
      const pageBlock = this.buildPageJsonBlock(pages[i]);
      const pagePos = text.indexOf(pageBlock, searchFrom);
      if (pagePos === -1) {
        return null;
      }

      if (i === pageIndex) {
        let fieldSearchFrom = pagePos;
        for (let j = 0; j < targetPage.fields.length; j += 1) {
          const fieldBlock = this.buildFieldJsonBlock(targetPage.fields[j]);
          const fieldPos = text.indexOf(fieldBlock, fieldSearchFrom);
          if (fieldPos === -1) {
            return null;
          }

          if (j === fieldIndex) {
            return { start: fieldPos, end: fieldPos + fieldBlock.length };
          }

          fieldSearchFrom = fieldPos + fieldBlock.length;
        }

        return null;
      }

      searchFrom = pagePos + pageBlock.length;
    }

    return null;
  }

  private buildPageJsonBlock(page: PageAnnotations): string {
    return JSON.stringify(this.serializePageForJson(page), null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
  }

  private buildFieldJsonBlock(field: PageField): string {
    return JSON.stringify(this.serializeFieldForJson(field), null, 2)
      .split('\n')
      .map((line) => `        ${line}`)
      .join('\n');
  }

  private highlightTextareaRange(
    textarea: HTMLTextAreaElement,
    range: { start: number; end: number }
  ) {
    const { start, end } = range;
    if (start < 0 || end <= start) {
      return;
    }

    const activeElement = (this.document?.activeElement ?? null) as HTMLElement | null;
    const hadFocus = activeElement === textarea;

    if (!hadFocus) {
      try {
        textarea.focus({ preventScroll: true } as FocusOptions);
      } catch {
        textarea.focus();
      }
    }

    try {
      textarea.setSelectionRange(start, end);
    } catch {
      // Ignore selection errors in unsupported environments.
    }

    const lineHeight = this.getTextareaLineHeight(textarea);
    const precedingText = textarea.value.slice(0, start);
    const lineIndex = this.countLineBreaks(precedingText);
    const desiredTop = Math.max(lineIndex - 2, 0) * lineHeight;
    const maxScrollTop = Math.max(textarea.scrollHeight - textarea.clientHeight, 0);
    const top = Math.min(desiredTop, maxScrollTop);

    if (typeof textarea.scrollTo === 'function') {
      textarea.scrollTo({ top, behavior: 'smooth' });
    } else {
      textarea.scrollTop = top;
    }

    if (!hadFocus && activeElement && activeElement !== textarea) {
      this.runAfterRender(() => {
        try {
          activeElement.focus({ preventScroll: true } as FocusOptions);
        } catch {
          activeElement.focus();
        }
      });
    }
  }

  private getTextareaLineHeight(textarea: HTMLTextAreaElement): number {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
      return 20;
    }

    const computed = getComputedStyle(textarea);
    const rawLineHeight = parseFloat(computed.lineHeight);
    if (Number.isFinite(rawLineHeight) && rawLineHeight > 0) {
      return rawLineHeight;
    }

    const measured = this.measureLineHeightFromElement(computed);
    if (measured !== null) {
      return measured;
    }

    const fontSize = parseFloat(computed.fontSize);
    if (Number.isFinite(fontSize) && fontSize > 0) {
      return fontSize * 1.4;
    }

    return 20;
  }

  private measureLineHeightFromElement(computed: CSSStyleDeclaration): number | null {
    const doc = this.document as Document | null;
    if (!doc) {
      return null;
    }

    const body = doc.body ?? null;
    if (!body) {
      return null;
    }

    const probe = doc.createElement('span');
    probe.textContent = 'M';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = computed.fontFamily;
    probe.style.fontSize = computed.fontSize;
    probe.style.fontWeight = computed.fontWeight;
    probe.style.fontStyle = computed.fontStyle;
    probe.style.letterSpacing = computed.letterSpacing;
    probe.style.padding = '0';
    probe.style.margin = '0';
    probe.style.border = '0';
    probe.style.lineHeight = computed.lineHeight;

    body.appendChild(probe);
    const height = probe.getBoundingClientRect().height;
    body.removeChild(probe);

    return Number.isFinite(height) && height > 0 ? height : null;
  }

  private countLineBreaks(value: string): number {
    if (!value) {
      return 0;
    }

    let count = 0;
    for (let i = 0; i < value.length; i += 1) {
      if (value.charCodeAt(i) === 10) {
        count += 1;
      }
    }

    return count;
  }

  private updateAnnotationLeft(el: HTMLDivElement, field: PageField, scale: number) {
    const width = el.offsetWidth;
    const left = field.x * scale;
    el.style.left = `${left}px`;
    el.style.width = `${width}px`;
  }



  private getFieldRenderValue(field: PageField): string {
    const override =
      typeof field.value === 'string' && field.value.trim() ? field.value : undefined;
    if (override !== undefined) {
      return override;
    }

    const type = normalizeFieldType(field.type);
    if (type === 'check' || type === 'radio') {
      return 'X';
    }

    const baseText = typeof field.mapField === 'string' ? field.mapField : '';

    if (type === 'number') {
      const numeric = toFiniteNumber(baseText);
      if (numeric !== null) {
        const decimals = normalizeFieldDecimals(field.decimals);
        const formatted =
          decimals !== undefined ? formatNumberWithTruncation(numeric, decimals) : baseText;
        const appender = sanitizeOptionalAppender(field.appender) ?? '';
        return `${formatted}${appender}`;
      }
    }

    return baseText;
  }




  redrawAllForPage() {
    const layer = this.annotationsLayerRef?.nativeElement;
    if (!layer) return;
    layer.innerHTML = '';

    const scale = this.scale();
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!pdfCanvas) return;

    this.coords()
      .map((page, pageIndex) => ({ page, pageIndex }))
      .filter(({ page }) => page.num === this.pageIndex())
      .forEach(({ page, pageIndex }) => {
        page.fields.forEach((field, fieldIndex) => {
          const styledField = this.ensureFieldStyle(field);
          const left = styledField.x * scale;
          const top = pdfCanvas.height - styledField.y * scale;
          const isLocked = styledField.locked ?? false;
          const isHidden = styledField.hidden ?? false;

          const el = document.createElement('div');
          el.className = 'annotation';
          el.textContent = this.getFieldRenderValue(styledField);
          el.style.left = `${left}px`;
          el.style.top = `${top - styledField.fontSize * scale}px`;
          el.style.fontSize = `${styledField.fontSize * scale}px`;
          el.style.color = styledField.color;
          el.style.fontFamily = this.fontCatalog.resolveCssFontFamily(
            styledField.fontFamily ?? DEFAULT_FONT_ID
          );
          el.style.opacity = `${styledField.opacity ?? DEFAULT_OPACITY}`;
          el.style.backgroundColor = styledField.backgroundColor ?? 'transparent';
          el.style.width = 'auto';
          if (isLocked) {
            el.dataset['locked'] = 'true';
          } else {
            delete el.dataset['locked'];
          }
          if (isHidden) {
            el.dataset['hidden'] = 'true';
          } else {
            delete el.dataset['hidden'];
          }
          el.classList.toggle('annotation--locked', isLocked);
          el.classList.toggle('annotation--hidden', isHidden);
          el.dataset['pageIndex'] = `${pageIndex}`;
          el.dataset['fieldIndex'] = `${fieldIndex}`;
          el.classList.toggle('annotation--selected', this.isSelected(pageIndex, fieldIndex));
          el.onpointerdown = isLocked
            ? (evt) => this.handleLockedAnnotationPointerDown(evt, pageIndex, fieldIndex)
            : (evt) => this.handleAnnotationPointerDown(evt, pageIndex, fieldIndex);
          layer.appendChild(el);

          this.runAfterRender(() => this.updateAnnotationLeft(el, styledField, scale));
        });
      });

    this.refreshOverlay();
  }

  isSelected(pageIndex: number, fieldIndex: number): boolean {
    const selected = this.selection();
    return !!selected && selected.pageIndex === pageIndex && selected.fields.includes(fieldIndex);
  }

  /** Drops the selection and repaints (call before changing what is shown). */
  clearSelection(): void {
    if (!this.selection()) {
      return;
    }
    this.selection.set(null);
    this.redrawAllForPage();
  }

  toggleSelection(pageIndex: number, fieldIndex: number): void {
    this.dismissEditors();
    // Pressing on an annotation does not move focus, so leave any text field the user was in;
    // otherwise Delete/arrow/Ctrl+C would keep going to that field instead of the selection.
    this.releaseButtonFocus();
    const selected = this.selection();
    const current = selected && selected.pageIndex === pageIndex ? selected.fields : [];
    const next = current.includes(fieldIndex)
      ? current.filter((index) => index !== fieldIndex)
      : [...current, fieldIndex].sort((a, b) => a - b);
    this.selection.set(next.length ? { pageIndex, fields: next } : null);
    this.redrawAllForPage();
  }

  selectAllOnPage(): void {
    const pageIndex = this.coords().findIndex((page) => page.num === this.pageIndex());
    if (pageIndex < 0) {
      return;
    }
    const fields = this.coords()[pageIndex].fields
      .map((field, index) => ({ field, index }))
      .filter(({ field }) => !field.locked)
      .map(({ index }) => index);
    this.dismissEditors();
    this.selection.set(fields.length ? { pageIndex, fields } : null);
    this.redrawAllForPage();
  }

  /** Aligns the selected annotations (needs at least two) as a single undo step. */
  alignSelection(mode: AlignMode): void {
    const selected = this.selection();
    const scale = this.scale();
    if (!selected || selected.fields.length < 2 || !scale) {
      return;
    }

    const page = this.coords()[selected.pageIndex];
    const boxes = selected.fields.map((index) => {
      const field = this.ensureFieldStyle(page.fields[index]);
      return {
        x: field.x,
        y: field.y,
        width: this.annotationWidthPx(selected.pageIndex, index, field) / scale,
        height: field.fontSize,
      };
    });
    const positions = alignBoxes(boxes, mode);

    this.updateSelectedFields((field, order) => ({ ...field, ...positions[order] }));
    this.releaseButtonFocus();
  }

  /** Moves the selection by a delta in PDF points (clamped to the page). */
  moveSelection(dx: number, dy: number, coalesceKey?: string): void {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    const scale = this.scale();
    if (!this.selection() || !pdfCanvas || !scale) {
      return;
    }
    const maxX = pdfCanvas.width / scale;
    const maxY = pdfCanvas.height / scale;
    this.updateSelectedFields(
      (field) => ({
        ...field,
        x: this.roundToTwo(this.clamp(field.x + dx, 0, maxX)),
        y: this.roundToTwo(this.clamp(field.y + dy, 0, maxY)),
      }),
      coalesceKey
    );
  }

  deleteSelection(): void {
    const selected = this.selection();
    if (!selected) {
      return;
    }
    const doomed = new Set(selected.fields);
    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) =>
        pages
          .map((page, index) =>
            index === selected.pageIndex
              ? { ...page, fields: page.fields.filter((_, i) => !doomed.has(i)) }
              : page
          )
          .filter((page) => page.fields.length > 0)
      )
    );
    this.selection.set(null);
    if (changed) {
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();
    this.releaseButtonFocus();
  }

  copySelection(): boolean {
    const fields = this.selectedFields();
    if (!fields.length) {
      return false;
    }
    this.selectionClipboard = fields.map((field) => ({ ...this.prepareFieldForStorage(field) }));
    return true;
  }

  pasteSelection(): boolean {
    return this.insertCopies(this.selectionClipboard);
  }

  duplicateSelection(): void {
    if (this.copySelection()) {
      this.insertCopies(this.selectionClipboard);
    }
    this.releaseButtonFocus();
  }

  /** Adds offset copies on the current page as one undo step and selects them. */
  private insertCopies(fields: readonly PageField[]): boolean {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    const scale = this.scale();
    if (!fields.length || !this.pdfDoc || !pdfCanvas || !scale) {
      return false;
    }

    const pageNum = this.pageIndex();
    const offset = this.roundToTwo(8 / scale);
    const maxX = this.roundToTwo(pdfCanvas.width / scale);
    const maxY = this.roundToTwo(pdfCanvas.height / scale);
    const copies = fields.map((field) => ({
      ...field,
      x: this.roundToTwo(this.clamp(field.x + offset, 0, maxX)),
      y: this.roundToTwo(this.clamp(field.y - offset, 0, maxY)),
    }));

    let firstIndex = 0;
    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) => {
        const existing = pages.find((page) => page.num === pageNum);
        firstIndex = existing ? existing.fields.length : 0;
        return copies.reduce((acc, copy) => addFieldToPages(pageNum, copy, acc), pages);
      })
    );
    if (!changed) {
      return false;
    }

    const pageIndex = this.coords().findIndex((page) => page.num === pageNum);
    this.dismissEditors();
    this.selection.set({
      pageIndex,
      fields: copies.map((_, i) => firstIndex + i),
    });
    this.syncCoordsTextModel();
    this.redrawAllForPage();
    return true;
  }

  private selectedFields(): PageField[] {
    const selected = this.selection();
    if (!selected) {
      return [];
    }
    const page = this.coords()[selected.pageIndex];
    return selected.fields.map((index) => page?.fields[index]).filter((f): f is PageField => !!f);
  }

  /** Applies `update` to every selected field in a single history step. */
  private updateSelectedFields(
    update: (field: PageField, order: number) => PageField,
    coalesceKey?: string
  ): void {
    const selected = this.selection();
    if (!selected) {
      return;
    }
    const order = new Map(selected.fields.map((index, position) => [index, position]));
    const changed = this.applyCoordsChange(
      () =>
        this.coords.update((pages) =>
          pages.map((page, pageIdx) =>
            pageIdx !== selected.pageIndex
              ? page
              : {
                  ...page,
                  fields: page.fields.map((field, fieldIdx) =>
                    order.has(fieldIdx) ? update(field, order.get(fieldIdx)!) : field
                  ),
                }
          )
        ),
      coalesceKey ? { coalesceKey } : undefined
    );
    if (changed) {
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();
  }

  /** Rendered width of an annotation in px (falls back to a rough estimate before first paint). */
  private annotationWidthPx(pageIndex: number, fieldIndex: number, field: PageField): number {
    const el = this.annotationsLayerRef?.nativeElement.querySelector<HTMLElement>(
      `[data-page-index="${pageIndex}"][data-field-index="${fieldIndex}"]`
    );
    if (el && el.offsetWidth > 0) {
      return el.offsetWidth;
    }
    return this.getFieldRenderValue(field).length * field.fontSize * 0.5 * this.scale();
  }

  private releaseButtonFocus(): void {
    (this.document?.activeElement as HTMLElement | null)?.blur?.();
  }

  private startGroupDrag(evt: PointerEvent, pressed: HTMLElement, fields: readonly number[]) {
    const layer = this.annotationsLayerRef?.nativeElement;
    if (!layer) {
      return;
    }
    const items = fields
      .map((index) =>
        layer.querySelector<HTMLElement>(`[data-field-index="${index}"]`)
      )
      .filter((el): el is HTMLElement => !!el)
      .map((el) => ({
        el,
        startLeft: parseFloat(el.style.left || '0'),
        startTop: parseFloat(el.style.top || '0'),
        width: el.offsetWidth,
        fontPx: parseFloat(getComputedStyle(el).fontSize || '0'),
      }));

    this.groupDrag = {
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      moved: false,
      dx: 0,
      dy: 0,
      items,
    };
    pressed.setPointerCapture(evt.pointerId);
    pressed.onpointermove = this.handleGroupPointerMove;
    pressed.onpointerup = this.handleGroupPointerUp;
    pressed.onpointercancel = this.handleGroupPointerUp;
  }

  private handleGroupPointerMove = (evt: PointerEvent) => {
    const drag = this.groupDrag;
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!drag || !pdfCanvas || evt.pointerId !== drag.pointerId) {
      return;
    }
    evt.preventDefault();
    const rawDx = evt.clientX - drag.startX;
    const rawDy = evt.clientY - drag.startY;
    if (!drag.moved && Math.abs(rawDx) <= 2 && Math.abs(rawDy) <= 2) {
      return;
    }
    drag.moved = true;

    // Clamp the whole group so every member stays inside the page and spacing is preserved.
    const minDx = Math.max(...drag.items.map((i) => -i.startLeft));
    const maxDx = Math.min(...drag.items.map((i) => pdfCanvas.width - i.width - i.startLeft));
    const minDy = Math.max(...drag.items.map((i) => -i.fontPx - i.startTop));
    const maxDy = Math.min(...drag.items.map((i) => pdfCanvas.height - i.fontPx - i.startTop));
    drag.dx = this.clamp(rawDx, Math.min(minDx, 0), Math.max(maxDx, 0));
    drag.dy = this.clamp(rawDy, Math.min(minDy, 0), Math.max(maxDy, 0));

    for (const item of drag.items) {
      item.el.style.left = `${item.startLeft + drag.dx}px`;
      item.el.style.top = `${item.startTop + drag.dy}px`;
    }
  };

  private handleGroupPointerUp = (evt: PointerEvent) => {
    const drag = this.groupDrag;
    if (!drag || evt.pointerId !== drag.pointerId) {
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    const pressed = evt.currentTarget as HTMLElement | null;
    pressed?.releasePointerCapture?.(evt.pointerId);
    if (pressed) {
      pressed.onpointermove = null;
      pressed.onpointerup = null;
      pressed.onpointercancel = null;
    }
    this.groupDrag = null;

    if (drag.moved && evt.type !== 'pointercancel') {
      const scale = this.scale();
      this.moveSelection(drag.dx / scale, -drag.dy / scale);
    } else {
      // A plain click on a member: behave like a normal click on that annotation.
      this.redrawAllForPage();
      if (evt.type !== 'pointercancel') {
        const index = Number(pressed?.dataset['fieldIndex']);
        const pageIdx = Number(pressed?.dataset['pageIndex']);
        const field = this.coords()[pageIdx]?.fields[index];
        this.selection.set(null);
        if (field) {
          this.startEditing(pageIdx, index, field);
        }
      }
    }
  };

  private handleLockedAnnotationPointerDown(
    evt: PointerEvent,
    pageIndex: number,
    fieldIndex: number
  ) {
    evt.preventDefault();
    evt.stopPropagation();
    const page = this.coords()[pageIndex];
    const field = page?.fields[fieldIndex];
    if (!field) {
      return;
    }
    this.startEditing(pageIndex, fieldIndex, field);
  }

  private handleAnnotationPointerDown(evt: PointerEvent, pageIndex: number, fieldIndex: number) {
    evt.preventDefault();
    evt.stopPropagation();
    const el = evt.currentTarget as HTMLDivElement | null;
    if (!el) return;

    const computedFontSize = parseFloat(getComputedStyle(el).fontSize || '0');
    const page = this.coords()[pageIndex];
    const field = page?.fields[fieldIndex];
    if (!field || field.locked) {
      return;
    }
    const styledField = this.ensureFieldStyle(field);
    if (styledField?.locked) {
      this.handleLockedAnnotationPointerDown(evt, pageIndex, fieldIndex);
      return;
    }

    if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
      this.toggleSelection(pageIndex, fieldIndex);
      return;
    }

    const selected = this.selection();
    if (
      selected &&
      selected.pageIndex === pageIndex &&
      selected.fields.length > 1 &&
      selected.fields.includes(fieldIndex)
    ) {
      this.startGroupDrag(evt, el, selected.fields);
      return;
    }
    if (selected) {
      this.clearSelection();
    }

    this.dragInfo = {
      pageIndex,
      fieldIndex,
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      startLeft: parseFloat(el.style.left || '0'),
      startTop: parseFloat(el.style.top || '0'),
      fontSize: computedFontSize,
      width: el.offsetWidth,
      moved: false,
    };

    this.draggingElement = el;
    el.setPointerCapture(evt.pointerId);
    el.classList.add('dragging');
    el.onpointermove = this.handleAnnotationPointerMove;
    el.onpointerup = this.handleAnnotationPointerUp;
    el.onpointercancel = this.handleAnnotationPointerUp;

    if (this.guidesFeatureEnabled()) {
      this.refreshOverlay(
        {
          left: parseFloat(el.style.left || '0'),
          top: parseFloat(el.style.top || '0'),
          width: el.offsetWidth,
          height: el.offsetHeight,
        },
        []
      );
    } else {
      this.refreshOverlay(null, []);
    }
  }

  private handleAnnotationPointerMove = (evt: PointerEvent) => {
    if (!this.dragInfo || evt.pointerId !== this.dragInfo.pointerId) return;
    const el = this.draggingElement;
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!el || !pdfCanvas) return;

    evt.preventDefault();
    const dx = evt.clientX - this.dragInfo.startX;
    const dy = evt.clientY - this.dragInfo.startY;
    const shouldMove = this.dragInfo.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    if (!shouldMove) return;

    this.dragInfo.moved = true;

    const tentativeLeft = this.dragInfo.startLeft + dx;
    const tentativeTop = this.dragInfo.startTop + dy;

    const minTop = -this.dragInfo.fontSize;
    const maxTop = pdfCanvas.height - this.dragInfo.fontSize;
    const elementWidth = this.dragInfo.width || el.offsetWidth;
    const horizontalBounds = this.computeHorizontalBounds(elementWidth, pdfCanvas.width);
    const clampedLeft = Math.min(
      Math.max(tentativeLeft, horizontalBounds.minLeft),
      horizontalBounds.maxLeft
    );
    const clampedTop = Math.min(Math.max(tentativeTop, minTop), maxTop);

    this.dragInfo.width = el.offsetWidth;

    if (!this.guidesFeatureEnabled()) {
      el.style.left = `${clampedLeft}px`;
      el.style.top = `${clampedTop}px`;
      this.refreshOverlay(null, []);
      return;
    }

    const snapResult = this.applySnapping(
      clampedLeft,
      clampedTop,
      { minLeft: horizontalBounds.minLeft, maxLeft: horizontalBounds.maxLeft, minTop, maxTop },
      el,
      pdfCanvas,
      this.dragInfo.fontSize
    );

    el.style.left = `${snapResult.left}px`;
    el.style.top = `${snapResult.top}px`;

    this.refreshOverlay(
      {
        left: snapResult.left,
        top: snapResult.top,
        width: el.offsetWidth,
        height: el.offsetHeight,
      },
      snapResult.guides
    );
  };

  private handleAnnotationPointerUp = (evt: PointerEvent) => {
    if (!this.dragInfo || evt.pointerId !== this.dragInfo.pointerId) return;
    const el = this.draggingElement;
    if (!el) {
      this.dragInfo = null;
      this.refreshOverlay(null, []);
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    el.releasePointerCapture(evt.pointerId);
    el.classList.remove('dragging');
    el.onpointermove = null;
    el.onpointerup = null;
    el.onpointercancel = null;

    const drag = this.dragInfo;
    this.dragInfo = null;
    this.draggingElement = null;

    this.refreshOverlay(null, []);

    if (drag.moved) {
      const left = parseFloat(el.style.left || '0');
      const top = parseFloat(el.style.top || '0');
      this.updateAnnotationPosition(
        drag.pageIndex,
        drag.fieldIndex,
        left,
        top,
        drag.fontSize,
        drag.width || el.offsetWidth
      );
    } else if (evt.type !== 'pointercancel') {
      const page = this.coords()[drag.pageIndex];
      const field = page?.fields[drag.fieldIndex];
      if (field) {
        this.startEditing(drag.pageIndex, drag.fieldIndex, field);
      }
    }
  };

  private updateAnnotationPosition(
    pageIndex: number,
    fieldIndex: number,
    leftPx: number,
    topPx: number,
    fontSizePx: number,
    widthPx: number
  ) {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!pdfCanvas) return;
    const scale = this.scale();
    const page = this.coords()[pageIndex];
    const field = page?.fields[fieldIndex];
    if (!field || field.locked) {
      return;
    }
    const bounds = this.computeHorizontalBounds(widthPx, pdfCanvas.width);
    const boundedLeft = Math.min(Math.max(leftPx, bounds.minLeft), bounds.maxLeft);
    const boundedTop = Math.min(Math.max(topPx, -fontSizePx), pdfCanvas.height - fontSizePx);
    const width = Math.max(widthPx, 0) / scale;
    const newX = +(boundedLeft / scale).toFixed(2);
    const newY = +((pdfCanvas.height - (boundedTop + fontSizePx)) / scale).toFixed(2);

    const changed = this.applyCoordsChange(() =>
      this.coords.update((pages) =>
        pages.map((page, idx) => {
          if (idx !== pageIndex) {
            return page;
          }
          if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
            return page;
          }
          const updatedFields = page.fields.map((currentField, fIdx) =>
            fIdx === fieldIndex
              ? this.ensureFieldStyle({ ...currentField, x: newX, y: newY })
              : currentField
          );
          return { ...page, fields: updatedFields };
        })
      )
    );

    if (changed) {
      this.syncCoordsTextModel();
    }

    this.redrawAllForPage();
  }

  async setPageIndex(pageNumber: number) {
    if (!this.pdfDoc) {
      return;
    }

    const clamped = Math.min(
      this.pdfDoc.numPages,
      Math.max(1, Math.round(pageNumber))
    );

    if (clamped === this.pageIndex()) {
      return;
    }

    this.selection.set(null);
    this.pageIndex.set(clamped);
    await this.render();
    this.redrawAllForPage();
  }

  async prevPage() {
    await this.setPageIndex(this.pageIndex() - 1);
  }

  async nextPage() {
    await this.setPageIndex(this.pageIndex() + 1);
  }

  async zoomIn() {
    this.scale.update((s) => +(s + 0.25).toFixed(2));
    await this.render();
    this.redrawAllForPage();
  }

  async zoomOut() {
    this.scale.update((s) => Math.max(0.25, +(this.scale() - 0.25).toFixed(2)));
    await this.render();
    this.redrawAllForPage();
  }

  async fitWidth() {
    if (!this.pdfDoc) {
      return;
    }

    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) {
      return;
    }

    const page = await this.pdfDoc.getPage(this.pageIndex());
    const baseWidth = page.getViewport({ scale: 1 }).width;
    const style = getComputedStyle(container);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const available = container.clientWidth - padding;
    if (!(baseWidth > 0) || !(available > 0)) {
      return;
    }

    this.scale.set(Math.min(4, Math.max(0.25, Math.floor((available / baseWidth) * 100) / 100)));
    await this.render();
    this.redrawAllForPage();
  }

  toggleShortcuts(open = !this.shortcutsOpen()) {
    this.shortcutsOpen.set(open);
  }

  clearAll(options?: { skipHistory?: boolean }) {
    this.replaceCoords([], options);
  }

  copyJSON() {
    navigator.clipboard.writeText(this.coordsTextModel).catch(() => {});
  }

  toggleIncludeAdvancedJsonFields(checked: boolean) {
    if (this.includeAdvancedJsonFields() === checked) {
      return;
    }

    this.includeAdvancedJsonFields.set(checked);
    this.syncCoordsTextModel(false);
  }

  onCoordsTextChange(value: string) {
    this.coordsTextModel = value;
    this.refreshJsonPreview();
    this.scheduleCoordsAutoApply();
  }

  onCoordsTextPaste() {
    this.scheduleCoordsAutoApply(0);
  }

  setJsonViewMode(mode: JsonViewMode) {
    if (this.jsonViewMode() === mode) {
      return;
    }

    if (mode === 'tree') {
      this.refreshJsonPreview();
    }

    this.jsonViewMode.set(mode);

    const editState = this.editing();
    if (editState) {
      this.focusJsonOnSelection(editState.pageIndex, editState.fieldIndex);
    }
  }

  applyCoordsText() {
    this.tryApplyCoordsText({ silent: false, clearWhenEmpty: true });
  }

  private scheduleCoordsAutoApply(delayMs = AUTO_APPLY_JSON_DELAY_MS) {
    if (this.autoApplyCoordsTimer) {
      clearTimeout(this.autoApplyCoordsTimer);
    }

    this.autoApplyCoordsTimer = setTimeout(() => {
      this.autoApplyCoordsTimer = null;
      this.tryApplyCoordsText({ silent: true, clearWhenEmpty: false });
    }, delayMs);
  }

  private tryApplyCoordsText(options: { silent: boolean; clearWhenEmpty: boolean }): boolean {
    const text = this.coordsTextModel.trim();

    if (!text) {
      if (options.clearWhenEmpty) {
        this.clearAll();
      }
      return false;
    }

    try {
      const parsed = parseLooseJson(text);
      const report = emptyImportReport();
      const normalized = this.annotationImport.normalizeImportedCoordinates(
        parsed,
        (field) => this.prepareFieldForStorage(field),
        report
      );

      if (normalized === null) {
        throw new JsonShapeError();
      }

      this.replaceCoords(normalized, { preserveTextModel: true });
      if (!options.silent) {
        void this.reportImportIssues(report, normalized);
      }
      return true;
    } catch (error) {
      if (!options.silent) {
        console.error('No se pudo importar el JSON de anotaciones.', error);
        this.reportJsonImportError(error);
      }
      return false;
    }
  }

  triggerImportCoords() {
    const input = this.coordsFileInputRef?.nativeElement ?? this.ensureCoordsFileInput();
    if (!input) {
      console.warn('No se pudo abrir el selector de archivos para importar anotaciones.');
      return;
    }

    input.value = '';
    input.click();
  }

  async onCoordsFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      if (file.size > MAX_JSON_IMPORT_BYTES) {
        throw new Error('El archivo JSON supera el tamaño máximo permitido');
      }
      const text = await file.text();
      const parsed = parseLooseJson(text);
      const report = emptyImportReport();
      const normalized = this.annotationImport.normalizeImportedCoordinates(
        parsed,
        (field) => this.prepareFieldForStorage(field),
        report
      );
      if (normalized === null) {
        throw new JsonShapeError();
      }

      this.replaceCoords(normalized, { preserveTextModel: false });
      void this.reportImportIssues(report, normalized);
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      this.reportJsonImportError(error);
    } finally {
      input.value = '';
    }
  }

  downloadJSON() {
    downloadBlob(new Blob([this.coordsTextModel], { type: 'application/json' }), 'coords.json');
  }

  saveCurrentAsTemplate() {
    const name = this.templateNameModel.trim();
    if (!name || !this.coords().length) {
      return;
    }

    const savedTemplate = this.templatesService.saveTemplate(name, {
      pages: this.coords(),
      guideSettings: this.guideSettings(),
      guidesEnabled: this.guidesFeatureEnabled(),
    });
    if (!savedTemplate) {
      console.warn('El navegador no soporta almacenamiento local para plantillas.');
      return;
    }

    this.templates.set(this.templatesService.getTemplates());
    this.templateNameModel = '';
    this.selectedTemplateId = savedTemplate.id;
  }

  loadSelectedTemplate() {
    if (!this.selectedTemplateId) {
      return;
    }

    const template = this.templates().find((item) => item.id === this.selectedTemplateId);
    if (!template) {
      return;
    }

    this.applyTemplate(template);
  }

  deleteSelectedTemplate() {
    if (!this.selectedTemplateId || this.selectedTemplateId === this.defaultTemplateId) {
      return;
    }

    const templateId = this.selectedTemplateId;
    this.templatesService.deleteTemplate(templateId);
    const nextTemplates = this.templatesService.getTemplates();
    this.templates.set(nextTemplates);
    if (!nextTemplates.some((template) => template.id === templateId)) {
      this.selectedTemplateId = nextTemplates[0]?.id ?? this.templatesService.defaultTemplateId;
    }
  }

  private applyTemplate(template: AnnotationTemplate) {
    const clonedPages = cloneAnnotationPages(template.pages);
    const nextGuideSettings = cloneGuideSettings(template.guideSettings);

    this.coords.set(clonedPages);
    this.guideSettings.set(nextGuideSettings);
    this.snapPointsXText.set(nextGuideSettings.snapPointsX.join(', '));
    this.snapPointsYText.set(nextGuideSettings.snapPointsY.join(', '));
    this.guidesFeatureEnabled.set(template.guidesEnabled);
    if (template.guidesEnabled || differsFromDefaultGuideSettings(nextGuideSettings)) {
      this.advancedOptionsOpen.set(true);
    }
    this.syncCoordsTextModel();
    this.preview.set(null);
    this.editing.set(null);
    this.refreshOverlay();
    this.redrawAllForPage();
  }


  private ensureCoordsFileInput(): HTMLInputElement | null {
    if (this.coordsFileInputFallback) {
      return this.coordsFileInputFallback;
    }

    if (!this.document?.body) {
      return null;
    }

    const input = this.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    input.addEventListener('change', this.coordsFileInputChangeHandler);
    this.document.body.appendChild(input);
    this.coordsFileInputFallback = input;
    return input;
  }

  async downloadAnnotatedPDF() {
    if (!this.pdfDoc) return;

    try {
      const customFonts = new Map<string, CustomFontEntry>();
      this.customFonts().forEach((fontEntry) => customFonts.set(fontEntry.id, fontEntry));

      const { bytes, sourceBytes } = await this.pdfExportService.exportAnnotatedPdf({
        pdfByteCandidates: await this.getPdfByteCandidates(),
        pages: this.coords(),
        customFonts,
        defaultFontId: DEFAULT_FONT_ID,
        defaultOpacity: DEFAULT_OPACITY,
        styleField: (field) => this.ensureFieldStyle(field),
        renderText: (field) => this.getFieldRenderValue(field),
        resolveFont: (fontId) => this.fontCatalog.getFontOptionById(fontId),
      });

      this.rememberPdfBytes(sourceBytes, 3);
      downloadBlob(new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' }), 'annotated.pdf');
    } catch (error) {
      console.error('No se pudo generar el PDF anotado.', error);
      this.toast.error(this.translationService.translate('toast.exportPdfFailed'));
    }
  }

  private async getPdfByteCandidates(): Promise<Uint8Array[]> {
    if (this.pdfDoc) {
      if (typeof this.pdfDoc.saveDocument === 'function') {
        try {
          const sanitized = await this.pdfDoc.saveDocument();
          this.rememberPdfBytes(sanitized, 2);
        } catch (error) {
          console.warn('No se pudo obtener una versión saneada del PDF para exportar.', error);
        }
      }

      try {
        const rawData = await this.pdfDoc.getData();
        this.rememberPdfBytes(rawData, 1);
      } catch (error) {
        console.warn('No se pudo obtener los bytes originales del PDF para exportar.', error);
      }
    }

    if (this.pdfByteSources.size === 0) {
      return [];
    }

    return Array.from(this.pdfByteSources.values())
      .sort((a, b) => b.weight - a.weight)
      .map((entry) => entry.bytes.slice());
  }


  private rememberPdfBytes(data?: Uint8Array | ArrayBuffer | null, weight = 0) {
    if (!data) return;
    const typed = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!typed.length) return;
    const head = Array.from(typed.slice(0, 16)).join(',');
    const key = `${typed.length}:${head}`;
    const existing = this.pdfByteSources.get(key);
    if (!existing || weight >= existing.weight) {
      this.pdfByteSources.set(key, { bytes: typed.slice(), weight });
    }
  }

  private syncCoordsTextModel(persist = true) {
    const currentCoords = this.coords();
    this.coordsTextModel = JSON.stringify(this.buildJsonExportPayload(currentCoords), null, 2);
    this.refreshJsonPreview();
    if (persist) {
      this.templatesService.storeLastCoords(currentCoords);
    }
  }

  private snapshotCoords(pages: PageAnnotations[] = this.coords()): PageAnnotations[] {
    return this.store.snapshot(pages);
  }

  private buildJsonExportPayload(pages: PageAnnotations[]): {
    pages: Array<{ num: number; fields: Array<Record<string, unknown>> }>;
  } {
    return {
      pages: pages.map((page) => this.serializePageForJson(page)),
    };
  }

  private serializePageForJson(
    page: PageAnnotations
  ): { num: number; fields: Array<Record<string, unknown>> } {
    return {
      num: page.num,
      fields: page.fields.map((field) => this.serializeFieldForJson(field)),
    };
  }

  private serializeFieldForJson(field: PageField): Record<string, unknown> {
    const sanitized = this.prepareFieldForStorage(field);

    if (this.includeAdvancedJsonFields()) {
      return { ...sanitized };
    }

    return {
      x: sanitized.x,
      y: sanitized.y,
      mapField: sanitized.mapField,
      fontSize: sanitized.fontSize,
      type: sanitized.type,
    };
  }

  private applyCoordsChange(mutator: () => void, options?: { coalesceKey?: string }): boolean {
    return this.store.applyChange(mutator, options);
  }

  private replaceCoords(
    newCoords: PageAnnotations[],
    options?: { skipHistory?: boolean; preserveTextModel?: boolean }
  ) {
    const snapshot = this.snapshotCoords(newCoords);
    this.selection.set(null);
    if (options?.skipHistory) {
      this.coords.set(snapshot);
    } else {
      this.applyCoordsChange(() => this.coords.set(snapshot));
    }
    this.preview.set(null);
    this.editing.set(null);
    if (options?.preserveTextModel) {
      this.refreshJsonPreview();
    } else {
      this.syncCoordsTextModel();
    }
    this.redrawAllForPage();
  }

  private resetHistory() {
    this.store.resetHistory();
  }


  private areFieldsEqual(a: PageField, b: PageField): boolean {
    const sanitizedA = this.prepareFieldForStorage(a);
    const sanitizedB = this.prepareFieldForStorage(b);

    return (
      sanitizedA.x === sanitizedB.x &&
      sanitizedA.y === sanitizedB.y &&
      sanitizedA.mapField === sanitizedB.mapField &&
      sanitizedA.fontSize === sanitizedB.fontSize &&
      sanitizedA.color === sanitizedB.color &&
      sanitizedA.type === sanitizedB.type &&
      (sanitizedA.value ?? undefined) === (sanitizedB.value ?? undefined) &&
      (sanitizedA.appender ?? undefined) === (sanitizedB.appender ?? undefined) &&
      (sanitizedA.decimals ?? undefined) === (sanitizedB.decimals ?? undefined) &&
      (sanitizedA.fontFamily ?? DEFAULT_FONT_ID) === (sanitizedB.fontFamily ?? DEFAULT_FONT_ID) &&
      (sanitizedA.opacity ?? DEFAULT_OPACITY) === (sanitizedB.opacity ?? DEFAULT_OPACITY) &&
      (sanitizedA.backgroundColor ?? null) === (sanitizedB.backgroundColor ?? null) &&
      (sanitizedA.locked ?? false) === (sanitizedB.locked ?? false) &&
      (sanitizedA.hidden ?? false) === (sanitizedB.hidden ?? false)
    );
  }

  private refreshJsonPreview() {
    this.jsonTreePreview = this.buildJsonTreePreview(this.coordsTextModel);
  }

  private buildJsonTreePreview(text: string): JsonTreePreview {
    if (!text.trim()) {
      return { status: 'empty', value: null };
    }

    try {
      const parsed = parseLooseJson(text);
      const pages = extractPagesCollection(parsed);
      const fieldCount = Array.isArray(pages)
        ? pages.reduce<number>((total, page) => {
            const fields = (page as { fields?: unknown } | null)?.fields;
            return total + (Array.isArray(fields) ? fields.length : 0);
          }, 0)
        : 0;
      return { status: 'ready', value: parsed, hasPages: Array.isArray(pages), fieldCount };
    } catch (error) {
      const errorAt =
        error instanceof LooseJsonError ? { line: error.line, column: error.column } : undefined;
      return { status: 'error', value: null, errorAt };
    }
  }

  /**
   * After an explicit import/apply, warns about what was skipped or looks wrong. The import itself
   * is never altered: these are hints so the user can fix the JSON.
   */
  private async reportImportIssues(report: ImportReport, pages: PageAnnotations[]) {
    let outOfPage = 0;
    let missingPages = 0;
    const doc = this.pdfDoc;
    if (doc) {
      for (const page of pages) {
        if (page.num > doc.numPages) {
          missingPages += 1;
          continue;
        }
        const { width, height } = (await doc.getPage(page.num)).getViewport({ scale: 1 });
        outOfPage += page.fields.filter(
          (field) => field.x < 0 || field.y < 0 || field.x > width || field.y > height
        ).length;
      }
    }

    const t = (key: string, count: number) =>
      this.translationService.translate(`toast.importIssues.${key}`, { count });
    const parts: string[] = [];
    if (report.skippedFields) parts.push(t('skippedFields', report.skippedFields));
    if (report.skippedPages) parts.push(t('skippedPages', report.skippedPages));
    if (missingPages) parts.push(t('missingPages', missingPages));
    if (outOfPage) parts.push(t('outOfPage', outOfPage));
    if (report.fontSizeOutOfRange) parts.push(t('fontSize', report.fontSizeOutOfRange));
    if (report.opacityOutOfRange) parts.push(t('opacity', report.opacityOutOfRange));
    if (!parts.length) {
      return;
    }

    const title = this.translationService.translate('toast.importIssues.title');
    this.toast.warning(`${title} ${parts.join('; ')}.`);
  }

  /** Shows why a JSON import failed, with the line/column when the syntax is at fault. */
  private reportJsonImportError(error: unknown) {
    if (error instanceof LooseJsonError) {
      this.toast.error(
        this.translationService.translate('toast.importJsonFailedAt', {
          line: error.line,
          column: error.column,
        })
      );
      return;
    }

    const key = error instanceof JsonShapeError ? 'toast.importJsonNoPages' : 'toast.importJsonFailed';
    this.toast.error(this.translationService.translate(key));
  }






  private isEditableElement(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) {
      return false;
    }

    if (el.isContentEditable) {
      return true;
    }

    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea' || tag === 'select') {
      return true;
    }

    if (tag === 'input') {
      const input = el as HTMLInputElement;
      const type = input.type?.toLowerCase();
      const nonEditableTypes = new Set([
        'button',
        'checkbox',
        'radio',
        'range',
        'color',
        'submit',
        'reset',
      ]);
      return !nonEditableTypes.has(type);
    }

    return false;
  }

  private roundToTwo(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
