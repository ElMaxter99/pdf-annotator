import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  computed,
  AfterViewChecked,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, Validators } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import type { PdfLibFontkit } from '@pdf-lib/fontkit';
import { Language, TranslationService } from '../../i18n/translation.service';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../app-version';
import '../../promise-with-resolvers.polyfill';
import '../../array-buffer-transfer.polyfill';
import { FieldType, PageAnnotations, PageField } from '../../models/annotation.model';
import { AnnotationTemplate } from '../../models/annotation-template.model';
import { AnnotationTemplatesService } from '../../annotation-templates.service';
import {
  DEFAULT_GUIDE_SETTINGS,
  GuideSettings,
  cloneGuideSettings,
  differsFromDefaultGuideSettings,
} from '../../models/guide-settings.model';
import { WorkspaceHeaderComponent } from './components/header/workspace-header.component';
import { WorkspaceSidebarComponent } from './components/sidebar/workspace-sidebar.component';
import { WorkspaceViewerComponent } from './components/viewer/workspace-viewer.component';
import { WorkspaceFooterComponent } from './components/footer/workspace-footer.component';
import { PageThumbnail } from '../../models/page-thumbnail.model';
import {
  STANDARD_FONT_FAMILIES,
  StandardFontFamilyDefinition,
  StandardFontName,
} from '../../fonts/standard-font-families';
import { PendingFileService } from '../../services/pending-file.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { SessionService, SessionState, WorkspaceSummary, CloudUser } from '../../services/session.service';
import { take } from 'rxjs';

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
}

type OverlayGuide = {
  orientation: 'horizontal' | 'vertical';
  position: number;
  highlighted?: boolean;
};

type FontVariantDescriptor =
  | { kind: 'standard'; name: StandardFontName }
  | { kind: 'custom'; fontId: string };

type FontOptionType = 'standard' | 'custom';

interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly type: FontOptionType;
  readonly cssFamily: string;
  readonly descriptor: FontVariantDescriptor;
}

interface CustomFontEntry {
  readonly id: string;
  readonly name: string;
  readonly cssName: string;
  readonly data: Uint8Array;
}

interface FontDropdownUiState {
  readonly open: boolean;
  readonly query: string;
}

const DEFAULT_FONT_ID = 'standard:helvetica';
const DEFAULT_OPACITY = 1;

@Component({
  selector: 'app-workspace-page',
  standalone: true,
  templateUrl: './workspace.page.html',
  styleUrls: ['./workspace.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    WorkspaceHeaderComponent,
    WorkspaceSidebarComponent,
    WorkspaceViewerComponent,
    WorkspaceFooterComponent,
  ],
})
export class WorkspacePageComponent implements OnInit, AfterViewChecked, OnDestroy {
  private static fontkitPromise: Promise<PdfLibFontkit> | null = null;
  pdfDoc: PDFDocumentProxy | null = null;
  readonly vm: WorkspacePageComponent;
  pageIndex = signal(1);
  scale = signal(1.5);
  coords = signal<PageAnnotations[]>([]);
  private readonly undoStack = signal<PageAnnotations[][]>([]);
  private readonly redoStack = signal<PageAnnotations[][]>([]);
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
  customFontsFeatureEnabled = signal(false);
  customFonts = signal<CustomFontEntry[]>([]);
  private readonly fontDropdownState = signal<Record<EditorMode, FontDropdownUiState>>({
    preview: { open: false, query: '' },
    edit: { open: false, query: '' },
  });
  private pendingFontSearchFocus: EditorMode | null = null;
  readonly fontOptions = computed<readonly FontOption[]>(() => this.buildFontOptions());
  guideSettings = signal<GuideSettings>(cloneGuideSettings(DEFAULT_GUIDE_SETTINGS));
  snapPointsXText = signal('');
  snapPointsYText = signal('');
  fileDropActive = signal(false);
  readonly jsonViewMode = signal<JsonViewMode>('text');
  private readonly translationService = inject(TranslationService);
  private readonly document = inject(DOCUMENT);
  private readonly templatesService = inject(AnnotationTemplatesService);
  private readonly metadataService = inject(AppMetadataService);
  private readonly pendingFileService = inject(PendingFileService);
  private readonly sessionService = inject(SessionService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
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
  readonly sessionState = signal<SessionState>(this.sessionService.getSnapshot());
  readonly sessionLoading = computed(() => this.sessionState().status === 'authenticating');
  readonly availableWorkspaces = computed(() => this.sessionState().workspaces);
  readonly loginForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  readonly defaultFontId = DEFAULT_FONT_ID;
  private readonly coordsFileInputChangeHandler = (event: Event) =>
    this.onCoordsFileSelected(event);
  private coordsFileInputFallback: HTMLInputElement | null = null;

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
  private pdfByteSources = new Map<string, { bytes: Uint8Array; weight: number }>();
  private overlayDragRect: { left: number; top: number; width: number; height: number } | null =
    null;
  private overlayGuides: OverlayGuide[] = [];
  private clipboard: PageField | null = null;

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

  private static async loadFontkit(): Promise<PdfLibFontkit> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('fontkit solo puede cargarse en el navegador.');
    }

    if (!WorkspacePageComponent.fontkitPromise) {
      WorkspacePageComponent.fontkitPromise = import('@pdf-lib/fontkit')
        .then((module) => (module.default ?? module) as PdfLibFontkit)
        .catch((error) => {
          WorkspacePageComponent.fontkitPromise = null;
          throw error;
        });
    }

    return WorkspacePageComponent.fontkitPromise;
  }


  constructor() {
    this.vm = this;
    this.setDocumentMetadata();
    const storedTemplates = this.templatesService.getTemplates();
    this.templates.set(storedTemplates);
    this.templatesService.templates$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((templates) => {
        this.templates.set(templates);
        if (this.selectedTemplateId && !templates.some((template) => template.id === this.selectedTemplateId)) {
          this.selectedTemplateId = templates[0]?.id ?? null;
        } else if (!this.selectedTemplateId && templates.length) {
          this.selectedTemplateId = templates[0].id;
        }
      });

    this.sessionService.session$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((session) => this.sessionState.set(session));

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
    if (pendingFile) {
      this.loadPdfFile(pendingFile).catch((error) =>
        console.error('No se pudo cargar el PDF pendiente.', error)
      );
    }
  }

  ngOnDestroy() {
    this.revokeThumbnailUrls();
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

  submitLogin() {
    if (this.sessionLoading()) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.sessionService
      .login({ email, password })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.loginForm.reset({ email: '', password: '' });
          this.sessionService
            .refreshWorkspaces()
            .pipe(take(1))
            .subscribe({
              error: (error) =>
                console.error('No se pudieron actualizar los espacios de trabajo.', error),
            });
        },
        error: (error) => console.error('No se pudo iniciar sesión.', error),
      });
  }

  logoutSession() {
    this.sessionService.logout();
    this.templatesService.refreshFromCloud();
  }

  refreshSharedWorkspaces() {
    this.sessionService
      .refreshWorkspaces()
      .pipe(take(1))
      .subscribe({
        error: (error) =>
          console.error('No se pudieron actualizar los espacios de trabajo.', error),
      });
  }

  onWorkspaceSelected(workspaceId: string) {
    this.sessionService.selectWorkspace(workspaceId || null);
  }

  sessionWorkspaceLabel(workspace: WorkspaceSummary): string {
    const roleLabel = this.translationService.translate(
      `sidebar.session.role.${workspace.role}`
    );
    return `${workspace.name} · ${roleLabel}`;
  }

  sessionAvatar(user: CloudUser | null): string {
    if (!user) {
      return '👤';
    }
    const base = (user.name || user.email || '').trim();
    if (!base) {
      return '👤';
    }
    return base.charAt(0).toUpperCase();
  }

  sessionUserName(user: CloudUser | null): string {
    if (!user) {
      return '';
    }
    return user.name?.trim() || user.email;
  }

  sessionUserEmail(user: CloudUser | null): string {
    return user?.email ?? '';
  }

  setFieldFont(mode: EditorMode, fontId: string) {
    if (mode === 'edit') {
      const editState = this.editing();
      if (editState?.field.locked) {
        return;
      }
    }
    const normalized = this.normalizeFontFamily(fontId);
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
    return this.getFontOptionById(this.normalizeFontFamily(fontId));
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
      alert(this.translationService.translate('fonts.custom.unsupported'));
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
    const optionId = this.toCustomFontOptionId(id);
    const previousFonts = this.customFonts();
    if (!previousFonts.some((font) => font.id === id)) {
      return;
    }

    this.customFonts.set(previousFonts.filter((font) => font.id !== id));
    this.handleRemovedFontOptions([optionId]);
  }

  canUndo() {
    return this.undoStack().length > 0;
  }

  canRedo() {
    return this.redoStack().length > 0;
  }

  undo() {
    const undoStates = this.undoStack();
    if (!undoStates.length) {
      return;
    }

    const previous = undoStates[undoStates.length - 1];
    const currentSnapshot = this.snapshotCoords();

    this.undoStack.update((stack) => stack.slice(0, -1));
    this.redoStack.update((stack) => [...stack, currentSnapshot]);

    this.coords.set(this.snapshotCoords(previous));
    this.preview.set(null);
    this.editing.set(null);
    this.syncCoordsTextModel();
    this.redrawAllForPage();
  }

  redo() {
    const redoStates = this.redoStack();
    if (!redoStates.length) {
      return;
    }

    const next = redoStates[redoStates.length - 1];
    const currentSnapshot = this.snapshotCoords();

    this.redoStack.update((stack) => stack.slice(0, -1));
    this.undoStack.update((stack) => [...stack, currentSnapshot]);

    this.coords.set(this.snapshotCoords(next));
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
    const removedOptionIds = removedFonts.map((font) => this.toCustomFontOptionId(font.id));
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
    const numeric = this.toFiniteNumber(rawValue);
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
      .map((token) => this.toFiniteNumber(token))
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

  private async loadPdfFile(file: File) {
    if (!isPdfFile(file)) {
      alert(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }

    this.pdfByteSources.clear();
    const buf = await file.arrayBuffer();
    const typed = new Uint8Array(buf);
    this.rememberPdfBytes(typed, 0);

    const loadingTask = pdfjsLib.getDocument({ data: typed });
    const loadedPdf = await loadingTask.promise;
    this.pdfDoc = loadedPdf;

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
    await this.render();
    this.generatePageThumbnails().catch((error) =>
      console.error('No se pudieron generar las miniaturas del documento.', error)
    );
    this.fileDropActive.set(false);
  }

  async render() {
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

  onHitboxClick(evt: MouseEvent) {
    if (!this.pdfDoc || this.editing()) return;
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

  private normalizeColor(color: string) {
    if (color.startsWith('#')) {
      const hex =
        color.length === 4
          ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
          : color;
      return hex.toLowerCase();
    }

    const match = color.match(
      /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i
    );
    if (!match) return color;

    const [, r, g, b] = match;
    const toHex = (value: string) => {
      const num = Math.max(0, Math.min(255, parseInt(value, 10)));
      return num.toString(16).padStart(2, '0');
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private normalizeHexInput(value: string) {
    const trimmed = value.trim();
    const match = trimmed.match(/^#?([a-f\d]{3}|[a-f\d]{6})$/i);
    if (!match) return null;
    let hex = match[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    return `#${hex.toLowerCase()}`;
  }

  private parseRgbText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    const fallbackMatch = trimmed.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
    const match = rgbMatch ?? fallbackMatch;
    if (!match) return null;
    const [, r, g, b] = match;
    const clamp = (num: number) => Math.max(0, Math.min(255, num));
    return {
      r: clamp(parseInt(r, 10)),
      g: clamp(parseInt(g, 10)),
      b: clamp(parseInt(b, 10)),
    };
  }

  private rgbToHex(rgb: { r: number; g: number; b: number }) {
    const toHex = (num: number) => num.toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  private parseColorComponents(color: string) {
    const hex = this.normalizeHexInput(color);
    if (hex) {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      };
    }

    const match = color.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (!match) return null;
    return {
      r: Math.max(0, Math.min(255, parseInt(match[1], 10))),
      g: Math.max(0, Math.min(255, parseInt(match[2], 10))),
      b: Math.max(0, Math.min(255, parseInt(match[3], 10))),
    };
  }

  private toRgbString(color: string) {
    const comps = this.parseColorComponents(color);
    if (!comps) return '';
    return `rgb(${comps.r}, ${comps.g}, ${comps.b})`;
  }

  private ensureHex(color: string) {
    const normalized = this.normalizeColor(color);
    return normalized.startsWith('#') ? normalized : null;
  }

  private updatePreviewColorState(color: string) {
    const hex = this.ensureHex(color);
    if (hex) {
      this.previewHexInput.set(hex);
      this.previewRgbInput.set(this.toRgbString(hex));
    } else {
      this.previewHexInput.set(color.trim());
      this.previewRgbInput.set(this.toRgbString(color));
    }
  }

  private updateEditingColorState(color: string) {
    const hex = this.ensureHex(color);
    if (hex) {
      this.editHexInput.set(hex);
      this.editRgbInput.set(this.toRgbString(hex));
    } else {
      this.editHexInput.set(color.trim());
      this.editRgbInput.set(this.toRgbString(color));
    }
  }

  setPreviewColorFromHex(value: string) {
    this.previewHexInput.set(value);
    const normalized = this.normalizeHexInput(value);
    if (!normalized) return;
    this.preview.update((p) => (p ? { ...p, field: { ...p.field, color: normalized } } : p));
    this.updatePreviewColorState(normalized);
  }

  setPreviewColorFromRgb(value: string) {
    this.previewRgbInput.set(value);
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
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
    const normalized = this.normalizeHexInput(value);
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
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
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
        this.coords.update((pages) => this.addFieldToPages(p.page, normalizedField, pages))
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
    const sanitized = this.prepareFieldForStorage(field);
    if (this.fieldRequiresStorageUpdate(field, sanitized)) {
      if (
        this.applyCoordsChange(() =>
          this.coords.update((pages) =>
            this.updateFieldInPages(pageIndex, fieldIndex, sanitized, pages)
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
          this.updateFieldInPages(e.pageIndex, e.fieldIndex, normalized, pages)
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
        this.coords.update((pages) => this.removeFieldFromPages(e.pageIndex, e.fieldIndex, pages))
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
        const updated = this.addFieldToPages(pageNum, newField, pages);
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

    const type = this.normalizeFieldType(field.type);
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
    const type = this.normalizeFieldType(styled.type);
    const base: PageField = {
      x: styled.x,
      y: styled.y,
      mapField: typeof styled.mapField === 'string' ? styled.mapField : '',
      fontSize: styled.fontSize,
      color: this.normalizeColor(styled.color),
      type,
      fontFamily: styled.fontFamily ?? DEFAULT_FONT_ID,
      opacity: styled.opacity ?? DEFAULT_OPACITY,
      backgroundColor: styled.backgroundColor ?? null,
      locked: !!styled.locked,
      hidden: !!styled.hidden,
    };

    const value = this.sanitizeTextPreservingSpacing(styled.value);
    if (value !== undefined) {
      base.value = value;
    }

    if (type === 'number') {
      const decimals = this.normalizeFieldDecimals(styled.decimals);
      if (decimals !== undefined) {
        base.decimals = decimals;
      }
      const appender = this.sanitizeOptionalAppender(styled.appender);
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

  private normalizeFieldType(value: unknown): FieldType {
    if (typeof value === 'string') {
      const normalized = value.toLowerCase();
      if (
        normalized === 'check' ||
        normalized === 'radio' ||
        normalized === 'number' ||
        normalized === 'text'
      ) {
        return normalized as FieldType;
      }
    }
    return 'text';
  }

  private sanitizeTextPreservingSpacing(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    return value.trim() ? value : undefined;
  }

  private sanitizeOptionalAppender(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    return value.trim() ? value : undefined;
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

  private buildFontOptions(): FontOption[] {
    const standardOptions = STANDARD_FONT_FAMILIES.map(
      (family): FontOption => ({
        id: `standard:${family.id}`,
        label: family.label,
        type: 'standard',
        cssFamily: family.cssFamily,
        descriptor: { kind: 'standard', name: family.pdfName },
      })
    );

    const customEnabled = this.customFontsFeatureEnabled();
    const customOptions = customEnabled
      ? this.customFonts().map(
          (font): FontOption => ({
            id: this.toCustomFontOptionId(font.id),
            label: font.name,
            type: 'custom',
            cssFamily: `"${font.cssName}"`,
            descriptor: { kind: 'custom', fontId: font.id },
          })
        )
      : [];

    return [...standardOptions, ...customOptions];
  }

  private toCustomFontOptionId(fontId: string): string {
    return `custom:${fontId}`;
  }

  private getFontOptionById(fontId: string): FontOption {
    const normalized = this.normalizeFontFamily(fontId);
    const option = this.fontOptions().find((item) => item.id === normalized);
    if (option) {
      return option;
    }
    const fallback = this.fontOptions().find((item) => item.id === DEFAULT_FONT_ID);
    if (!fallback) {
      throw new Error('Default font option is not available.');
    }
    return fallback;
  }

  private normalizeFontFamily(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        const options = this.fontOptions();
        if (options.some((option) => option.id === trimmed)) {
          return trimmed;
        }
      }
    }
    return DEFAULT_FONT_ID;
  }

  private collectFontFamilyCandidates(rawField: Record<string, unknown>): unknown[] {
    const candidates: unknown[] = [];
    const push = (value: unknown) => {
      if (value !== undefined && value !== null) {
        candidates.push(value);
      }
    };

    const directKeys = [
      'fontFamily',
      'fontfamily',
      'font_family',
      'fontFamilyName',
      'font_family_name',
      'font',
      'fontName',
      'font_name',
      'familyName',
      'fontId',
      'font_id',
      'fontFamilyId',
      'font_family_id',
      'fontFace',
      'font_face',
      'fontType',
      'font_type',
      'typeface',
    ];

    for (const key of directKeys) {
      if (key in rawField) {
        push(rawField[key]);
      }
    }

    const style = rawField['style'];
    if (style && typeof style === 'object') {
      const styleRecord = style as Record<string, unknown>;
      push(styleRecord['fontFamily']);
      push(styleRecord['fontfamily']);
      push(styleRecord['font']);
      push(styleRecord['fontName']);
      push(styleRecord['font_name']);
    }

    const font = rawField['font'];
    if (font && typeof font === 'object') {
      const fontRecord = font as Record<string, unknown>;
      push(font);
      push(fontRecord['id']);
      push(fontRecord['name']);
      push(fontRecord['family']);
      push(fontRecord['value']);
      push(fontRecord['fontFamily']);
      push(fontRecord['font_name']);
    }

    const typography = (rawField as { typography?: unknown }).typography;
    if (typography && typeof typography === 'object') {
      const typographyRecord = typography as Record<string, unknown>;
      push(typographyRecord['fontFamily']);
      push(typographyRecord['font']);
      push(typographyRecord['name']);
    }

    const meta = (rawField as { meta?: unknown }).meta;
    if (meta && typeof meta === 'object') {
      const metaRecord = meta as Record<string, unknown>;
      const metaFont = metaRecord['font'];
      if (metaFont && typeof metaFont === 'object') {
        const metaFontRecord = metaFont as Record<string, unknown>;
        push(metaFontRecord['id']);
        push(metaFontRecord['name']);
        push(metaFontRecord['family']);
        push(metaFontRecord['fontFamily']);
      }
    }

    return candidates;
  }

  private resolveImportedFontFamily(...candidates: unknown[]): string | undefined {
    if (!candidates.length) {
      return undefined;
    }

    const options = this.fontOptions();
    if (!options.length) {
      return undefined;
    }

    const sanitize = (value: string) => value.toLowerCase();
    const canonical = (value: string) => sanitize(value).replace(/[^a-z0-9]/g, '');
    const visited = new Set<string>();

    const tryMatchOption = (input: string): string | undefined => {
      const normalized = sanitize(input);
      const simplified = canonical(input);

      for (const option of options) {
        if (option.id === input) {
          return option.id;
        }

        const optionIdNormalized = sanitize(option.id);
        if (optionIdNormalized === normalized || canonical(option.id) === simplified) {
          return option.id;
        }

        const labelNormalized = sanitize(option.label);
        if (labelNormalized === normalized || canonical(option.label) === simplified) {
          return option.id;
        }

        if (option.type === 'standard') {
          const baseId = option.id.replace(/^standard:/, '');
          const baseNormalized = sanitize(baseId);
          const baseCanonical = canonical(baseId);
          if (
            baseId === input ||
            baseNormalized === normalized ||
            baseCanonical === simplified ||
            (baseCanonical.length >= 3 && simplified.includes(baseCanonical))
          ) {
            return option.id;
          }
        }

        const labelCanonical = canonical(option.label);
        if (labelCanonical.length >= 3 && simplified.includes(labelCanonical)) {
          return option.id;
        }

        const cssParts = option.cssFamily
          .split(',')
          .map((part) => part.trim().replace(/^["'`]+|["'`]+$/g, ''))
          .filter(Boolean);
        for (const cssPart of cssParts) {
          const cssNormalized = sanitize(cssPart);
          if (cssNormalized === normalized || canonical(cssPart) === simplified) {
            return option.id;
          }
        }
      }

      return undefined;
    };

    const attemptString = (value: string): string | undefined => {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      if (visited.has(trimmed)) {
        return undefined;
      }
      visited.add(trimmed);

      const direct = tryMatchOption(trimmed);
      if (direct) {
        return direct;
      }

      if (trimmed.includes(',')) {
        for (const part of trimmed.split(',')) {
          const result = attemptString(part.replace(/^["'`]+|["'`]+$/g, ''));
          if (result) {
            return result;
          }
        }
      }

      const unquoted = trimmed.replace(/^["'`]+|["'`]+$/g, '');
      if (unquoted !== trimmed) {
        const result = attemptString(unquoted);
        if (result) {
          return result;
        }
      }

      return undefined;
    };

    const attempt = (value: unknown): string | undefined => {
      if (value === null || value === undefined) {
        return undefined;
      }

      if (typeof value === 'string') {
        return attemptString(value);
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return attemptString(String(value));
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const result = attempt(item);
          if (result) {
            return result;
          }
        }
        return undefined;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const objectCandidates: unknown[] = [];

        const candidateKeys = [
          'id',
          'value',
          'name',
          'label',
          'family',
          'font',
          'fontFamily',
          'fontFamilyId',
          'fontId',
          'font_id',
          'font_name',
          'fontFace',
          'css',
          'cssFamily',
        ];

        for (const key of candidateKeys) {
          if (key in record) {
            objectCandidates.push(record[key]);
          }
        }

        const recordType = record['type'];
        const recordName = record['name'];
        if (typeof recordType === 'string' && typeof recordName === 'string') {
          objectCandidates.push(`${recordType}:${recordName}`);
        }

        const recordKind = record['kind'];
        if (typeof recordKind === 'string' && typeof recordName === 'string') {
          objectCandidates.push(`${recordKind}:${recordName}`);
        }

        const recordAliases = record['aliases'];
        if (Array.isArray(recordAliases)) {
          objectCandidates.push(...recordAliases);
        }

        for (const candidate of objectCandidates) {
          const result = attempt(candidate);
          if (result) {
            return result;
          }
        }
      }

      return undefined;
    };

    for (const candidate of candidates) {
      const result = attempt(candidate);
      if (result) {
        return result;
      }
    }

    return undefined;
  }

  private normalizeOpacityValue(value: unknown): number | undefined {
    const numeric = this.toFiniteNumber(value);
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
    return this.normalizeColor(trimmed);
  }

  private ensureFieldStyle(field: PageField): PageField {
    const fontFamily = this.normalizeFontFamily(field.fontFamily);
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

  private resolveCssFontFamily(fontId: string): string {
    const option = this.getFontOptionById(fontId);
    return option.cssFamily;
  }

  private async registerCustomFont(file: File) {
    if (typeof FontFace === 'undefined') {
      alert(this.translationService.translate('fonts.custom.unsupported'));
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const fontId = this.createRuntimeId('font');
      const baseName = file.name.replace(/\.[^.]+$/, '') || file.name;
      const safeName = baseName.replace(/[^a-zA-Z0-9_-]+/g, '-');
      const cssName = `${safeName}-${fontId}`;
      const fontFace = new FontFace(cssName, buffer);
      await fontFace.load();
      if (this.document?.fonts) {
        this.document.fonts.add(fontFace);
      }

      const entry: CustomFontEntry = {
        id: fontId,
        name: baseName,
        cssName,
        data: new Uint8Array(buffer),
      };

      this.customFonts.update((fonts) => [entry, ...fonts.filter((font) => font.id !== entry.id)]);
    } catch (error) {
      console.error('No se pudo cargar la fuente personalizada.', error);
      alert(this.translationService.translate('fonts.custom.error'));
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
    return JSON.stringify(page, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
  }

  private buildFieldJsonBlock(field: PageField): string {
    return JSON.stringify(field, null, 2)
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

  private hexToRgbComponents(color: string): { r: number; g: number; b: number } | null {
    const normalized = this.normalizeColor(color);
    const hex = normalized.replace('#', '');
    if (hex.length !== 6) {
      return null;
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((value) => Number.isNaN(value))) {
      return null;
    }
    return { r, g, b };
  }

  private normalizeFieldDecimals(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const parsed = this.toFiniteNumber(value);
    if (parsed === null || parsed < 0) {
      return undefined;
    }
    return Math.round(parsed);
  }

  private getFieldRenderValue(field: PageField): string {
    const override =
      typeof field.value === 'string' && field.value.trim() ? field.value : undefined;
    if (override !== undefined) {
      return override;
    }

    const type = this.normalizeFieldType(field.type);
    if (type === 'check' || type === 'radio') {
      return 'X';
    }

    const baseText = typeof field.mapField === 'string' ? field.mapField : '';

    if (type === 'number') {
      const numeric = this.toFiniteNumber(baseText);
      if (numeric !== null) {
        const decimals = this.normalizeFieldDecimals(field.decimals);
        const formatted =
          decimals !== undefined ? this.formatNumberWithTruncation(numeric, decimals) : baseText;
        const appender = this.sanitizeOptionalAppender(field.appender) ?? '';
        return `${formatted}${appender}`;
      }
    }

    return baseText;
  }

  private addFieldToPages(
    pageNum: number,
    field: PageField,
    pages: PageAnnotations[]
  ): PageAnnotations[] {
    const pageIndex = pages.findIndex((page) => page.num === pageNum);
    if (pageIndex >= 0) {
      return pages.map((page, idx) =>
        idx === pageIndex ? { ...page, fields: [...page.fields, field] } : page
      );
    }
    return [...pages, { num: pageNum, fields: [field] }].sort((a, b) => a.num - b.num);
  }

  private updateFieldInPages(
    pageIndex: number,
    fieldIndex: number,
    field: PageField,
    pages: PageAnnotations[]
  ): PageAnnotations[] {
    return pages.map((page, idx) => {
      if (idx !== pageIndex) {
        return page;
      }
      if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
        return page;
      }
      const updatedFields = page.fields.map((item, itemIdx) =>
        itemIdx === fieldIndex ? { ...field } : item
      );
      return { ...page, fields: updatedFields };
    });
  }

  private removeFieldFromPages(
    pageIndex: number,
    fieldIndex: number,
    pages: PageAnnotations[]
  ): PageAnnotations[] {
    return pages
      .map((page, idx) => {
        if (idx !== pageIndex) {
          return page;
        }
        if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
          return page;
        }
        const updatedFields = page.fields.filter((_, i) => i !== fieldIndex);
        return { ...page, fields: updatedFields };
      })
      .filter((page) => page.fields.length > 0);
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
          el.style.fontFamily = this.resolveCssFontFamily(
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
          el.onpointerdown = isLocked
            ? (evt) => this.handleLockedAnnotationPointerDown(evt, pageIndex, fieldIndex)
            : (evt) => this.handleAnnotationPointerDown(evt, pageIndex, fieldIndex);
          layer.appendChild(el);

          this.runAfterRender(() => this.updateAnnotationLeft(el, styledField, scale));
        });
      });

    this.refreshOverlay();
  }

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

  clearAll(options?: { skipHistory?: boolean }) {
    this.replaceCoords([], options);
  }

  copyJSON() {
    navigator.clipboard.writeText(this.coordsTextModel).catch(() => {});
  }

  onCoordsTextChange(value: string) {
    this.coordsTextModel = value;
    this.refreshJsonPreview();
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
    const text = this.coordsTextModel.trim();

    if (!text) {
      this.clearAll();
      return;
    }

    try {
      const parsed = this.parseLooseJson(text);
      const normalized = this.normalizeImportedCoordinates(parsed);

      if (normalized === null) {
        throw new Error('Formato no válido');
      }

      this.replaceCoords(normalized);
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      alert('No se pudo importar el archivo JSON. Comprueba que el formato sea correcto.');
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
      const text = await file.text();
      const parsed = this.parseLooseJson(text);
      const normalized = this.normalizeImportedCoordinates(parsed);
      if (normalized === null) {
        throw new Error('Formato no válido');
      }

      this.replaceCoords(normalized);
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      alert('No se pudo importar el archivo JSON. Comprueba que el formato sea correcto.');
    } finally {
      input.value = '';
    }
  }

  downloadJSON() {
    const blob = new Blob([JSON.stringify({ pages: this.coords() }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coords.json';
    a.click();
    URL.revokeObjectURL(url);
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
    const clonedPages = this.clonePages(template.pages);
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

  private clonePages(pages: readonly PageAnnotations[]): PageAnnotations[] {
    return pages.map((page) => ({
      num: page.num,
      fields: page.fields.map((field) => ({ ...field })),
    }));
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
      const pdfLib = await import('pdf-lib');
      const { PDFDocument: PdfLibDocument, rgb, StandardFonts } = pdfLib;
      const loadOptions = {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
      } as const;

      const candidates = await this.getPdfByteCandidates();
      if (!candidates.length) {
        throw new Error('No se encontraron bytes de PDF para procesar.');
      }

      let pdf: InstanceType<typeof PdfLibDocument> | null = null;
      let usedBytes: Uint8Array | null = null;
      const loadErrors: unknown[] = [];

      for (const candidate of candidates) {
        try {
          pdf = await PdfLibDocument.load(candidate, loadOptions);
          usedBytes = candidate;
          break;
        } catch (error) {
          loadErrors.push(error);
        }
      }

      if (!pdf || !usedBytes) {
        throw new Error(
          `No se pudo cargar el PDF original (${loadErrors.length} intentos fallidos).`
        );
      }

      this.rememberPdfBytes(usedBytes, 3);
      const fontCache = new Map<string, any>();
      const customFontMap = new Map<string, CustomFontEntry>();
      this.customFonts().forEach((fontEntry) => customFontMap.set(fontEntry.id, fontEntry));
      const needsFontkit = customFontMap.size > 0;
      if (needsFontkit) {
        try {
          const fontkit = await WorkspacePageComponent.loadFontkit();
          if (typeof pdf.registerFontkit === 'function') {
            pdf.registerFontkit(fontkit);
          } else {
            console.warn('La instancia de PDFDocument no soporta registerFontkit.');
          }
        } catch (error) {
          console.error('No se pudo registrar fontkit para fuentes personalizadas.', error);
          throw error instanceof Error
            ? error
            : new Error('No se pudo inicializar fontkit para fuentes personalizadas.');
        }
      }
      const defaultFontOption = this.getFontOptionById(DEFAULT_FONT_ID);
      const defaultVariant = defaultFontOption.descriptor;
      const pdfPageCount = pdf.getPageCount();

      const getFontFromDescriptor = async (descriptor: FontVariantDescriptor): Promise<any> => {
        if (descriptor.kind === 'standard') {
          const cacheKey = `standard:${descriptor.name}`;
          if (!fontCache.has(cacheKey)) {
            fontCache.set(cacheKey, await pdf.embedFont(StandardFonts[descriptor.name]));
          }
          return fontCache.get(cacheKey);
        }

        const custom = customFontMap.get(descriptor.fontId);
        if (!custom) {
          return getFontFromDescriptor(defaultVariant);
        }

        const cacheKey = `custom:${descriptor.fontId}`;
        if (!fontCache.has(cacheKey)) {
          fontCache.set(cacheKey, await pdf.embedFont(custom.data, { subset: true }));
        }
        return fontCache.get(cacheKey);
      };

      for (const pageAnnotations of this.coords()) {
        const targetIndex = Math.trunc(pageAnnotations.num) - 1;
        if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= pdfPageCount) {
          console.warn(
            `Se ignoraron anotaciones para la página ${pageAnnotations.num} porque el PDF solo tiene ${pdfPageCount} páginas.`
          );
          continue;
        }

        const page = pdf.getPage(targetIndex);
        const fields = pageAnnotations.fields ?? [];

        for (const field of fields) {
          const styledField = this.ensureFieldStyle(field);
          if (styledField.hidden) {
            continue;
          }
          const text = this.getFieldRenderValue(styledField);
          const fontOption = this.getFontOptionById(styledField.fontFamily ?? DEFAULT_FONT_ID);
          const embeddedFont = await getFontFromDescriptor(fontOption.descriptor);
          const textColor = this.hexToRgbComponents(styledField.color) ?? { r: 0, g: 0, b: 0 };
          const opacity = styledField.opacity ?? DEFAULT_OPACITY;

          const drawX = styledField.x;
          const textWidth = embeddedFont.widthOfTextAtSize(text, styledField.fontSize);

          if (styledField.backgroundColor) {
            const bg = this.hexToRgbComponents(styledField.backgroundColor);
            if (bg) {
              const totalHeight = embeddedFont.heightAtSize(styledField.fontSize);
              const ascent = embeddedFont.heightAtSize(styledField.fontSize, { descender: false });
              const descent = totalHeight - ascent;
              if (textWidth > 0 && totalHeight > 0) {
                page.drawRectangle({
                  x: drawX,
                  y: styledField.y - descent,
                  width: textWidth,
                  height: totalHeight,
                  color: rgb(bg.r / 255, bg.g / 255, bg.b / 255),
                  opacity,
                });
              }
            }
          }

          if (text) {
            page.drawText(text, {
              x: drawX,
              y: styledField.y,
              size: styledField.fontSize,
              color: rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255),
              font: embeddedFont,
              opacity,
            });
          }
        }
      }

      const pdfBytes = await pdf.save({ useObjectStreams: false });
      const blob = new Blob([this.toArrayBuffer(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'annotated.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo generar el PDF anotado.', error);
      alert(
        'No se pudo generar el PDF anotado. Revisa que el archivo sea válido o intenta con otra copia.'
      );
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

  private toArrayBuffer(data: Uint8Array<ArrayBufferLike> | ArrayBuffer): ArrayBuffer {
    if (data instanceof Uint8Array) {
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      return copy.buffer;
    }
    return data;
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
    this.coordsTextModel = JSON.stringify({ pages: currentCoords }, null, 2);
    this.refreshJsonPreview();
    if (persist) {
      this.templatesService.storeLastCoords(currentCoords);
    }
  }

  private snapshotCoords(pages: PageAnnotations[] = this.coords()): PageAnnotations[] {
    return pages.map((page) => ({
      num: page.num,
      fields: page.fields.map((field) => ({ ...field })),
    }));
  }

  private applyCoordsChange(mutator: () => void): boolean {
    const previous = this.snapshotCoords();
    mutator();
    const changed = !this.areCoordsEqual(previous, this.coords());
    if (changed) {
      this.undoStack.update((stack) => [...stack, previous]);
      this.redoStack.set([]);
    }
    return changed;
  }

  private replaceCoords(newCoords: PageAnnotations[], options?: { skipHistory?: boolean }) {
    const snapshot = this.snapshotCoords(newCoords);
    if (options?.skipHistory) {
      this.coords.set(snapshot);
    } else {
      this.applyCoordsChange(() => this.coords.set(snapshot));
    }
    this.preview.set(null);
    this.editing.set(null);
    this.syncCoordsTextModel();
    this.redrawAllForPage();
  }

  private resetHistory() {
    this.undoStack.set([]);
    this.redoStack.set([]);
  }

  private areCoordsEqual(a: PageAnnotations[], b: PageAnnotations[]): boolean {
    if (a.length !== b.length) {
      return false;
    }

    for (let i = 0; i < a.length; i += 1) {
      const pageA = a[i];
      const pageB = b[i];
      if (!pageB || pageA.num !== pageB.num) {
        return false;
      }

      if (pageA.fields.length !== pageB.fields.length) {
        return false;
      }

      for (let j = 0; j < pageA.fields.length; j += 1) {
        const fieldA = pageA.fields[j];
        const fieldB = pageB.fields[j];
        if (!fieldB || !this.areFieldsEqual(fieldA, fieldB)) {
          return false;
        }
      }
    }

    return true;
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
    const trimmed = text.trim();

    if (!trimmed) {
      return { status: 'empty', value: null };
    }

    try {
      const parsed = this.parseLooseJson(trimmed);
      return { status: 'ready', value: parsed };
    } catch {
      return { status: 'error', value: null };
    }
  }

  private parseLooseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      const sanitized = this.escapeMultilineStrings(text);
      try {
        // eslint-disable-next-line no-new-func
        return Function('"use strict";return (' + sanitized + ')')();
      } catch (looseError) {
        throw looseError;
      }
    }
  }

  private escapeMultilineStrings(text: string): string {
    let sanitized = '';
    let mode: 'none' | 'single' | 'double' | 'template' = 'none';
    let escapeNext = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (escapeNext) {
        sanitized += char;
        escapeNext = false;
        continue;
      }

      if (mode === 'single') {
        if (char === '\\') {
          sanitized += char;
          escapeNext = true;
          continue;
        }

        if (char === '\n') {
          sanitized += '\\n';
          continue;
        }

        if (char === '\r') {
          continue;
        }

        sanitized += char;

        if (char === "'") {
          mode = 'none';
        }
        continue;
      }

      if (mode === 'double') {
        if (char === '\\') {
          sanitized += char;
          escapeNext = true;
          continue;
        }

        if (char === '\n') {
          sanitized += '\\n';
          continue;
        }

        if (char === '\r') {
          continue;
        }

        sanitized += char;

        if (char === '"') {
          mode = 'none';
        }
        continue;
      }

      if (mode === 'template') {
        sanitized += char;

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '`') {
          mode = 'none';
        }
        continue;
      }

      sanitized += char;

      if (char === "'") {
        mode = 'single';
        continue;
      }

      if (char === '"') {
        mode = 'double';
        continue;
      }

      if (char === '`') {
        mode = 'template';
      }
    }

    return sanitized;
  }

  private normalizeImportedCoordinates(data: unknown): PageAnnotations[] | null {
    const pagesData = this.extractPagesCollection(data);
    if (!Array.isArray(pagesData)) {
      return null;
    }

    const normalized: PageAnnotations[] = [];

    for (const rawPage of pagesData) {
      if (!rawPage || typeof rawPage !== 'object') {
        continue;
      }

      const pageNum = this.toFiniteNumber((rawPage as { num?: unknown }).num);
      if (!pageNum || !Number.isInteger(pageNum) || pageNum < 1) {
        continue;
      }

      const rawFields = (rawPage as { fields?: unknown }).fields;
      if (!Array.isArray(rawFields)) {
        continue;
      }

      const fields: PageField[] = [];

      for (const rawField of rawFields) {
        if (!rawField || typeof rawField !== 'object') {
          continue;
        }

        const { x, y, mapField, fontSize, color, value, type, decimals, appender } =
          rawField as Record<string, unknown>;

        const normalizedType = this.normalizeFieldType(type);
        const normalizedValue = this.normalizeFieldText(value);
        const normalizedMapField = this.normalizeFieldText(mapField) ?? normalizedValue;
        const normalizedX = this.toFiniteNumber(x);
        const normalizedY = this.toFiniteNumber(y);

        if (normalizedX === null || normalizedY === null) {
          continue;
        }

        if (
          normalizedMapField === null &&
          normalizedValue === null &&
          normalizedType !== 'check' &&
          normalizedType !== 'radio'
        ) {
          continue;
        }

        const normalizedFontSize = this.toFiniteNumber(fontSize);
        const normalizedColor =
          typeof color === 'string' && color.trim() ? color.trim() : '#000000';

        const normalizedField: PageField = {
          x: Math.round(normalizedX * 100) / 100,
          y: Math.round(normalizedY * 100) / 100,
          mapField: normalizedMapField ?? '',
          fontSize:
            normalizedFontSize && normalizedFontSize > 0
              ? Math.round(normalizedFontSize * 100) / 100
              : 14,
          color: this.normalizeColor(normalizedColor),
          type: normalizedType,
        };

        if (normalizedValue !== null) {
          normalizedField.value = normalizedValue;
        }

        if (normalizedType === 'number') {
          const normalizedDecimals = this.normalizeFieldDecimals(decimals);
          if (normalizedDecimals !== undefined) {
            normalizedField.decimals = normalizedDecimals;
          }
          const normalizedAppender = this.sanitizeOptionalAppender(appender);
          if (normalizedAppender !== undefined) {
            normalizedField.appender = normalizedAppender;
          }
        }

        const rawOpacity = (rawField as { opacity?: unknown }).opacity;
        const rawBackground = (rawField as { backgroundColor?: unknown }).backgroundColor;
        const fontCandidates = this.collectFontFamilyCandidates(rawField as Record<string, unknown>);

        const styledField = this.prepareFieldForStorage({
          ...normalizedField,
          fontFamily: this.resolveImportedFontFamily(...fontCandidates),
          opacity: rawOpacity as number | string | undefined,
          backgroundColor: typeof rawBackground === 'string' ? rawBackground : undefined,
        } as PageField);

        fields.push(styledField);
      }

      if (fields.length) {
        normalized.push({ num: pageNum, fields });
      }
    }

    normalized.sort((a, b) => a.num - b.num);
    return normalized;
  }

  private extractPagesCollection(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data;
    }

    if (data && typeof data === 'object') {
      const maybePages = (data as { pages?: unknown }).pages;
      if (Array.isArray(maybePages)) {
        return maybePages;
      }
    }

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private formatNumberWithTruncation(value: number, decimals: number): string {
    const factor = 10 ** decimals;
    const truncated = Math.trunc(value * factor) / factor;
    return truncated.toFixed(decimals);
  }

  private normalizeFieldText(value: unknown): string | null {
    if (Array.isArray(value)) {
      for (const item of value) {
        const normalized = this.normalizeFieldText(item);
        if (normalized !== null) {
          return normalized;
        }
      }
      return null;
    }

    let source: string | null = null;

    if (typeof value === 'string') {
      source = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      source = String(value);
    } else if (typeof value === 'boolean') {
      source = value ? 'true' : 'false';
    }

    if (!source) {
      return null;
    }

    const collapsed = source
      .replace(/\r\n?/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!collapsed) {
      return null;
    }

    if (/[\.\[\]]/.test(collapsed)) {
      return collapsed.replace(/\s*([\.\[\]])\s*/g, '$1');
    }

    return collapsed;
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
