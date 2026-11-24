import {
  OverlayGuide,
  OverlayRect,
  SnapBounds,
  computeSnapping,
  drawActiveGuides,
  drawGrid,
  drawRulers,
  drawStaticGuides,
} from '../../utils/guides.utils';
import {
  DEFAULT_OPACITY,
  areFieldsEqual,
  ensureFieldStyle,
  fieldHasRenderableContent,
  normalizeBackgroundColor,
  normalizeOpacityValue,
  prepareFieldForForm,
  prepareFieldForStorage,
} from '../../utils/field-style.utils';
import {
  JsonTreePreview,
  buildJsonTreePreview,
  isEditableElement,
  parseNumericList,
  serializeFieldForJson,
} from '../../utils/json-text.utils';
import { ZOOM_PRESETS, type ViewerClick, type ZoomLimit } from '../../utils/zoom.utils';
import { initialWheelPageState, type WheelPageState } from '../../utils/wheel-page.utils';
import { AiHelperService } from '../../services/ai-helper.service';
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
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import './pdf-worker.setup';
import { Language, TranslationService } from '../../i18n/translation.service';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from '../../app-version';
import '../../promise-with-resolvers.polyfill';
import '../../array-buffer-transfer.polyfill';
import { PageAnnotations, PageField } from '../../models/annotation.model';
import { PageSize, sizesDiffer } from '../../utils/page-scale.utils';
import { AnnotationTemplatesService, AnnotationTemplate } from '../../annotation-templates.service';
import { DEFAULT_GUIDE_SETTINGS, GuideSettings, cloneGuideSettings } from '../../models/guide-settings.model';
import { WorkspaceHeaderComponent } from './components/header/workspace-header.component';
import { WorkspaceSidebarComponent } from './components/sidebar/workspace-sidebar.component';
import { WorkspaceViewerComponent } from './components/viewer/workspace-viewer.component';
import { PageMapDialogComponent } from './components/migration/page-map-dialog.component';
import { ExportSamplesDialogComponent } from './components/export-samples-dialog/export-samples-dialog.component';
import { AboutDialogComponent } from './components/about-dialog/about-dialog.component';
import { CommandPaletteComponent } from './components/command-palette/command-palette.component';
import { ShortcutsDialogComponent } from './components/shortcuts-dialog/shortcuts-dialog.component';
import { TemplatesExportDialogComponent } from './components/templates-export-dialog/templates-export-dialog.component';
import { AiReviewComponent } from './components/migration/ai-review.component';
import { WorkspaceFooterComponent } from './components/footer/workspace-footer.component';
import { AnnotationDragController } from './annotation-drag.controller';
import { createPageLinkState } from './page-link.state';
import { WorkspaceJson } from './workspace-json';
import { WorkspaceView } from './workspace-view';
import { WorkspaceBatch } from './workspace-batch';
import { WorkspaceSelection } from './workspace-selection';
import { WorkspacePairing } from './workspace-pairing';
import { WorkspaceAdjust } from './workspace-adjust';
import { WorkspaceAi } from './workspace-ai';
import { PageThumbnailGenerator } from './page-thumbnail-generator';
import { DEFAULT_FONT_ID, FontCatalogService, FontOption } from '../../fonts/font-catalog.service';
import { AnnotationImportService } from '../../services/annotation-import.service';
import { ToastService } from '../../services/toast.service';
import { AnnotationStore } from '../../services/annotation-store';
import { PdfExportService } from '../../services/pdf-export.service';
import {
  MAX_TEST_DATA_BYTES,
  PreviewSettingsService,
} from '../../services/preview-settings.service';
import {
  fieldOrigin,
  resolveFieldPreview,
  resolveMapPath,
  type FieldOrigin,
  type PreviewMode,
  type SampleKind,
} from '../../utils/preview-values.utils';
import { SessionStoreService } from '../../services/session-store.service';
import { BatchStoreService } from '../../services/batch-store.service';
import { computeFieldStates, summarizeStates } from '../../utils/migration.utils';
import { PendingFileService, PendingRestore } from '../../services/pending-file.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { isPdfFile } from '../../utils/pdf-file.utils';
import type { BatchItem } from '../../models/batch.model';
import { normalizeFieldType } from '../../utils/annotation-fields.utils';
import { addFieldToPages, removeFieldFromPages, updateFieldInPages } from '../../utils/annotation-pages.utils';
import { CoalescingRunner } from '../../utils/coalescing-runner';
import {
  closeFontDropdownState,
  filterFontOptions,
  initialFontDropdownState,
  setFontDropdownQuery,
  toggleFontDropdownState,
  type FontDropdownState,
} from '../../utils/font-dropdown.utils';
import {
  clampRestoredPage,
  shouldScheduleSessionSave,
  validRestoredScale,
} from '../../utils/session-restore.utils';
import { buildJsonExportPayload, jsonExportText } from '../../utils/json-export.utils';
import {
  ensureHex,
  normalizeHexInput,
  parseRgbText,
  rgbToHex,
  toRgbString,
} from '../../utils/color.utils';
import { toFiniteNumber } from '../../utils/number.utils';
import { offsetFieldCopy } from '../../utils/paste-offset.utils';
import { JsonCopyFormatService } from '../../services/json-copy-format.service';
import { EditorSettingsService } from '../../services/editor-settings.service';
import { pixelToPdfPoint } from '../../utils/pdf-coords.utils';
import { resolveShortcut, type ShortcutAction } from '../../utils/shortcuts.utils';
import { type AiSession } from '../../utils/ai-session.utils';

import {
  WheelEdgeIndicator,
  PreviewState,
  EditState,
  JsonViewMode,
  EditorMode,
  SIDEBAR_TABS,
  SidebarTab,
  SESSION_SAVE_DELAY_MS,
  AdjustSession,
  NoticeId,
  PairTarget,
} from './workspace.types';
export type { AdjustSession, NoticeId } from './workspace.types';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    AiReviewComponent,
    ShortcutsDialogComponent,
    TemplatesExportDialogComponent,
    CommandPaletteComponent,
    AboutDialogComponent,
    ExportSamplesDialogComponent,
    PageMapDialogComponent,
  ],
})
export class WorkspacePageComponent implements OnInit, AfterViewChecked, OnDestroy {
  readonly pdfDoc = signal<PDFDocumentProxy | null>(null);
  readonly vm: WorkspacePageComponent;
  pageIndex = signal(1);
  scale = signal(1.5);
  /** Floating zoom indicator (P-59); `limit` is set when the request hit 25 % or 400 %. */
  readonly zoomHud = signal<{ percent: number; limit: ZoomLimit; side?: 'A' | 'B' } | null>(null);
  /** «Dividida»: A and B share zoom and scroll (default) or each goes its own way (P-61). */
  readonly splitLinked = signal(true);
  readonly scaleA = signal(1);
  /** Height of the A pane while unlinked (it scrolls on its own). */
  readonly splitHeight = signal(600);
  /** Screen box of the viewer while «Dividida» is active (the link chip is fixed over its bottom edge). */
  readonly splitBox = signal<{ left: number; top: number; width: number; height: number } | null>(null);
  private splitResizeObserver: ResizeObserver | null = null;
  workMarginObserver: ResizeObserver | null = null;
  observedAPane: HTMLElement | null = null;
  /** `scrollLeft` del reposo del panel A desenlazado (C1), para saber si alguien lo ha movido. */
  aHomeLeft = 0;
  aHomeTop = 0;
  viewerHomeTop = 0;
  reHoming = false;
  readonly zoomMenuOpen = signal(false);
  /** Formato con el que se copia el JSON (solo al copiar; P-130 a P-132) y si su ventana está abierta. */
  readonly copyFormats = inject(JsonCopyFormatService);
  readonly jsonCopyFormat = this.copyFormats.format;
  /** The wheel past the edge of the sheet changes page (P-63); on by default, switched off in ⋯. */
  readonly wheelPaging = signal(this.storedWheelPaging());
  /** Edge indicator while pushing the wheel at the top or bottom of the sheet. */
  readonly wheelEdge = signal<WheelEdgeIndicator | null>(null);
  wheelState: WheelPageState = initialWheelPageState();
  wheelEdgeTimer: ReturnType<typeof setTimeout> | null = null;
  readonly zoomPresets = ZOOM_PRESETS;
  /** Space is held: dragging moves the canvas instead of annotating. */
  readonly panReady = signal(false);
  readonly panning = signal(false);
  zoomHudTimer: ReturnType<typeof setTimeout> | null = null;
  zoomPending: { requested: number; anchor: { clientX: number; clientY: number } | null } | null = null;
  zoomBusy = false;
  panDrag: { x: number; y: number; left: number; top: number; viewer: HTMLElement } | null = null;
  private readonly panDownHandler = (evt: PointerEvent) => this.onPanPointerDown(evt);
  readonly panMoveHandler = (evt: PointerEvent) => this.onPanPointerMove(evt);
  readonly panUpHandler = () => this.endPan();
  private readonly windowBlurHandler = () => this.panReady.set(false);
  private removeZoomCommandListener: (() => void) | null = null;
  cursorPdfCoords = signal<{ x: number; y: number } | null>(null);
  private readonly thumbnailGenerator = new PageThumbnailGenerator();
  readonly pageThumbnails = this.thumbnailGenerator.thumbnails;
  requestThumbnail(pageNumber: number): void {
    this.thumbnailGenerator.request(pageNumber);
  }
  retryThumbnail(pageNumber: number): void {
    this.thumbnailGenerator.retry(pageNumber);
  }
  cancelThumbnail(pageNumber: number): void {
    this.thumbnailGenerator.cancel(pageNumber);
  }
  preview = signal<PreviewState>(null);
  editing = signal<EditState>(null);
  previewHexInput = signal('#000000');
  previewRgbInput = signal('rgb(0, 0, 0)');
  editHexInput = signal('#000000');
  editRgbInput = signal('rgb(0, 0, 0)');
  readonly coordsTextModel = signal(JSON.stringify({ pages: [] }, null, 2));
  readonly jsonTreePreview = signal<JsonTreePreview>(buildJsonTreePreview(this.coordsTextModel()));
  guidesFeatureEnabled = signal(false);
  readonly editorSettings = inject(EditorSettingsService);
  /** Con quién se alinea la anotación que se arrastra (pie del editor); `null` si con nadie. */
  readonly snapNote = signal<{ x: string | null; y: string | null } | null>(null);
  advancedOptionsOpen = signal(false);
  includeAdvancedJsonFields = signal(false);
  private readonly fontDropdownState = signal<FontDropdownState>(initialFontDropdownState());
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
    this.store.coords().reduce((total, page) => total + page.fields.length, 0),
  );
  readonly shortcutsOpen = signal(false);
  readonly templatesExportOpen = signal(false);
  /** Command palette (Ctrl+K). */
  readonly paletteOpen = signal(false);
  /** The palette asks the header to open «Limpiar» (it keeps its confirmation) — counter. */
  readonly clearRequest = signal(0);
  /** The palette asks the migration bar to run «Poner plantilla A · copiar tal cual» — counter. */
  readonly putACopyRequest = signal(0);
  readonly aboutOpen = signal(false);
  /** Last time the session was written (null = nothing saved yet) and a slow clock for «hace N s». */
  private readonly lastSavedAt = signal<number | null>(null);
  private readonly savedNow = signal(Date.now());
  readonly savedAgo = computed(() => {
    const at = this.lastSavedAt();
    if (at === null) {
      return null;
    }
    const seconds = Math.max(0, Math.round((this.savedNow() - at) / 1000));
    return seconds < 60
      ? { key: 'app.footer.savedSeconds', n: seconds }
      : { key: 'app.footer.savedMinutes', n: Math.floor(seconds / 60) };
  });
  readonly translationService = inject(TranslationService);
  readonly document = inject(DOCUMENT);
  readonly templatesService = inject(AnnotationTemplatesService);
  private readonly metadataService = inject(AppMetadataService);
  private readonly pendingFileService = inject(PendingFileService);
  readonly pdfExportService = inject(PdfExportService);
  readonly toast = inject(ToastService);
  private readonly sessionStore = inject(SessionStoreService);
  readonly store = inject(AnnotationStore);
  readonly router = inject(Router);
  readonly batch = inject(BatchStoreService);
  readonly annotationImport = inject(AnnotationImportService);
  readonly aiHelper = inject(AiHelperService);
  readonly fontCatalog = inject(FontCatalogService);
  readonly previewSettings = inject(PreviewSettingsService);
  readonly sampleKinds: readonly SampleKind[] = ['text', 'check', 'radio', 'number'];
  readonly previewModes: readonly PreviewMode[] = ['sample', 'map', 'data'];
  readonly coords = this.store.coords;

  /** Batch migration: set while a PDF of the batch is open (B is edited, A is the reference). */
  readonly referenceMode = signal<'overlay' | 'toggle' | 'split'>(this.storedReferenceMode());
  /** Fields of A in the PDF open in the batch (0 = nothing to show or copy). */
  readonly templateFieldsA = computed(
    () => this.batch.activeItem()?.aPages.reduce((sum, page) => sum + page.fields.length, 0) ?? 0,
  );
  /** «Dividida» is on: A (read only) on the left, B (edited) on the right. */
  readonly splitActive = computed(() => !!this.migration() && this.referenceMode() === 'split');
  /** Page sizes (points) of A and B, to compare them and scale the coordinates of A. */
  readonly pageSizesA = signal<PageSize[]>([]);
  readonly pageSizesB = signal<PageSize[]>([]);
  /** A and B have a different page size, so their coordinates do not line up. */
  readonly sizeMismatch = computed(
    () =>
      !!this.batch.activeItem()?.bPdf &&
      sizesDiffer(this.pageSizesA(), this.pageSizesB(), this.pageMap()?.pairs),
  );
  /** The coordinates of A are scaled to the page size of B (the person chose «Ajustar»). */
  readonly fitA = computed(() => this.sizeMismatch() && this.batch.activeItem()?.fitA === true);
  /** A and B differ in size and the person has not chosen yet. */
  readonly fitUndecided = computed(
    () => this.sizeMismatch() && this.batch.activeItem()?.fitA === undefined,
  );
  /** Informative notices of the batch bar that apply now; `sig` says what they are about. */
  readonly notices = computed(() => {
    if (!this.migration()) {
      return [];
    }
    const list: { id: NoticeId; sig: string }[] = [];
    if (this.templateFieldsA() === 0) {
      list.push({ id: 'noTemplate', sig: '' });
    }
    const pages = this.pagesDiffer();
    if (pages) {
      list.push({ id: 'pagesDiffer', sig: `${pages.a}/${pages.b}` });
    }
    if (this.sizeMismatch() && !this.fitUndecided()) {
      list.push({ id: 'fit', sig: JSON.stringify([this.pageSizesA(), this.pageSizesB()]) });
    }
    const adjust = this.adjust();
    if (adjust && adjust.phase !== 'loading') {
      list.push({ id: 'adjust', sig: 'adjust' });
    }
    const ai = this.ai();
    if (ai && ai.phase !== 'loading') {
      list.push({ id: 'ai', sig: 'ai' });
    }
    return list;
  });
  /** Closed notices that still apply: a changed situation (another B) shows them again. */
  readonly closedNoticeList = computed(() => {
    const itemId = this.batch.activeItem()?.id;
    const closed = this.batch.closedNotices();
    return this.notices().filter((notice) => closed[`${itemId}:${notice.id}`] === notice.sig);
  });
  isNoticeClosed(id: NoticeId): boolean {
    return this.closedNoticeList().some((notice) => notice.id === id);
  }
  closeNotice(id: NoticeId): void {
    const itemId = this.batch.activeItem()?.id;
    const notice = this.notices().find((n) => n.id === id);
    if (itemId && notice) {
      this.batch.closedNotices.update((all) => ({ ...all, [`${itemId}:${id}`]: notice.sig }));
    }
  }
  reopenNotice(id: NoticeId | null): void {
    const itemId = this.batch.activeItem()?.id;
    if (!itemId) {
      return;
    }
    this.batch.closedNotices.update((all) => {
      const next = { ...all };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${itemId}:`) && (!id || key === `${itemId}:${id}`)) {
          delete next[key];
        }
      }
      return next;
    });
  }
  private readonly pageLink = createPageLinkState({
    activeItem: () => this.batch.activeItem(),
    fitA: () => this.fitA(),
    pageSizesA: () => this.pageSizesA(),
    pageSizesB: () => this.pageSizesB(),
    pageCountA: () => this.pageCountA(),
    pageCount: () => this.pageCount(),
    pageIndex: () => this.pageIndex(),
    pagesLinked: () => this.pagesLinked(),
    commonPage: () => this.commonPage(),
    freeAPage: () => this.freeAPage(),
    comparing: () => this.comparing(),
    splitActive: () => this.splitActive(),
    showingOnlyA: () => this.showingOnlyA(),
  });
  readonly aPagesView = this.pageLink.aPagesView;
  readonly pageMap = this.pageLink.pageMap;
  readonly tableLinked = this.pageLink.tableLinked;
  readonly aPagesForB = this.pageLink.aPagesForB;
  readonly fitFactors = this.pageLink.fitFactors;
  readonly fitSizes = this.pageLink.fitSizes;
  readonly aPage = this.pageLink.aPage;
  readonly aGhost = this.pageLink.aGhost;
  readonly bGhost = this.pageLink.bGhost;
  readonly pageShown = this.pageLink.pageShown;
  readonly pageTotalShown = this.pageLink.pageTotalShown;
  readonly pageOffset = this.pageLink.pageOffset;
  readonly pageTag = this.pageLink.pageTag;
  /** «Copiar y ajustar por textos»: proposal under review (null = not open). Nothing touches B until applied. */
  readonly adjust = signal<AdjustSession | null>(null);
  adjustToken = 0;
  readonly ai = signal<AiSession | null>(null);
  /** The panel of the «✦ IA» chip (it lives in the batch bar, but «Copiar y adaptar con IA» can open it). */
  readonly aiPanelOpen = signal(false);
  /** Privacy notice before the first send. */
  readonly aiConsentOpen = signal(false);
  aiAbort: AbortController | null = null;
  aiPreviousMode: 'overlay' | 'toggle' | 'split' | null = null;
  aiTemplate = new Map<string, PageField>();
  adjustPreviousMode: 'overlay' | 'toggle' | 'split' | null = null;
  /** Page counts when A and B do not have the same number of pages (else null). */
  readonly pagesDiffer = signal<{ a: number; b: number } | null>(null);
  /** Pages of A (0 while there is no A to compare). */
  readonly pageCountA = signal(0);
  /** A and B move together through 1…max(A, B) (P-74 a P-77); «libres» gives A its own page. */
  readonly pagesLinked = signal(true);
  /** Linked position: can run past the last page of the shorter version. */
  readonly commonPage = signal(1);
  /** Page of A while the pages are free. */
  readonly freeAPage = signal(1);
  /** The pane that has the pointer: ‹ › and PgUp/PgDn move its page while the pages are free. */
  readonly paneFocus = signal<'a' | 'b'>('b');
  /** True while B is compared with an A that is open. */
  readonly comparing = computed(() => !!this.migration() && this.pageCountA() > 0);
  /** Dialog «Emparejar páginas» (P-79): open or not. */
  readonly pageMapOpen = signal(false);
  pageMapToken = 0;
  splitDoc: { blob: Blob; doc: Promise<PDFDocumentProxy> } | null = null;
  splitToken = 0;
  referencePdfToken = 0;
  splitTask: { cancel: () => void } | null = null;
  scaleBeforeSplit: number | null = null;
  readonly holdingReference = signal(false);
  /** «Alternar»: A is shown instead of B until the user switches back. */
  readonly viewingA = signal(false);
  /** Only A is visible: the A key is held, or «Alternar» is showing A. */
  readonly showingOnlyA = computed(
    () => this.holdingReference() || (this.referenceMode() === 'toggle' && this.viewingA()),
  );
  readonly migration = computed(() => {
    const item = this.batch.activeItem();
    if (!item || !item.bPdf) {
      return null; // without a new version there is nothing to compare: plain editing
    }
    const states = computeFieldStates(
      this.aPagesForB(),
      this.store.coords(),
      item.links,
      item.dismissed,
    );
    return { item, states, summary: summarizeStates(states), dismissed: item.dismissed };
  });
  /** Position of the open PDF inside the batch (also when it has no B). */
  readonly batchCtx = computed(() => {
    const item = this.batch.activeItem();
    if (!item) {
      return null;
    }
    const items = this.batch.items();
    return { item, index: items.findIndex((i) => i.id === item.id), total: items.length };
  });
  batchSaveTimer: ReturnType<typeof setTimeout> | null = null;
  readonly customFontsFeatureEnabled = this.fontCatalog.customFontsFeatureEnabled;
  readonly customFonts = this.fontCatalog.customFonts;
  readonly fontOptions = this.fontCatalog.fontOptions;
  readonly templates = signal<AnnotationTemplate[]>([]);
  readonly defaultTemplateId = this.templatesService.defaultTemplateId;
  readonly templateNameModel = signal('');
  readonly selectedTemplateId = signal<string | null>(null);
  readonly version = APP_VERSION;
  readonly appName = APP_NAME;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  readonly languageModel = signal<Language>(this.translationService.getCurrentLanguage());
  readonly defaultFontId = DEFAULT_FONT_ID;
  readonly coordsFileInputChangeHandler = (event: Event) =>
    this.onCoordsFileSelected(event);
  coordsFileInputFallback: HTMLInputElement | null = null;
  autoApplyCoordsTimer: ReturnType<typeof setTimeout> | null = null;

  /** Original file of the open PDF, kept so the session can be saved and restored. */
  private sessionFile: File | null = null;
  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  pdfByteSources = new Map<string, { bytes: Uint8Array; weight: number }>();
  private overlayDragRect: OverlayRect | null = null;
  private overlayGuides: OverlayGuide[] = [];
  private clipboard: PageField | null = null;

  /** Annotations picked with Shift/Ctrl+click or Ctrl+A. Always on one page, never locked. */
  readonly selection = signal<{ pageIndex: number; fields: readonly number[] } | null>(null);
  readonly selectionCount = computed(() => this.selection()?.fields.length ?? 0);
  selectionClipboard: PageField[] = [];
  private readonly drag = new AnnotationDragController({
    layer: () => this.annotationsLayerRef?.nativeElement,
    canvas: () => this.pdfCanvasRef?.nativeElement,
    scale: () => this.scale(),
    guidesEnabled: () => this.guidesFeatureEnabled(),
    refreshOverlay: (rect, guides) => this.refreshOverlay(rect, guides),
    annotationSnap: (input) => this.annotationSnap(input),
    applySnapping: (left, top, bounds, el, canvas, fontSizePx) =>
      this.applySnapping(left, top, bounds, el, canvas, fontSizePx),
    coords: () => this.coords(),
    styled: (field) => this.ensureFieldStyle(field),
    selection: () => this.selection(),
    clearSelection: () => this.clearSelection(),
    toggleSelection: (pageIndex, fieldIndex) => this.toggleSelection(pageIndex, fieldIndex),
    startEditing: (pageIndex, fieldIndex, field) => this.startEditing(pageIndex, fieldIndex, field),
    clickOnGroupMember: (pageIndex, fieldIndex) => {
      const field = this.coords()[pageIndex]?.fields[fieldIndex];
      this.selection.set(null);
      if (field) {
        this.startEditing(pageIndex, fieldIndex, field);
      }
    },
    moveSelection: (dx, dy) => this.moveSelection(dx, dy),
    setFieldPosition: (pageIndex, fieldIndex, x, y) =>
      this.setFieldPosition(pageIndex, fieldIndex, x, y),
    redrawAllForPage: () => this.redrawAllForPage(),
  });

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

  get splitCanvasRef(): ElementRef<HTMLCanvasElement> | undefined {
    return this.viewerComponent?.splitCanvasRef;
  }

  get splitLayerRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.splitLayerRef;
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
      this.document?.getElementById(`sidebar-tab-${SIDEBAR_TABS[next]}`)?.focus(),
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
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', this.panDownHandler, true);
      window.addEventListener('blur', this.windowBlurHandler);
    }
    this.store.setFieldComparator((a, b) => this.areFieldsEqual(a, b));
    effect(() => {
      this.store.coords();
      this.pageIndex();
      this.scale();
      untracked(() => this.scheduleSessionSave());
    });
    effect(() => {
      this.store.coords();
      untracked(() => this.scheduleBatchSave());
    });
    effect(() => {
      const format = this.jsonCopyFormat();
      untracked(() => this.onJsonFormatChanged(format));
    });
    effect(() => {
      this.migration();
      this.referenceMode();
      this.showingOnlyA();
      this.aPage();
      untracked(() => this.redrawReference());
    });
    effect(() => {
      const item = this.migration()?.item;
      this.pageIndex();
      untracked(() => void this.updatePagesDiffer(item?.aPdf ?? null));
    });
    effect(() => {
      this.splitActive();
      this.pageIndex();
      this.aPage();
      this.scale();
      this.batch.activeItem();
      this.fitA();
      this.pageSizesB();
      untracked(() => void this.renderSplit());
    });
    effect(() => {
      this.previewSettings.inBatch.set(!!this.batch.activeItem());
    });
    effect(() => {
      this.previewSettings.context();
      this.previewSettings.showOrigin();
      this.translationService.language();
      untracked(() => this.redrawAllForPage());
    });
    this.vm = this;
    this.setDocumentMetadata();
    const storedTemplates = this.templatesService.getTemplates();
    this.templates.set(storedTemplates);

    const initialTemplate =
      storedTemplates.find((template) => template.id === this.templatesService.defaultTemplateId) ??
      storedTemplates[0] ??
      null;

    this.selectedTemplateId.set(initialTemplate?.id ?? null);

    if (initialTemplate) {
      this.applyTemplate(initialTemplate);
    } else {
      this.syncCoordsTextModel();
    }
  }

  ngOnInit(): void {
    const bridge = (typeof window !== 'undefined'
      ? (window as unknown as { desktop?: { onZoomCommand?: (cb: (c: string) => void) => () => void } }).desktop
      : undefined);
    this.removeZoomCommandListener =
      bridge?.onZoomCommand?.((command) => {
        if (command === 'in') void this.zoomIn();
        else if (command === 'out') void this.zoomOut();
        else if (command === 'reset') void this.zoomActualSize();
      }) ?? null;
    if (typeof window !== 'undefined') {
      this.savedClock = setInterval(() => this.savedNow.set(Date.now()), 5000);
    }
    if (this.batch.activeItem()) {
      this.sidebarTab.set('annotations'); // the state of every field lives there
    }
    const pendingFile = this.pendingFileService.consumePendingFile();
    const pendingRestore = this.pendingFileService.consumePendingRestore();
    if (pendingFile) {
      this.loadPdfFile(pendingFile, pendingRestore).catch((error) =>
        console.error('No se pudo cargar el PDF pendiente.', error),
      );
    }
  }

  private savedClock: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', this.panDownHandler, true);
      window.removeEventListener('blur', this.windowBlurHandler);
    }
    this.endPan();
    this.removeZoomCommandListener?.();
    if (this.zoomHudTimer) clearTimeout(this.zoomHudTimer);
    if (this.wheelEdgeTimer) clearTimeout(this.wheelEdgeTimer);
    this.splitResizeObserver?.disconnect();
    this.workMarginObserver?.disconnect();
    if (this.savedClock) {
      clearInterval(this.savedClock);
    }
    this.flushBatchSave();
    this.rememberLastOpened();
    this.batch.deactivate();
    this.thumbnailGenerator.dispose();
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
      this.ensureFieldStyle({ ...field, fontFamily: normalized }),
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
      const next = toggleFontDropdownState(state, mode);
      opened = next[mode].open;
      return next;
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
    this.fontDropdownState.update((state) => closeFontDropdownState(state, mode));

    if (this.pendingFontSearchFocus === mode) {
      this.pendingFontSearchFocus = null;
    }
  }

  fontSearchQuery(mode: EditorMode): string {
    return this.fontDropdownState()[mode].query;
  }

  onFontSearch(mode: EditorMode, value: string) {
    this.fontDropdownState.update((state) => setFontDropdownQuery(state, mode, value));
  }

  filteredFontOptions(mode: EditorMode): FontOption[] {
    return filterFontOptions(this.fontOptions(), this.fontDropdownState()[mode].query);
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
    const normalized = normalizeOpacityValue(value);
    this.updateWorkingField(mode, (field) =>
      this.ensureFieldStyle({
        ...field,
        opacity:
          normalized ?? (typeof field.opacity === 'number' ? field.opacity : DEFAULT_OPACITY),
      }),
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
    const normalized = normalizeBackgroundColor(value);
    if (!normalized) {
      this.clearFieldBackground(mode);
      return;
    }
    this.updateWorkingField(mode, (field) =>
      this.ensureFieldStyle({ ...field, backgroundColor: normalized }),
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
      this.ensureFieldStyle({ ...field, backgroundColor: null }),
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
    this.languageModel.set(this.translationService.getCurrentLanguage());
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
    const removedOptionIds = removedFonts.map((font) =>
      this.fontCatalog.toCustomFontOptionId(font.id),
    );
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
    checked: boolean,
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
    const parsed = parseNumericList(rawValue);
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

  refreshOverlay(
    activeRect?: { left: number; top: number; width: number; height: number } | null,
    guides?: OverlayGuide[],
  ) {
    if (activeRect !== undefined) {
      this.overlayDragRect = activeRect;
      if (activeRect === null) {
        this.setSnapNote(null);
      }
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

    const settings = this.guideSettings();
    const scale = this.scale();

    if (this.guidesFeatureEnabled()) {
      drawGrid(ctx, settings, overlay.width, overlay.height, scale);
      drawRulers(ctx, settings, overlay.width, overlay.height, scale);
      drawStaticGuides(ctx, settings, overlay.width, overlay.height, scale);
    } else if (!this.overlayDragRect) {
      return;
    }

    if (this.overlayDragRect) {
      drawActiveGuides(
        ctx,
        overlay.width,
        overlay.height,
        settings.showAlignment,
        this.overlayDragRect,
        this.overlayGuides,
      );
    }
  }

  private applySnapping(
    baseLeft: number,
    baseTop: number,
    bounds: SnapBounds,
    el: HTMLDivElement,
    pdfCanvas: HTMLCanvasElement,
    fontSizePx: number,
  ): { left: number; top: number; guides: OverlayGuide[] } {
    if (!this.guidesFeatureEnabled()) {
      return { left: baseLeft, top: baseTop, guides: [] };
    }

    return computeSnapping({
      baseLeft,
      baseTop,
      bounds,
      settings: this.guideSettings(),
      scale: this.scale(),
      width: pdfCanvas.width,
      height: pdfCanvas.height,
      elementWidth: el.offsetWidth,
      elementHeight: el.offsetHeight,
      fontSizePx,
    });
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

    const focusTarget =
      editorEl.querySelector<HTMLElement>('[data-autofocus]') ??
      editorEl.querySelector<HTMLElement>('input, select, textarea, button');
    focusTarget?.focus();
  }

  onEditorKeydown(event: KeyboardEvent, mode: 'preview' | 'edit') {
    const triggerAction = (action: 'confirm' | 'cancel') => {
      event.preventDefault();
      this.invokeEditorAction(mode, action);
    };

    switch (event.key) {
      case 'Enter':
        if ((event.target as HTMLElement | null)?.closest('button')) break;
        // Pasa por el botón «Aceptar» para que el teclado use la misma validación que el clic.
        event.preventDefault();
        (event.currentTarget as HTMLElement | null)
          ?.querySelector<HTMLButtonElement>('.action-primary')
          ?.click();
        break;
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

  readonly canvasHeight = signal(0);
  readonly pageCount = computed(() => this.pdfDoc()?.numPages ?? 0);

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
      (field) => this.prepareFieldForStorage(field),
    );
    if (normalized === null) {
      this.toast.error(this.translationService.translate('toast.sessionRestoreFailed'));
      return;
    }

    this.replaceCoords(normalized, { skipHistory: true });
    const restoredScale = validRestoredScale(restore.scale);
    if (restoredScale !== null) {
      this.scale.set(restoredScale);
    }
    this.pageIndex.set(clampRestoredPage(restore.pageIndex, this.pdfDoc()?.numPages ?? 1));
    this.resetPageLink(this.pageIndex());
  }

  private scheduleSessionSave() {
    if (this.sessionSaveTimer) {
      clearTimeout(this.sessionSaveTimer);
      this.sessionSaveTimer = null;
    }

    const file = this.sessionFile;
    if (
      !file ||
      !shouldScheduleSessionSave({
        hasFile: true,
        hasDocument: !!this.pdfDoc(),
        hasBrowser: typeof window !== 'undefined',
        batchActive: !!this.batch.activeItem(),
        hasAnnotations: this.store.coords().length > 0,
        canUndo: this.store.canUndo(),
      })
    ) {
      return;
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
    this.lastSavedAt.set(Date.now());
    this.savedNow.set(Date.now());
    void this.sessionStore.save({
      name: file.name,
      pdf: file,
      coords: this.store.snapshot(),
      pageIndex: this.pageIndex(),
      scale: this.scale(),
      savedAt: Date.now(),
    });
  }

  /** Lets «Adelante» (or the history) reopen this PDF as it was after leaving the workspace. */
  private rememberLastOpened() {
    if (!this.sessionFile || !this.pdfDoc() || this.batch.activeItem()) {
      return;
    }
    this.pendingFileService.rememberLastOpened(this.sessionFile, {
      coords: this.store.snapshot(),
      pageIndex: this.pageIndex(),
      scale: this.scale(),
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

  async loadPdfFile(file: File, restore: PendingRestore | null = null) {
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
    this.pdfDoc.set(loadedPdf);
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
    this.resetPageLink(1);
    this.resetHistory();
    this.clearAll({ skipHistory: true });
    if (restore) {
      this.applyRestoredSession(restore);
    }
    await this.render();
    if (restore) {
      this.redrawAllForPage();
    } else if (
      typeof window !== 'undefined' &&
      !(window as { __PDFA_NO_FIT__?: boolean }).__PDFA_NO_FIT__
    ) {
      await (window.innerWidth < 960 ? this.fitWidth() : this.fitPage());
    }
    this.resetViewerScroll();
    this.thumbnailGenerator.generate(this.pdfDoc()).catch((error) =>
      console.error('No se pudieron generar las miniaturas del documento.', error),
    );
    this.fileDropActive.set(false);
    if (this.batch.activeItem()?.aiProposal) {
      await this.loadSavedAi();
    }
  }

  private readonly renderRunner = new CoalescingRunner(
    () => this.renderOnce(),
    () => this.redrawAllForPage(),
  );

  /**
   * Draws the current page. pdf.js cannot render twice on the same canvas at once, so calls that
   * arrive mid-render (e.g. a held zoom key) are coalesced into one more pass with the latest
   * scale/page, and the annotations are repainted afterwards.
   */
  render(): Promise<void> {
    return this.renderRunner.request();
  }

  private async renderOnce() {
    if (!this.pdfDoc()) {
      return;
    }

    const page: PDFPageProxy = await this.pdfDoc()!.getPage(this.pageIndex());
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
    this.canvasHeight.set(canvas.height);

    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    this.refreshOverlay();
  }

  domToPdfCoords(evt: MouseEvent) {
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const xPx = evt.clientX - rect.left;
    const yPx = evt.clientY - rect.top;
    const scale = this.scale();
    return pixelToPdfPoint(xPx, yPx, canvas.height, scale);
  }

  onViewerMouseMove(evt: MouseEvent) {
    if (!this.pdfDoc()) {
      this.cursorPdfCoords.set(null);
      return;
    }

    const coords = this.domToPdfCoords(evt);
    this.cursorPdfCoords.set(coords);
    if (this.adjust()?.phase === 'ready') {
      this.setAdjustHover(this.adjustHit(evt)?.key ?? null);
    }
  }

  onViewerMouseLeave() {
    this.cursorPdfCoords.set(null);
  }

  onHitboxClick(evt: MouseEvent) {
    this.clearPair();
    if (this.suppressHitboxClick) {
      this.suppressHitboxClick = false;
      return;
    }
    if (!this.pdfDoc() || this.editing()) return;
    if (this.adjust()?.phase === 'ready') {
      const hit = this.adjustHit(evt);
      if (hit) {
        this.patchAdjust({
          selected: hit.key,
          hover: hit.key,
          card: { x: evt.clientX, y: evt.clientY },
        });
        return;
      }
      this.closeAdjustCard();
    }
    if (evt.ctrlKey || evt.metaKey) {
      // Ctrl/⌘ + clic en zona vacía no crea anotación: vacía la selección y, a la segunda vez,
      // alterna ajustar y 100 % (P-106).
      this.clearSelection();
      if (this.isViewerDoubleClick('modifier', evt)) void this.toggleFitActual(evt);
      return;
    }
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

  updateEditingColorState(color: string) {
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
    if (!p || !fieldHasRenderableContent(p.field)) {
      this.preview.set(null);
      this.closeFontDropdown('preview');
      return;
    }
    const normalizedField = this.prepareFieldForStorage(p.field);
    if (
      this.applyCoordsChange(() =>
        this.coords.update((pages) => addFieldToPages(p.page, normalizedField, pages)),
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
            updateFieldInPages(pageIndex, fieldIndex, sanitized, pages),
          ),
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
    if (!fieldHasRenderableContent(e.field)) {
      this.editing.set(null);
      this.closeFontDropdown('edit');
      return;
    }
    const aiId = this.coords()[e.pageIndex]?.fields[e.fieldIndex]?.aiId;
    const normalized = { ...this.prepareFieldForStorage(e.field), ...(aiId ? { aiId } : {}) };
    if (
      this.applyCoordsChange(() =>
        this.coords.update((pages) =>
          updateFieldInPages(e.pageIndex, e.fieldIndex, normalized, pages),
        ),
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
    const target = event.target as HTMLElement | null;
    // Un modal nativo abierto (p. ej. «Personalizar» el JSON) se queda con sus teclas: Esc, flechas, Supr…
    if (target?.closest?.('dialog[open]')) return;
    const tag = target?.tagName;
    const result = resolveShortcut(
      {
        key: event.key.toLowerCase(),
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
      },
      {
        pageMapOpen: this.pageMapOpen(),
        paletteOpen: this.paletteOpen(),
        aboutOpen: this.aboutOpen(),
        shortcutsOpen: this.shortcutsOpen(),
        zoomMenuOpen: this.zoomMenuOpen(),
        hasDocument: !!this.pdfDoc(),
        previewOpen: !!this.preview(),
        editing: !!this.editing(),
        hasSelection: !!this.selection(),
        hasClipboard: this.selectionClipboard.length > 0,
        canUndo: this.canUndo(),
        canRedo: this.canRedo(),
        comparing: this.comparing(),
        splitActive: this.splitActive(),
        targetEditable: isEditableElement(event.target),
        targetBlocksPlain:
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'BUTTON' ||
          !!target?.isContentEditable,
      },
    );
    if (!result) {
      return;
    }
    if (result.preventDefault) {
      event.preventDefault();
    }
    this.runShortcut(event, result.action);
  }

  private runShortcut(event: KeyboardEvent, action: ShortcutAction) {
    switch (action) {
      case 'togglePalette':
        this.togglePalette();
        break;
      case 'applyJson':
        this.applyCoordsText();
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'zoomIn':
        void this.zoomIn();
        break;
      case 'zoomOut':
        void this.zoomOut();
        break;
      case 'zoomActual':
        void this.zoomActualSize();
        break;
      case 'selectAll':
        this.selectAllOnPage();
        break;
      case 'copy':
        if (this.copySelection()) {
          event.preventDefault();
        }
        break;
      case 'paste':
        if (this.pasteSelection()) {
          event.preventDefault();
        }
        break;
      case 'duplicate':
        this.duplicateSelection();
        break;
      case 'closeAbout':
        this.toggleAbout(false);
        break;
      case 'closeZoomMenu':
        this.zoomMenuOpen.set(false);
        break;
      case 'closeShortcuts':
        this.toggleShortcuts(false);
        break;
      case 'clearSelection':
        this.clearSelection();
        break;
      case 'deleteSelection':
        this.deleteSelection();
        break;
      case 'nudgeLeft':
      case 'nudgeRight':
      case 'nudgeUp':
      case 'nudgeDown': {
        const step = event.shiftKey ? 10 : 1;
        const dx = action === 'nudgeLeft' ? -step : action === 'nudgeRight' ? step : 0;
        const dy = action === 'nudgeUp' ? step : action === 'nudgeDown' ? -step : 0;
        this.moveSelection(dx, dy, 'nudge');
        break;
      }
      case 'panReady':
        this.panReady.set(true);
        break;
      case 'fitPage':
        void this.fitPage();
        break;
      case 'fitWidth':
        void this.fitWidth();
        break;
      case 'toggleShortcuts':
        this.toggleShortcuts();
        break;
      case 'prevPage':
        void this.prevPage();
        break;
      case 'nextPage':
        void this.nextPage();
        break;
      case 'prevPageA':
        void this.stepPageA(-1);
        break;
      case 'nextPageA':
        void this.stepPageA(1);
        break;
      case 'firstPage':
        void this.setPageIndex(1);
        break;
      case 'lastPage':
        void this.setPageIndex(this.pageTotalShown());
        break;
      case 'toggleSidebar':
        this.toggleSidebarMinimized();
        break;
      case 'toggleSplitLink':
        void this.toggleSplitLink();
        break;
    }
  }

  @HostListener('document:keyup', ['$event'])
  onGlobalKeyup(event: KeyboardEvent) {
    if (event.key === ' ') {
      this.panReady.set(false);
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
      if (this.zoomMenuOpen() && !(target as HTMLElement).closest?.('.footer__zoomwrap')) {
        this.zoomMenuOpen.set(false);
      }
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
        this.coords.update((pages) => removeFieldFromPages(e.pageIndex, e.fieldIndex, pages)),
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
    const { aiId: _aiId, ...copy } = sanitized;
    this.clipboard = copy;
    return true;
  }

  pasteAnnotation(targetPageNum?: number): boolean {
    if (!this.clipboard || !this.pdfDoc()) {
      return false;
    }

    const pageNum = targetPageNum ?? this.pageIndex();
    const pdfCanvas = this.pdfCanvasRef?.nativeElement ?? null;
    const newField: PageField = { ...this.clipboard };

    const pasted = pdfCanvas
      ? offsetFieldCopy(newField, this.scale(), pdfCanvas.width, pdfCanvas.height, 1)
      : newField;

    let insertedFieldIndex = -1;
    let insertedPageIndex = -1;

    const changed = this.applyCoordsChange(() => {
      this.coords.update((pages) => {
        const updated = addFieldToPages(pageNum, pasted, pages);
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

  private fieldRequiresStorageUpdate(original: PageField, sanitized: PageField): boolean {
    return !this.areFieldsEqual(original, sanitized);
  }

  prepareFieldForStorage(field: PageField): PageField {
    return prepareFieldForStorage(field, (f) => this.fontCatalog.normalizeFontFamily(f));
  }

  prepareFieldForForm(field: PageField): PageField {
    return prepareFieldForForm(field, (f) => this.fontCatalog.normalizeFontFamily(f));
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

  ensureFieldStyle(field: PageField): PageField {
    return ensureFieldStyle(field, (f) => this.fontCatalog.normalizeFontFamily(f));
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
        }),
      ),
    );

    if (changed) {
      this.syncCoordsTextModel();
    }

    this.redrawAllForPage();
  }

  dismissEditors() {
    if (this.preview()) {
      this.preview.set(null);
    }
    if (this.editing()) {
      this.editing.set(null);
    }
    this.closeFontDropdown('preview');
    this.closeFontDropdown('edit');
  }

  runAfterRender(callback: () => void) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => callback());
    } else {
      setTimeout(callback, 0);
    }
  }

  private updateAnnotationLeft(el: HTMLDivElement, field: PageField, scale: number) {
    const width = el.offsetWidth;
    const left = field.x * scale;
    el.style.left = `${left}px`;
    el.style.width = `${width}px`;
  }

  /** Origin of what a field paints, per field of the current page, for the legend and the chips. */
  readonly originCounts = computed(() => {
    const ctx = this.previewSettings.context();
    const counts = { value: 0, data: 0, sample: 0, missing: 0 };
    for (const page of this.coords()) {
      if (page.num !== this.pageIndex()) continue;
      for (const field of page.fields) {
        const origin = fieldOrigin(resolveFieldPreview(field, ctx));
        if (origin) counts[origin] += 1;
      }
    }
    return counts;
  });

  readonly originLabelKeys: Record<FieldOrigin, string> = {
    value: 'preview.origin.value',
    data: 'preview.origin.data',
    sample: 'preview.origin.sample',
    missing: 'preview.origin.missing',
  };

  getFieldRenderValue(field: PageField): string {
    return resolveFieldPreview(field, this.previewSettings.context()).text;
  }

  /** Counts annotations that would paint a sample value, for the export notice. */
  countSampleFields(): number {
    const ctx = this.previewSettings.context();
    let count = 0;
    for (const page of this.coords()) {
      for (const field of page.fields) {
        if (resolveFieldPreview(field, ctx).source === 'sample') {
          count += 1;
        }
      }
    }
    return count;
  }

  inBatchMode(): boolean {
    return !!this.batch.activeItem();
  }

  setShowOrigin(show: boolean) {
    this.previewSettings.setShowOrigin(show);
  }

  setPreviewMode(mode: PreviewMode) {
    if (mode === 'data' && !this.previewSettings.hasTestData()) {
      return;
    }
    this.previewSettings.setMode(mode);
    if (mode === 'data') {
      this.announceMissingData();
    }
  }

  /** Informative notice (recoverable from the bell) with the annotations the test data does not cover. */
  private announceMissingData() {
    const { total, resolved } = this.testDataStats();
    const count = total - resolved;
    if (count > 0 && !this.inBatchMode()) {
      this.toast.notice(this.translationService.translate('toast.noData', { count }), 'info');
    }
  }

  onTestDataChange(text: string) {
    this.previewSettings.setTestDataText(text);
  }

  onSampleChange(kind: SampleKind, value: string) {
    this.previewSettings.setSample(kind, value);
  }

  async onTestDataFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }
    if (file.size > MAX_TEST_DATA_BYTES) {
      this.toast.error(this.translationService.translate('preview.testData.tooLarge'));
      return;
    }
    try {
      this.previewSettings.setTestDataText(await file.text());
      if (this.previewSettings.hasTestData()) {
        this.previewSettings.setMode('data');
        this.announceMissingData();
      }
    } catch {
      this.toast.error(this.translationService.translate('preview.testData.readFailed'));
    }
  }

  clearTestData() {
    this.previewSettings.clearTestData();
  }

  testDataStats = computed(() => {
    const ctx = this.previewSettings.context();
    let total = 0;
    let resolved = 0;
    const missing: string[] = [];
    if (ctx.data === null) {
      return { total, resolved, missing };
    }
    for (const page of this.coords()) {
      for (const field of page.fields) {
        const type = normalizeFieldType(field.type);
        if (type === 'check' || type === 'radio' || (field.value ?? '').trim()) {
          continue;
        }
        total += 1;
        if (resolveMapPath(ctx.data, field.mapField ?? '') !== undefined) {
          resolved += 1;
        } else if (missing.length < 6 && !missing.includes(field.mapField)) {
          missing.push(field.mapField);
        }
      }
    }
    return { total, resolved, missing };
  });

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
          const preview = resolveFieldPreview(styledField, this.previewSettings.context());
          el.textContent = preview.text;
          const origin = fieldOrigin(preview);
          if (origin && this.previewSettings.showOrigin()) {
            el.dataset['origin'] = origin;
            el.dataset['originLabel'] = this.translationService.translate(
              this.originLabelKeys[origin],
            );
          }
          el.style.left = `${left}px`;
          el.style.top = `${top - styledField.fontSize * scale}px`;
          el.style.fontSize = `${styledField.fontSize * scale}px`;
          el.style.color = styledField.color;
          el.style.fontFamily = this.fontCatalog.resolveCssFontFamily(
            styledField.fontFamily ?? DEFAULT_FONT_ID,
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
            ? (evt) => this.drag.pointerDownLocked(evt, pageIndex, fieldIndex)
            : (evt) => {
                // Con cajas solapadas y una pareja A↔B activa, se coge la emparejada y no la de encima.
                const target = this.pairedFieldUnder(evt, pageIndex, fieldIndex, el);
                this.drag.pointerDown(evt, target.pageIndex, target.fieldIndex, target.el);
              };
          layer.appendChild(el);

          this.runAfterRender(() => this.updateAnnotationLeft(el, styledField, scale));
        });
      });

    this.refreshOverlay();
    this.redrawReference();
  }

  // ---- batch migration (A = reference layer, B = what is edited) -------------------------------

  get referenceLayerRef(): ElementRef<HTMLDivElement> | undefined {
    return this.viewerComponent?.referenceLayerRef;
  }

  pageSizesKey: { a: Blob; b: PDFDocumentProxy } | null = null;

  @HostListener('window:resize')
  updateSplitHeight(): void {
    const viewer = this.pdfViewerRef?.nativeElement.closest('.viewer') as HTMLElement | null;
    if (!viewer) {
      return;
    }
    this.splitHeight.set(Math.max(200, viewer.clientHeight - 44));
    const r = viewer.getBoundingClientRect();
    this.splitBox.set({ left: r.left, top: r.top, width: r.width, height: r.height });
    if (!this.splitResizeObserver && typeof ResizeObserver !== 'undefined') {
      this.splitResizeObserver = new ResizeObserver(() => this.updateSplitHeight());
      this.splitResizeObserver.observe(viewer);
    }
  }

  // ---- Parejas A↔B: navegar desde las tarjetas y unir con una línea (utils/pairing.utils.ts) ----
  /** Línea entre la pareja (coordenadas de la ventana); null sin pareja a la vista. */
  readonly pairLine = signal<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  /** Aviso breve junto a un campo sin pareja («Sin pareja en B»). */
  readonly pairTip = signal<{ x: number; y: number; key: string } | null>(null);
  pairTarget: PairTarget | null = null;
  pairFrame = 0;
  pairTipTimer: ReturnType<typeof setTimeout> | null = null;
  pairHoverKey: string | null = null;
  pairHoverTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('document:keydown.escape')
  onPairEscape(): void {
    if (this.pairTarget || this.pairTip()) {
      this.clearPair();
      this.pairTip.set(null);
    }
  }

  /** Adds fields to B (replacing nothing): the first ones go straight in, later ones are one undo step. */
  insertFields(toAdd: Array<{ page: number; field: PageField }>): void {
    if (toAdd.length === 0) {
      return;
    }
    if (this.annotationCount() === 0) {
      const pages: PageAnnotations[] = [];
      for (const { page, field } of toAdd) {
        const target = pages.find((entry) => entry.num === page);
        if (target) {
          target.fields.push(field);
        } else {
          pages.push({ num: page, fields: [field] });
        }
      }
      this.replaceCoords(pages);
      return;
    }
    const changed = this.applyCoordsChange(() => {
      let pages = this.coords();
      for (const { page, field } of toAdd) {
        pages = addFieldToPages(page, field, pages);
      }
      this.coords.set(pages);
    });
    if (changed) {
      this.syncCoordsTextModel();
    }
  }

  /** Other PDFs of the batch whose AI proposal is waiting for review. */
  readonly aiPendingOthers = computed(
    () =>
      this.batch.items().filter((item) => item.aiProposal && item.id !== this.batch.activeId())
        .length,
  );

  readonly holdingOriginal = signal(false);

  /** Original places are shown: the toggle says so, or the P key is held. */
  readonly adjustShowsOriginal = computed(
    () => this.adjust()?.view === 'original' || this.holdingOriginal(),
  );

  /** Rubber-band rectangle (px, relative to the page) while dragging on an empty area. */
  readonly lasso = signal<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  lassoDrag: {
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    active: boolean;
    additive: boolean;
  } | null = null;
  suppressHitboxClick = false;

  /** Menu of the chip of pages (▾): «Emparejadas/Enlazadas», «Libres» and «Emparejar páginas…». */
  readonly pagesMenuOpen = signal(false);

  lastViewerClick: ViewerClick | null = null;

  toggleAbout(open = !this.aboutOpen()) {
    this.aboutOpen.set(open);
  }

  /** Saved templates that can be exported (the default one is not). */
  exportableTemplates(): AnnotationTemplate[] {
    return this.templates().filter((template) => template.id !== this.defaultTemplateId);
  }

  toggleTemplatesExport(open = !this.templatesExportOpen()) {
    if (open && !this.exportableTemplates().length) {
      return;
    }
    this.templatesExportOpen.set(open);
  }

  toggleShortcuts(open = !this.shortcutsOpen()) {
    this.shortcutsOpen.set(open);
  }

  togglePalette(open = !this.paletteOpen()) {
    this.paletteOpen.set(open);
  }

  /** PDFs of the open batch (for «Ir a …» in the command palette). */
  batchItemsForPalette(): readonly BatchItem[] {
    return this.batchCtx() ? this.batch.items() : [];
  }

  async openBatchItem(id: string): Promise<void> {
    const target = this.batch.items().find((item) => item.id === id);
    if (target && target.id !== this.batch.activeId()) {
      await this.switchBatchItem(target);
    }
  }

  readonly exportSamplesPrompt = signal<number | null>(null);
  rememberedExportChoice: 'map' | 'sample' | null = null;

  syncCoordsTextModel() {
    this.coordsTextModel.set(
      jsonExportText(
        buildJsonExportPayload(this.coords(), (field) => this.serializeFieldForJson(field)),
        this.jsonCopyFormat(),
      ),
    );
    this.refreshJsonPreview();
  }

  private snapshotCoords(pages: PageAnnotations[] = this.coords()): PageAnnotations[] {
    return this.store.snapshot(pages);
  }

  serializeFieldForJson(field: PageField): Record<string, unknown> {
    return serializeFieldForJson(
      this.prepareFieldForStorage(field),
      this.includeAdvancedJsonFields(),
    );
  }

  applyCoordsChange(mutator: () => void, options?: { coalesceKey?: string }): boolean {
    return this.store.applyChange(mutator, options);
  }

  replaceCoords(
    newCoords: PageAnnotations[],
    options?: { skipHistory?: boolean; preserveTextModel?: boolean },
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
    return areFieldsEqual(a, b, (f) => this.fontCatalog.normalizeFontFamily(f));
  }

  refreshJsonPreview() {
    this.jsonTreePreview.set(buildJsonTreePreview(this.coordsTextModel()));
  }
}

/*
 * El código de la página está repartido en archivos hermanos por áreas (IA, ajuste por textos, vista, parejas A↔B,
 * lote, selección, JSON y exportación). Cada uno es una clase sin estado cuyos métodos se copian al prototipo de la
 * página: `this` sigue siendo la página y los subcomponentes siguen llamando a `vm.metodo()`. El estado (signals)
 * vive en la página.
 */
const WORKSPACE_PARTS = [
  WorkspaceAi,
  WorkspaceAdjust,
  WorkspacePairing,
  WorkspaceSelection,
  WorkspaceBatch,
  WorkspaceView,
  WorkspaceJson,
] as const;
export interface WorkspacePageComponent
  extends WorkspaceAi,
    WorkspaceAdjust,
    WorkspacePairing,
    WorkspaceSelection,
    WorkspaceBatch,
    WorkspaceView,
    WorkspaceJson {}
for (const part of WORKSPACE_PARTS) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name !== 'constructor') {
      const descriptor = Object.getOwnPropertyDescriptor(part.prototype, name);
      if (descriptor) {
        Object.defineProperty(WorkspacePageComponent.prototype, name, descriptor);
      }
    }
  }
}
