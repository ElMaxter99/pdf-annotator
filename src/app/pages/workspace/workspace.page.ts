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
  JsonShapeError,
  JsonTreePreview,
  buildJsonTreePath,
  buildJsonTreePreview,
  countLineBreaks,
  getTextareaLineHeight,
  indentJsonBlock,
  isEditableElement,
  parseNumericList,
  serializeFieldForJson,
} from '../../utils/json-text.utils';
import {
  ZOOM_PRESETS,
  centerScrollLeft,
  clampScale,
  doubleClickZoomTarget,
  fitPageScale,
  fitPageScaleForOverflow,
  fitWidthScale,
  homeScrollLeft,
  isDoubleClick,
  panScrollPosition,
  stepScale,
  wheelZoomFactor,
  workMarginFor,
  zoomAnchorScrollDelta,
  zoomLimitFor,
  type ViewerClick,
  type ZoomLimit,
} from '../../utils/zoom.utils';
import {
  initialWheelPageState,
  wheelEdgeStep,
  type WheelPageState,
} from '../../utils/wheel-page.utils';
import { AiHelperService, AiRequestError, type AiProvider } from '../../services/ai-helper.service';
import {
  confidenceLevel,
  isRowSelected,
  rowChangesPage,
  summarizeAi,
  type AiRow,
} from '../../utils/ai-proposal.utils';
import { effectiveAiInstructions } from '../../utils/ai-instructions.utils';
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
import { FieldType, PageAnnotations, PageField } from '../../models/annotation.model';
import { extendPagePattern } from '../../utils/page-pattern.utils';
import {
  PageSize,
  pageScaleFactors,
  sizeOfPage,
  sizesDiffer,
} from '../../utils/page-scale.utils';
import {
  clampPageNumber,
  holdPageOfB,
  linkedPageTotal,
} from '../../utils/page-link.utils';
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
import { WorkspaceSelection } from './workspace-selection';
import { WorkspacePairing } from './workspace-pairing';
import { WorkspaceAdjust } from './workspace-adjust';
import { WorkspaceAi } from './workspace-ai';
import { PageThumbnailGenerator } from './page-thumbnail-generator';
import {
  CustomFontEntry,
  DEFAULT_FONT_ID,
  FontCatalogService,
  FontOption,
} from '../../fonts/font-catalog.service';
import { FontVariantDescriptor } from '../../fonts/font-variant';
import {
  AnnotationImportService,
  ImportReport,
} from '../../services/annotation-import.service';
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
import {
  FieldState,
  computeFieldStates,
  fieldKey,
  summarizeStates,
} from '../../utils/migration.utils';
import { PendingFileService, PendingRestore } from '../../services/pending-file.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { isPdfFile } from '../../utils/pdf-file.utils';
import { BATCH_ITEM_PARAM, BATCH_OPEN_VIEW, batchItemOpening } from '../../utils/batch-open.utils';
import type { BatchItem, PageMapData } from '../../models/batch.model';
import {
  type PageSuggestion,
  mapPageOfA,
  suggestPageMap,
} from '../../utils/page-map.utils';
import { matchTemplate, parsePastedTemplates } from '../../utils/template-paste.utils';
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
import {
  AlignMode,
  alignBoxes,
  DistributeAxis,
  distributeBoxes,
} from '../../utils/alignment.utils';
import { CoalescingRunner } from '../../utils/coalescing-runner';
import { LooseJsonError, parseLooseJson } from '../../utils/loose-json';
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
  hexToRgbComponents,
  normalizeColor,
  normalizeHexInput,
  parseColorComponents,
  parseRgbText,
  rgbToHex,
  toRgbString,
} from '../../utils/color.utils';
import { formatNumberWithTruncation, toFiniteNumber } from '../../utils/number.utils';
import { offsetFieldCopy } from '../../utils/paste-offset.utils';
import { moveFieldWithinPage } from '../../utils/field-move.utils';
import { pixelToPdfPoint } from '../../utils/pdf-coords.utils';
import { resolveShortcut, type ShortcutAction } from '../../utils/shortcuts.utils';
import { findAnchors, type PageTextItem } from '../../utils/text-anchors.utils';
import {
  type AdjustAnchorRow,
  type AdjustField,
  type AdjustMode,
  effectiveShift,
  fieldVisual,
  formatShift,
  hitAdjustField,
  isFieldMoved,
  collectAdjustFields,
  existingFieldKeys,
  recomputeFields,
} from '../../utils/adjust-session.utils';
import {
  aiProposalField,
  aiTemplateMap,
  loadingAiSession,
  savedAiSession,
  withAiRowEdit,
  withAiEvent,
  withAiProgress,
  type AiSession,
} from '../../utils/ai-session.utils';
import { readPageTexts } from '../../services/pdf-text.service';
import { closestByName, closestElementIndex, lineBetween, pairName, type PairCandidate } from '../../utils/pairing.utils';

import {
  REFERENCE_MODE_KEY,
  WHEEL_PAGING_KEY,
  WheelEdgeIndicator,
  PreviewState,
  EditState,
  JsonViewMode,
  EditorMode,
  SIDEBAR_TABS,
  SidebarTab,
  AUTO_APPLY_JSON_DELAY_MS,
  SESSION_SAVE_DELAY_MS,
  MAX_JSON_IMPORT_BYTES,
  AdjustSession,
  ADJUST_UI,
  NoticeId,
  PairRefB,
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
  private workMarginObserver: ResizeObserver | null = null;
  private observedAPane: HTMLElement | null = null;
  /** `scrollLeft` del reposo del panel A desenlazado (C1), para saber si alguien lo ha movido. */
  private aHomeLeft = 0;
  readonly zoomMenuOpen = signal(false);
  /** The wheel past the edge of the sheet changes page (P-63); on by default, switched off in ⋯. */
  readonly wheelPaging = signal(this.storedWheelPaging());
  /** Edge indicator while pushing the wheel at the top or bottom of the sheet. */
  readonly wheelEdge = signal<WheelEdgeIndicator | null>(null);
  private wheelState: WheelPageState = initialWheelPageState();
  private wheelEdgeTimer: ReturnType<typeof setTimeout> | null = null;
  readonly zoomPresets = ZOOM_PRESETS;
  /** Space is held: dragging moves the canvas instead of annotating. */
  readonly panReady = signal(false);
  readonly panning = signal(false);
  private zoomHudTimer: ReturnType<typeof setTimeout> | null = null;
  private zoomPending: { requested: number; anchor: { clientX: number; clientY: number } | null } | null = null;
  private zoomBusy = false;
  private panDrag: { x: number; y: number; left: number; top: number; viewer: HTMLElement } | null = null;
  private readonly panDownHandler = (evt: PointerEvent) => this.onPanPointerDown(evt);
  private readonly panMoveHandler = (evt: PointerEvent) => this.onPanPointerMove(evt);
  private readonly panUpHandler = () => this.endPan();
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
  private readonly templatesService = inject(AnnotationTemplatesService);
  private readonly metadataService = inject(AppMetadataService);
  private readonly pendingFileService = inject(PendingFileService);
  private readonly pdfExportService = inject(PdfExportService);
  readonly toast = inject(ToastService);
  private readonly sessionStore = inject(SessionStoreService);
  private readonly store = inject(AnnotationStore);
  private readonly router = inject(Router);
  readonly batch = inject(BatchStoreService);
  private readonly annotationImport = inject(AnnotationImportService);
  readonly aiHelper = inject(AiHelperService);
  private readonly fontCatalog = inject(FontCatalogService);
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
  private readonly aPagesForB = this.pageLink.aPagesForB;
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
  private pageMapToken = 0;
  private splitDoc: { blob: Blob; doc: Promise<PDFDocumentProxy> } | null = null;
  private splitToken = 0;
  private referencePdfToken = 0;
  private splitTask: { cancel: () => void } | null = null;
  private scaleBeforeSplit: number | null = null;
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
  private batchSaveTimer: ReturnType<typeof setTimeout> | null = null;
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
  private readonly coordsFileInputChangeHandler = (event: Event) =>
    this.onCoordsFileSelected(event);
  private coordsFileInputFallback: HTMLInputElement | null = null;
  private autoApplyCoordsTimer: ReturnType<typeof setTimeout> | null = null;

  /** Original file of the open PDF, kept so the session can be saved and restored. */
  private sessionFile: File | null = null;
  private sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private pdfByteSources = new Map<string, { bytes: Uint8Array; weight: number }>();
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

  private refreshOverlay(
    activeRect?: { left: number; top: number; width: number; height: number } | null,
    guides?: OverlayGuide[],
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

    drawGrid(ctx, settings, overlay.width, overlay.height, scale);
    drawRulers(ctx, settings, overlay.width, overlay.height, scale);
    drawStaticGuides(ctx, settings, overlay.width, overlay.height, scale);

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
    if (e.aiRowId) {
      this.saveAiRowEdit(e.aiRowId, this.prepareFieldForStorage(e.field));
      this.editing.set(null);
      this.closeFontDropdown('edit');
      return;
    }
    if (!fieldHasRenderableContent(e.field)) {
      this.editing.set(null);
      this.closeFontDropdown('edit');
      return;
    }
    const normalized = this.prepareFieldForStorage(e.field);
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
    if (e.aiRowId) {
      // In the proposal, «eliminar» leaves the field out of what «Aplicar» creates.
      const session = this.ai();
      if (session) {
        this.patchAi({ overrides: { ...session.overrides, [e.aiRowId]: false } });
      }
      this.editing.set(null);
      return;
    }
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
    this.clipboard = { ...sanitized };
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
    if (this.jsonTreePreview().status !== 'ready') {
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

    component.focusPath(buildJsonTreePath(pageIndex, fieldIndex), { smooth: true });
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
    text: string,
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
    return indentJsonBlock(
      buildJsonExportPayload([page], (field) => this.serializeFieldForJson(field)).pages[0],
      '    ',
    );
  }

  private buildFieldJsonBlock(field: PageField): string {
    return indentJsonBlock(this.serializeFieldForJson(field), '        ');
  }

  private highlightTextareaRange(
    textarea: HTMLTextAreaElement,
    range: { start: number; end: number },
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

    const lineHeight = getTextareaLineHeight(textarea, this.document);
    const precedingText = textarea.value.slice(0, start);
    const lineIndex = countLineBreaks(precedingText);
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
  private countSampleFields(): number {
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
            : (evt) => this.drag.pointerDown(evt, pageIndex, fieldIndex);
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

  /** Paints the fields of A (read only) behind those of B. */
  redrawReference() {
    const layer = this.referenceLayerRef?.nativeElement;
    if (!layer) {
      return;
    }
    layer.textContent = '';
    layer.classList.remove('reference-layer--interactive');
    const m = this.migration();
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (this.adjust()?.phase === 'ready' && canvas) {
      this.drawAdjustPreview(layer, canvas.height);
      return;
    }
    if (this.ai()?.phase === 'ready' && canvas) {
      this.drawAiPreview(layer, canvas.height);
      return;
    }
    if (!m || !canvas || this.splitActive()) {
      return;
    }
    const onlyA = this.showingOnlyA();
    if (!onlyA && this.referenceMode() === 'toggle') {
      return;
    }

    const page = this.pageIndex();
    const pageA = this.aPage();
    const draw = (name: string, x: number, y: number, fontSize: number, missing: boolean) =>
      this.drawReferenceField(layer, canvas.height, name, x, y, fontSize, missing, onlyA);

    if (onlyA) {
      void this.drawReferencePdf(layer, canvas);
      for (const field of pageA === null ? [] : this.fieldsOfA(pageA)) {
        draw(field.name, field.x, field.y, field.fontSize, field.missing);
      }
      return;
    }
    if (pageA === null || this.bGhost()) {
      return;
    }
    if (pageA !== page && !this.tableLinked()) {
      // Free pages: the fields of the page of A that is open, with no state against B.
      for (const field of this.fieldsOfA(pageA)) {
        draw(field.name, field.x, field.y, field.fontSize, false);
      }
      return;
    }

    for (const state of m.states) {
      if (state.page !== page || !state.a || state.status === 'same') {
        continue;
      }
      draw(state.a.name, state.a.x, state.a.y, state.a.fontSize, state.status === 'missing');
    }
  }

  /** Holding «A» swaps the page for the PDF of A, even when A has no template. */
  private async drawReferencePdf(layer: HTMLElement, bCanvas: HTMLCanvasElement): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    const token = ++this.referencePdfToken;
    try {
      const doc = await this.splitDocOf(item.aPdf);
      const wanted = this.aPage();
      if (wanted === null || wanted > doc.numPages) {
        return;
      }
      const page = await doc.getPage(wanted);
      const viewport = page.getViewport({ scale: this.scale() });
      const geometry = this.geometryForA(page);
      const canvas = document.createElement('canvas');
      canvas.className = 'reference-pdf';
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      canvas.style.width = `${bCanvas.clientWidth || canvas.width}px`;
      canvas.style.height = `${bCanvas.clientHeight || canvas.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      await page.render({ canvasContext: ctx, canvas, viewport, transform: geometry.transform })
        .promise;
      if (token === this.referencePdfToken && this.showingOnlyA() && layer.isConnected) {
        layer.querySelectorAll('.reference-pdf').forEach((old) => old.remove());
        layer.prepend(canvas);
      }
    } catch {
      /* the fields of A are still shown */
    }
  }

  private pageSizesKey: { a: Blob; b: PDFDocumentProxy } | null = null;

  private async updatePagesDiffer(aPdf: Blob | null): Promise<void> {
    if (!aPdf) {
      this.pagesDiffer.set(null);
      this.pageCountA.set(0);
      this.pageSizesA.set([]);
      this.pageSizesB.set([]);
      return;
    }
    try {
      const docA = await this.splitDocOf(aPdf);
      const docB = this.pdfDoc();
      const a = docA.numPages;
      const b = docB?.numPages ?? 0;
      this.pagesDiffer.set(b > 0 && a !== b ? { a, b } : null);
      this.pageCountA.set(a);
      if (!this.pagesLinked() && this.freeAPage() > a) {
        this.freeAPage.set(a);
      }
      if (this.commonPage() < this.pageIndex()) {
        this.commonPage.set(this.pageIndex());
      }
      if (docB && (this.pageSizesKey?.a !== aPdf || this.pageSizesKey?.b !== docB)) {
        this.pageSizesKey = { a: aPdf, b: docB };
        const sizesOf = async (doc: PDFDocumentProxy) => {
          const sizes: PageSize[] = [];
          for (let num = 1; num <= doc.numPages; num++) {
            const view = (await doc.getPage(num)).getViewport({ scale: 1 });
            sizes.push({ w: view.width, h: view.height });
          }
          return sizes;
        };
        const [sizesA, sizesB] = await Promise.all([sizesOf(docA), sizesOf(docB)]);
        if (this.pageSizesKey?.a === aPdf && this.pageSizesKey?.b === docB) {
          this.pageSizesA.set(sizesA);
          this.pageSizesB.set(sizesB);
        }
      }
    } catch {
      this.pagesDiffer.set(null);
      this.pageCountA.set(0);
    }
  }

  /** «Ajustar» / «Dejarlas como están»: remembers the choice for the open PDF of the batch. */
  setFitA(fit: boolean | undefined): void {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.setFitA(item.id, fit);
    }
  }

  /**
   * Size and transform to draw the page of A: its own size, or the size of B with the page
   * stretched to it when the coordinates of A are scaled.
   */
  private geometryForA(page: PDFPageProxy): {
    width: number;
    height: number;
    transform: number[] | undefined;
  } {
    const scale = this.scaleOfA();
    const own = page.getViewport({ scale });
    const target = sizeOfPage(this.pageSizesB(), this.pageIndex());
    if (!this.fitA() || !target) {
      return { width: Math.floor(own.width), height: Math.floor(own.height), transform: undefined };
    }
    const base = page.getViewport({ scale: 1 });
    return {
      width: Math.floor(target.w * scale),
      height: Math.floor(target.h * scale),
      transform: [target.w / base.width, 0, 0, target.h / base.height, 0, 0],
    };
  }

  splitDocOf(blob: Blob): Promise<PDFDocumentProxy> {
    if (!this.splitDoc || this.splitDoc.blob !== blob) {
      const doc = blob
        .arrayBuffer()
        .then((buffer) => pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise);
      this.splitDoc = { blob, doc };
    }
    return this.splitDoc.doc;
  }

  /** Every field of A on a page, flagged when B does not have it yet. */
  fieldsOfA(page: number) {
    const m = this.migration();
    if (!m) {
      return [];
    }
    const out: { name: string; x: number; y: number; fontSize: number; missing: boolean }[] = [];
    for (const aPage of this.aPagesView()) {
      if (aPage.num !== page) {
        continue;
      }
      for (const field of aPage.fields) {
        const name = (field.mapField || field.value || '').trim();
        const sameAsB = this.tableLinked() ? page === this.aPage() : page === this.pageIndex();
        const missing =
          sameAsB &&
          m.states.some(
            (state) =>
              state.status === 'missing' && state.page === this.pageIndex() && state.name === name,
          );
        out.push({ name, x: field.x, y: field.y, fontSize: field.fontSize, missing });
      }
    }
    return out;
  }

  drawReferenceField(
    layer: HTMLElement,
    canvasHeight: number,
    name: string,
    x: number,
    y: number,
    fontSize: number,
    missing: boolean,
    solo: boolean,
    scale = this.scale(),
  ) {
    const px = Number(x);
    const py = Number(y);
    const size = Math.max(6, Number(fontSize) || 12);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return;
    }
    const el = document.createElement('div');
    el.className = 'reference-field';
    el.classList.toggle('reference-field--missing', missing);
    el.classList.toggle('reference-field--solo', solo);
    el.textContent = name;
    el.title = name;
    el.dataset['name'] = name;
    el.style.left = `${px * scale}px`;
    el.style.top = `${canvasHeight - py * scale - size * scale}px`;
    el.style.height = `${size * scale * 1.2}px`;
    el.style.minWidth = `${Math.max(24, name.length * size * 0.55 * scale)}px`;
    el.style.fontSize = `${Math.max(10, size * scale * 0.8)}px`;
    layer.appendChild(el);
  }

  private storedReferenceMode(): 'overlay' | 'toggle' | 'split' {
    try {
      const value =
        typeof localStorage !== 'undefined' ? localStorage.getItem(REFERENCE_MODE_KEY) : null;
      return value === 'toggle' || value === 'split' ? value : 'overlay';
    } catch {
      return 'overlay';
    }
  }

  /** Changes how A is shown. «Dividida» also fits both pages in the viewer. */
  async setReferenceMode(mode: 'overlay' | 'toggle' | 'split'): Promise<void> {
    this.referenceMode.set(mode);
    if (mode !== 'split') {
      this.splitLinked.set(true);
    }
    try {
      localStorage.setItem(REFERENCE_MODE_KEY, mode);
    } catch {
      /* storage unavailable */
    }
    if (mode === 'split') {
      await this.fitSplit();
    } else if (this.scaleBeforeSplit !== null) {
      this.scale.set(this.scaleBeforeSplit);
      this.scaleBeforeSplit = null;
      await this.render();
      this.redrawAllForPage();
    }
    this.resetViewerScroll();
  }

  /** True while «Dividida» is active and A has its own zoom and scroll (P-61). */
  unlinkedSplit(): boolean {
    return this.splitActive() && !this.splitLinked();
  }

  /** Scale used to draw A: its own while unlinked, otherwise B's. */
  scaleOfA(): number {
    return this.unlinkedSplit() ? this.scaleA() : this.scale();
  }

  private splitAPane(): HTMLElement | null {
    return (this.splitLayerRef?.nativeElement.closest('.canvas-container--split-a') as HTMLElement | null) ?? null;
  }

  private isOverSplitA(evt: { clientX: number; clientY: number }): boolean {
    const pane = this.splitAPane();
    if (!pane) return false;
    const r = pane.getBoundingClientRect();
    return evt.clientX >= r.left && evt.clientX <= r.right && evt.clientY >= r.top && evt.clientY <= r.bottom;
  }

  /** Chip «Enlazado / Desenlazado»: A and B stop (or start again) sharing zoom and scroll. */
  async toggleSplitLink(): Promise<void> {
    if (!this.splitActive()) return;
    if (this.splitLinked()) {
      this.scaleA.set(this.scale());
      this.splitLinked.set(false);
      this.updateSplitHeight();
      this.toast.show(this.translationService.translate('batch.editor.split.unlinkedToast'), 'info', 4000);
    } else {
      const pane = this.splitAPane();
      const before = { scale: this.scaleA(), left: pane?.scrollLeft ?? 0, top: pane?.scrollTop ?? 0 };
      this.splitLinked.set(true);
      if (pane) {
        pane.scrollLeft = 0;
        pane.scrollTop = 0;
      }
      this.toast.show(
        this.translationService.translate('batch.editor.split.linkedToast', {
          percent: Math.round(this.scale() * 100),
        }),
        'info',
        4000,
        false,
        {
          label: this.translationService.translate('controls.undo'),
          run: () => void this.undoSplitLink(before),
        },
      );
    }
    await this.renderSplit();
    this.resetViewerScroll();
  }

  /** «Deshacer» of the relink notice: A goes back to its own zoom and position. */
  private async undoSplitLink(before: { scale: number; left: number; top: number }): Promise<void> {
    if (!this.splitActive() || !this.splitLinked()) return;
    this.scaleA.set(before.scale);
    this.splitLinked.set(false);
    this.updateSplitHeight();
    await this.renderSplit();
    // Espera a que el panel A termine de crecer (su margen propio, C1) para que la posición no se recorte.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const pane = this.splitAPane();
    if (pane) {
      pane.scrollLeft = before.left;
      pane.scrollTop = before.top;
      this.aHomeLeft = Number.NaN;
    }
  }

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

  /** Zoom of A alone (unlinked «Dividida»), keeping the point under the cursor. */
  async zoomSplitA(requested: number, anchor: { clientX: number; clientY: number } | null) {
    const pane = this.splitAPane();
    const canvas = this.splitCanvasRef?.nativeElement;
    const next = clampScale(requested);
    this.showZoomHud(next, zoomLimitFor(requested), 'A');
    const previous = this.scaleA();
    if (next === previous || !pane || !canvas) return;
    const before = canvas.getBoundingClientRect();
    this.scaleA.set(next);
    await this.renderSplit();
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (anchor) {
      const after = canvas.getBoundingClientRect();
      const ux = (anchor.clientX - before.left) / previous;
      const uy = (anchor.clientY - before.top) / previous;
      pane.scrollLeft += after.left + ux * next - anchor.clientX;
      pane.scrollTop += after.top + uy * next - anchor.clientY;
    }
  }

  /** Zoom so that two pages fit side by side in the viewer. */
  private async fitSplit(): Promise<void> {
    const viewer = this.pdfViewerRef?.nativeElement.closest('.viewer') as HTMLElement | null;
    if (!viewer || !this.pdfDoc()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve));
    const page = await this.pdfDoc()!.getPage(this.pageIndex());
    const baseWidth = page.getViewport({ scale: 1 }).width;
    const style = getComputedStyle(viewer);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const available = (viewer.clientWidth - padding - 24) / 2;
    if (!(baseWidth > 0) || !(available > 0)) {
      return;
    }
    if (this.scaleBeforeSplit === null) {
      this.scaleBeforeSplit = this.scale();
    }
    this.scale.set(Math.min(4, Math.max(0.25, Math.floor((available / baseWidth) * 100) / 100)));
    await this.render();
    this.redrawAllForPage();
    this.resetViewerScroll();
  }

  /** «Dividida»: the field under the pointer (in A or in B) is highlighted in both panes. */
  onSplitHover(event: MouseEvent): void {
    if (!this.splitActive()) {
      return;
    }
    const aLayer = this.splitLayerRef?.nativeElement;
    const bLayer = this.annotationsLayerRef?.nativeElement;
    if (!aLayer || !bLayer) {
      return;
    }
    const hit = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      );
    };
    let name: string | null = null;
    for (const el of Array.from(aLayer.querySelectorAll<HTMLElement>('.reference-field'))) {
      if (hit(el)) {
        name = el.dataset['name'] ?? null;
        break;
      }
    }
    if (name === null) {
      const fields = this.coords().find((page) => page.num === this.pageIndex())?.fields ?? [];
      for (const el of Array.from(bLayer.querySelectorAll<HTMLElement>('.annotation'))) {
        if (hit(el)) {
          const field = fields[Number(el.dataset['fieldIndex'])];
          name = field ? (field.mapField || field.value || '').trim() : null;
          break;
        }
      }
    }
    this.markPair(name);
    this.hoverPairB(event);
  }

  clearSplitHover(): void {
    this.markPair(null);
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

  /** Draws A (its PDF and its fields) in the left pane of «Dividida». */
  async renderSplit(): Promise<void> {
    this.updateSplitHeight();
    const token = ++this.splitToken;
    const item = this.batch.activeItem();
    if (!this.splitActive() || !item) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve));
    const canvas = this.splitCanvasRef?.nativeElement;
    const layer = this.splitLayerRef?.nativeElement;
    if (!canvas || !layer || token !== this.splitToken) {
      return;
    }
    try {
      const doc = await this.splitDocOf(item.aPdf);
      const wanted = this.aPage();
      if (wanted === null || wanted > doc.numPages) {
        // A has no page here: an empty pane of the size of B's page (the template draws the text).
        this.splitTask?.cancel();
        const bCanvas = this.pdfCanvasRef?.nativeElement;
        canvas.width = bCanvas?.width || 1;
        canvas.height = bCanvas?.height || 1;
        layer.textContent = '';
        return;
      }
      const pageNumber = wanted;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: this.scaleOfA() });
      const ctx = canvas.getContext('2d');
      if (!ctx || token !== this.splitToken) {
        return;
      }
      const geometry = this.geometryForA(page);
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      // pdf.js refuses two renders at once on a canvas: the newer one cancels the older.
      this.splitTask?.cancel();
      const task = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
        transform: geometry.transform,
      });
      this.splitTask = task;
      try {
        await task.promise;
      } catch {
        return; // cancelled by a newer render, which draws the fields
      }
      if (token !== this.splitToken) {
        return;
      }
      layer.textContent = '';
      for (const field of this.fieldsOfA(pageNumber)) {
        this.drawReferenceField(
          layer,
          canvas.height,
          field.name,
          field.x,
          field.y,
          field.fontSize,
          field.missing,
          false,
          this.scaleOfA(),
        );
      }
      this.drawAdjustPins(layer, canvas.height, 'a');
      // A is drawn asynchronously: a hover that started before it finished is applied now.
      this.markAdjustHoverInSplit();
    } catch (error) {
      console.warn('No se pudo dibujar la versión A en la vista dividida.', error);
    }
  }

  /** The template of A by the page of B it goes with (the table decides; without one, by number). */
  normalizedTemplateA(): PageAnnotations[] {
    return this.normalizeTemplate(this.aPagesForB());
  }

  /** The template of A by its own page numbers (what the AI helper and free pages work with). */
  normalizedTemplateOfA(): PageAnnotations[] {
    return this.normalizeTemplate(this.aPagesView());
  }

  private normalizeTemplate(pages: PageAnnotations[]): PageAnnotations[] {
    if (!this.batch.activeItem()) {
      return [];
    }
    return (
      this.annotationImport.normalizeImportedCoordinates({ pages }, (field) =>
        this.prepareFieldForStorage(field),
      ) ?? []
    );
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

  /** Puts A's template into B: everything (replaces B) or only what B still lacks. One undo step. */
  applyTemplateA(mode: 'replace' | 'missing') {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    const pageA = this.aPage();
    if (this.pageOffset() && pageA !== null) {
      this.confirmCopyPageOfA(mode, pageA, this.pageIndex());
      return;
    }
    const map = this.pageMap();
    if (mode === 'replace') {
      if (map) {
        // Only the pages of B that have a page of A are replaced; the others are left alone.
        const kept = this.coords().filter((page) => map.pairs[page.num - 1] === null);
        this.replaceCoords(
          [...kept, ...this.normalizedTemplateA()].sort((x, y) => x.num - y.num),
        );
      } else {
        this.replaceCoords(this.normalizedTemplateA());
      }
    } else {
      this.addMissingFromA(
        this.migration()?.states.filter((state) => state.status === 'missing') ?? [],
      );
    }
    if (map) {
      this.toast.show(
        this.translationService.translate('batch.editor.pageMap.copied', {
          count: map.pairs.filter((a) => a !== null).length,
          unmapped: map.pairs.filter((a) => a === null).length,
        }),
      );
      return;
    }
    if (this.fitA()) {
      this.toast.show(this.translationService.translate('toast.batch.copiedAdjusted'));
    }
  }

  // ---- «Emparejar páginas» (tabla A↔B, P-78 a P-81) -------------------------------------------

  openPageMap(): void {
    if (this.comparing()) {
      this.pageMapOpen.set(true);
    }
  }

  closePageMap(): void {
    this.pageMapToken += 1;
    this.pageMapOpen.set(false);
  }

  /** Stops a text reading that is still running (the dialog's «Cancelar lectura»). */
  cancelPageMapReading(): void {
    this.pageMapToken += 1;
  }

  pageTagKey(kind: 'missing' | 'offset' | 'mapped' | 'unmapped'): string {
    return `batch.editor.pages.tag${kind[0].toUpperCase()}${kind.slice(1)}`;
  }

  /** Saves the table of the open pair (`undefined` = by number again). «Deshacer» for 10 s. */
  applyPageMap(map: PageMapData | undefined): void {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    const before = item.pageMap;
    const change = (next: PageMapData | undefined) => {
      this.batch.setPageMap(item.id, next);
      this.commonPage.set(this.pageIndex());
      this.selection.set(null);
    };
    change(map);
    this.closePageMap();
    this.toast.show(
      this.translationService.translate(
        map ? 'batch.editor.pageMap.applied' : 'batch.editor.pageMap.cleared',
        { count: map?.pairs.filter((a) => a !== null).length ?? 0, total: map?.pairs.length ?? 0 },
      ),
      'info',
      10000,
      false,
      {
        label: this.translationService.translate('controls.undo'),
        run: () => change(before),
      },
    );
  }

  /** Reads the text of every page of A and B and suggests the table; rows set by hand are kept. */
  async suggestPageMapFromTexts(
    keep: PageMapData | null,
    onProgress: (done: number, total: number) => void,
  ): Promise<PageSuggestion | 'noText' | null> {
    const item = this.batch.activeItem();
    const docB = this.pdfDoc();
    if (!item || !docB) {
      return 'noText';
    }
    const token = ++this.pageMapToken;
    try {
      const docA = await this.splitDocOf(item.aPdf);
      const total = docA.numPages + docB.numPages;
      let done = 0;
      const read = async (doc: PDFDocumentProxy): Promise<string[]> => {
        const out: string[] = [];
        for (let num = 1; num <= doc.numPages; num++) {
          if (token !== this.pageMapToken) {
            throw new Error('cancelled');
          }
          out.push((await readPageTexts(doc, num)).map((text) => text.text).join(' '));
          done += 1;
          onProgress(done, total);
        }
        return out;
      };
      const textsA = await read(docA);
      const textsB = await read(docB);
      if (!textsA.some((text) => text.trim()) || !textsB.some((text) => text.trim())) {
        return 'noText';
      }
      return suggestPageMap(textsA, textsB, keep);
    } catch {
      return token !== this.pageMapToken ? null : 'noText';
    }
  }

  /** Free pages: «Poner plantilla A» copies the page of A that is open into the page of B that is open. */
  private confirmCopyPageOfA(mode: 'replace' | 'missing', pageA: number, pageB: number): void {
    this.toast.show(
      this.translationService.translate('batch.editor.pages.copyConfirm', { a: pageA, b: pageB }),
      'info',
      10000,
      false,
      {
        label: this.translationService.translate('batch.editor.pages.copyAction'),
        run: () => this.copyPageOfAToB(mode, pageA, pageB),
      },
    );
  }

  private copyPageOfAToB(mode: 'replace' | 'missing', pageA: number, pageB: number): void {
    const source = this.normalizedTemplateOfA().find((page) => page.num === pageA)?.fields ?? [];
    const nameOf = (field: PageField) => (field.mapField || field.value || '').trim();
    const present = new Set(
      (this.coords().find((page) => page.num === pageB)?.fields ?? []).map(nameOf),
    );
    const toAdd = mode === 'replace' ? source : source.filter((field) => !present.has(nameOf(field)));
    if (!toAdd.length && mode !== 'replace') {
      return;
    }
    const changed = this.applyCoordsChange(() => {
      let pages = this.coords();
      if (mode === 'replace') {
        pages = pages.map((page) => (page.num === pageB ? { ...page, fields: [] } : page));
      }
      for (const field of toAdd) {
        pages = addFieldToPages(pageB, { ...field }, pages);
      }
      this.coords.set(pages);
    });
    if (changed) {
      this.syncCoordsTextModel();
      this.redrawAllForPage();
    }
  }

  placeMissing(state: FieldState) {
    this.addMissingFromA([state]);
  }

  private addMissingFromA(states: readonly FieldState[]) {
    const template = this.normalizedTemplateA();
    const toAdd: Array<{ page: number; field: PageField }> = [];
    for (const state of states) {
      const source = template
        .find((page) => page.num === state.page)
        ?.fields.find(
          (field) =>
            (field.mapField || field.value || '').trim() === state.name &&
            field.x === state.a?.x &&
            field.y === state.a?.y,
        );
      if (source) {
        toAdd.push({ page: state.page, field: { ...source } });
      }
    }
    if (!toAdd.length) {
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
      this.redrawAllForPage();
    }
  }

  dismissMissing(state: FieldState) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.dismiss(item.id, fieldKey(state.page, state.name));
    }
  }

  restoreDismissed(key: string) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.restore(item.id, key);
    }
  }

  dismissedLabel(key: string): string {
    const separator = key.indexOf('|');
    return separator >= 0 ? key.slice(separator + 1) : key;
  }

  linkField(state: FieldState, aName: string) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.link(item.id, { page: state.page, b: state.name, a: aName });
    }
  }

  unlinkField(state: FieldState) {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.unlink(item.id, state.page, state.name);
    }
  }

  /** Goes to the field's page and selects it in B (missing fields only change the page). */
  async focusField(state: FieldState) {
    if (state.page !== this.pageIndex()) {
      await this.setPageIndex(state.page);
    }
    if (state.b) {
      this.selection.set({ pageIndex: state.b.pageIndex, fields: [state.b.fieldIndex] });
      this.redrawAllForPage();
    }
    // La pareja de A (misma página de B por la tabla o el número) resaltada y unida con una línea.
    const target: PairTarget = {
      aName: state.a?.name ?? '',
      aPage: state.a ? this.aPage() : null,
      aX: state.a?.x,
      aY: state.a?.y,
      b: state.b ? { kind: 'field', page: state.page, pageIndex: state.b.pageIndex, index: state.b.fieldIndex } : null,
    };
    await this.revealPair(target);
    if (!state.b) {
      this.runAfterRender(() => this.showPairTip(this.findPairElementA(target), 'pairing.noPartnerB'));
    } else if (!state.a) {
      this.runAfterRender(() => this.showPairTip(this.findPairElementB(target), 'pairing.noPartnerA'));
    }
  }

  private scheduleBatchSave() {
    if (this.batchSaveTimer) {
      clearTimeout(this.batchSaveTimer);
      this.batchSaveTimer = null;
    }
    if (!this.batch.activeItem() || !this.pdfDoc() || typeof window === 'undefined') {
      return;
    }
    this.batchSaveTimer = setTimeout(() => {
      this.batchSaveTimer = null;
      this.flushBatchSave();
    }, 300);
  }

  /** Stores B in the batch. Skips the write when nothing changed so opening never un-validates. */
  private flushBatchSave(force = false) {
    if (this.batchSaveTimer) {
      clearTimeout(this.batchSaveTimer);
      this.batchSaveTimer = null;
    }
    const item = this.batch.activeItem();
    if (!item || !this.pdfDoc()) {
      return;
    }
    const pages = this.store.snapshot();
    const json = jsonExportText(
      buildJsonExportPayload(pages, (field) => this.serializeFieldForJson(field)),
    );
    if (!force && json === item.bJson) {
      return;
    }
    this.batch.saveB(item.id, pages, json);
  }

  /** Moves to the previous (-1) or next (+1) PDF of the batch without leaving the editor. */
  async goBatchItem(delta: number) {
    const ctx = this.batchCtx();
    if (!ctx) {
      return;
    }
    const target = this.batch.items()[ctx.index + delta];
    if (!target) {
      return;
    }
    await this.switchBatchItem(target);
  }

  async switchBatchItem(target: BatchItem): Promise<void> {
    this.flushBatchSave();
    this.cancelAi();
    this.batch.activate(target.id);
    this.clearSelection();
    void this.router.navigate(['/workspace'], {
      queryParams: { [BATCH_ITEM_PARAM]: target.id },
      replaceUrl: true,
    });
    await this.openBatchPdf(target);
  }

  /** Loads the PDF to edit for a batch item: B when it has one, otherwise A with its template. */
  private async openBatchPdf(
    item: BatchItem,
    coordsOverride: PageAnnotations[] | null = null,
  ): Promise<void> {
    const opening = batchItemOpening(item);
    const coords = coordsOverride ?? opening.coords;
    await this.loadPdfFile(opening.file, coords ? { coords, ...BATCH_OPEN_VIEW } : null);
  }

  /** «Documento» tab of a batch PDF: swaps the PDF being edited and keeps its annotations. */
  async batchReplacePdf(file: File): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    if (!isPdfFile(file)) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }
    this.flushBatchSave(true);
    this.batch.replacePdf(item.id, file);
    this.clearSelection();
    const updated = this.batch.activeItem();
    if (updated) {
      await this.openBatchPdf(updated, this.store.snapshot());
    }
  }

  /** Adds the new version (B). Annotations already placed become the template A if it was empty. */
  async batchAddVersionB(file: File): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    if (!isPdfFile(file)) {
      this.toast.error(this.translationService.translate('app.upload.invalidFormat'));
      return;
    }
    const placed = this.store.snapshot();
    if (
      !item.bPdf &&
      !item.aPages.some((page) => page.fields.length) &&
      placed.some((p) => p.fields.length)
    ) {
      this.batch.setTemplate(item.id, placed);
      this.toast.show(this.translationService.translate('toast.batch.templateFromAnnotations'));
    }
    this.batch.setB(item.id, file);
    this.clearSelection();
    const updated = this.batch.activeItem();
    if (updated) {
      await this.openBatchPdf(updated);
    }
  }

  /** Drops B and goes back to editing the original PDF with its template. */
  async batchRemoveVersionB(): Promise<void> {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    this.batch.removeB(item.id);
    this.clearSelection();
    const updated = this.batch.activeItem();
    if (updated) {
      await this.openBatchPdf(updated);
    }
  }

  /**
   * Sets the template A from a JSON file or pasted text. Returns an error key, or `null` when it
   * worked. Without B the template is also loaded into the editor (one undo step).
   */
  async batchSetTemplate(
    source: { file: File } | { text: string },
  ): Promise<'tooBig' | 'json' | 'noPages' | null> {
    const item = this.batch.activeItem();
    if (!item) {
      return null;
    }
    let data: unknown;
    try {
      if ('file' in source) {
        if (source.file.size > 5 * 1024 * 1024) {
          return 'tooBig';
        }
        data = parseLooseJson(await source.file.text());
      } else {
        if (source.text.length > 5 * 1024 * 1024) {
          return 'tooBig';
        }
        const { templates, error } = parsePastedTemplates(source.text);
        if (error) {
          return 'json';
        }
        data = (matchTemplate(item.name, templates, new Set()) ?? templates[0])?.data;
        if (data === undefined) {
          return 'noPages';
        }
      }
    } catch {
      return 'json';
    }
    const pages = this.annotationImport.normalizeImportedCoordinates(data, (field) => field);
    if (pages === null) {
      return 'noPages';
    }
    const count = pages.reduce((sum, page) => sum + page.fields.length, 0);
    if (count === 0) {
      return 'noPages';
    }
    this.batch.setTemplate(item.id, pages);
    if (!item.bPdf) {
      this.replaceCoords(this.normalizedTemplateA());
    } else {
      this.redrawReference();
    }
    this.toast.show(this.translationService.translate('toast.batch.templateApplied', { count }));
    return null;
  }

  batchRemoveTemplate(): void {
    const item = this.batch.activeItem();
    if (item) {
      this.batch.setTemplate(item.id, []);
      this.redrawReference();
    }
  }

  async backToBatch() {
    this.flushBatchSave();
    await this.router.navigate(['/lote']);
  }

  async markReady() {
    const item = this.batch.activeItem();
    if (!item) {
      return;
    }
    this.flushBatchSave(true);
    this.batch.setStatus(item.id, 'ready');
    await this.router.navigate(['/lote']);
  }

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

  /** Back to «Páginas enlazadas» on `page` (a new PDF, a restored session). */
  private resetPageLink(page: number): void {
    this.pagesLinked.set(true);
    this.commonPage.set(page);
    this.freeAPage.set(page);
  }

  /**
   * Goes to a page of the header: with A and B linked it is the shared position (1…max(A, B)),
   * otherwise a page of B.
   */
  async setPageIndex(pageNumber: number) {
    if (!this.pdfDoc()) {
      return;
    }

    if (this.comparing() && this.pagesLinked()) {
      const target = clampPageNumber(
        pageNumber,
        this.pageMap()
          ? this.pdfDoc()!.numPages
          : linkedPageTotal(this.pageCountA(), this.pdfDoc()!.numPages),
      );
      if (target === this.commonPage() && !(this.pageMap() && target !== this.pageIndex())) {
        return;
      }
      this.commonPage.set(target);
      const held = holdPageOfB(target, this.pdfDoc()!.numPages);
      if (held === this.pageIndex()) {
        // B keeps its page (it may show the empty state): only A changes.
        this.selection.set(null);
        await this.refreshAfterLinkedMove();
        return;
      }
      await this.goToBPage(held);
      return;
    }

    await this.goToBPage(clampPageNumber(pageNumber, this.pdfDoc()!.numPages));
  }

  private async refreshAfterLinkedMove(): Promise<void> {
    if (this.unlinkedSplit()) {
      const pane = this.splitAPane();
      if (pane) pane.scrollTop = 0;
      this.resetSplitAScroll();
    }
    this.redrawAllForPage();
  }

  /** A page of A on its own (free pages). Moving A while linked first frees the pages. */
  async setPageIndexA(pageNumber: number): Promise<void> {
    if (!this.comparing()) {
      return;
    }
    const total = this.pageCountA();
    if (this.pagesLinked()) {
      this.pagesLinked.set(false);
      this.freeAPage.set(clampPageNumber(this.aPage() ?? total, total));
    }
    const target = clampPageNumber(pageNumber, total);
    if (target === this.freeAPage()) {
      return;
    }
    this.freeAPage.set(target);
    const pane = this.splitAPane();
    if (pane) {
      pane.scrollTop = 0;
    }
  }

  /** Chip «Páginas enlazadas / libres»: A and B stop (or start again) sharing the page. */
  togglePagesLink(): void {
    if (!this.comparing()) {
      return;
    }
    if (this.pagesLinked()) {
      this.freeAPage.set(clampPageNumber(this.aPage() ?? this.pageCountA(), this.pageCountA()));
      this.pagesLinked.set(false);
      return;
    }
    const before = this.freeAPage();
    this.commonPage.set(this.pageIndex());
    this.pagesLinked.set(true);
    if (before === this.pageIndex()) {
      return;
    }
    this.toast.show(
      this.translationService.translate('batch.editor.pages.linkedToast', {
        page: this.pageIndex(),
      }),
      'info',
      10000,
      false,
      {
        label: this.translationService.translate('controls.undo'),
        run: () => {
          if (this.pagesLinked() && this.comparing()) {
            this.freeAPage.set(clampPageNumber(before, this.pageCountA()));
            this.pagesLinked.set(false);
          }
        },
      },
    );
  }

  /** Menu of the chip of pages (▾): «Emparejadas/Enlazadas», «Libres» and «Emparejar páginas…». */
  readonly pagesMenuOpen = signal(false);

  setPagesLinked(linked: boolean): void {
    this.pagesMenuOpen.set(false);
    if (linked !== this.pagesLinked()) {
      this.togglePagesLink();
    }
  }

  onPagesMenuFocusOut(event: FocusEvent): void {
    const holder = event.currentTarget as HTMLElement | null;
    if (!holder?.contains(event.relatedTarget as Node | null)) {
      this.pagesMenuOpen.set(false);
    }
  }

  setPaneFocus(pane: 'a' | 'b'): void {
    this.paneFocus.set(pane);
  }

  /** ‹ › and PgUp/PgDn: the shared page, or the page of the pane under the pointer when free. */
  private async stepPage(direction: -1 | 1): Promise<void> {
    if (this.comparing() && !this.pagesLinked() && this.splitActive() && this.paneFocus() === 'a') {
      await this.setPageIndexA(this.freeAPage() + direction);
      return;
    }
    await this.setPageIndex(this.pageShown() + direction);
  }

  /** Mayús + ← →: only A moves (the pages become free). */
  async stepPageA(direction: -1 | 1): Promise<void> {
    if (!this.comparing()) {
      return;
    }
    const current = this.pagesLinked() ? (this.aPage() ?? this.pageCountA()) : this.freeAPage();
    await this.setPageIndexA(current + direction);
  }

  private async goToBPage(clamped: number) {
    if (clamped === this.pageIndex()) {
      return;
    }

    this.selection.set(null);
    this.pageIndex.set(clamped);
    if (!this.comparing() || this.pageMap()) {
      // Without A, or with the table, the shared position is simply B's page.
      this.commonPage.set(clamped);
    }
    await this.render();
    this.redrawAllForPage();
    if (this.unlinkedSplit()) {
      // Each pane goes back to «fit» on the new page; they stay unlinked.
      await this.fitSplit();
      this.scaleA.set(this.scale());
      const pane = this.splitAPane();
      if (pane) pane.scrollTop = 0;
      await this.renderSplit();
      this.resetSplitAScroll();
    }
  }

  async prevPage() {
    await this.stepPage(-1);
  }

  async nextPage() {
    await this.stepPage(1);
  }

  async zoomIn() {
    await this.zoomToScale(stepScale(this.zoomBase(), 1), this.viewerCenter());
  }

  async zoomOut() {
    await this.zoomToScale(stepScale(this.zoomBase(), -1), this.viewerCenter());
  }

  /** Real size (100 %), centred on the viewer. */
  async zoomActualSize() {
    await this.zoomToScale(1, this.viewerCenter());
  }

  private lastViewerClick: ViewerClick | null = null;

  /** Anota un clic del visor y dice si es el segundo de un doble clic (P-106). */
  private isViewerDoubleClick(kind: ViewerClick['kind'], evt: MouseEvent): boolean {
    const click: ViewerClick = { kind, x: evt.clientX, y: evt.clientY, time: Date.now() };
    const double = isDoubleClick(this.lastViewerClick, click);
    this.lastViewerClick = double ? null : click;
    return double;
  }

  /**
   * Doble clic del visor (P-106): alterna 100 % y «ajustar al ancho» en el panel bajo el puntero
   * (en «Dividida» con zoom desenlazado, solo ese panel; enlazado, los dos). Ignorado con un
   * editor de anotación abierto.
   */
  async toggleFitActual(at: { clientX: number; clientY: number }): Promise<void> {
    if (!this.pdfDoc() || this.editing() || this.preview()) return;
    if (this.unlinkedSplit() && this.isOverSplitA(at)) {
      await this.toggleFitActualA(at);
      return;
    }
    if (doubleClickZoomTarget(this.zoomBase()) === 'actual') {
      await this.zoomToScale(1, at);
      return;
    }
    await (this.splitActive() ? this.fitSplit() : this.fitWidth());
    this.showZoomHud(this.scale(), null, this.unlinkedSplit() ? 'B' : undefined);
  }

  /** Lo mismo para A cuando «Dividida» está desenlazada y el puntero está sobre A. */
  private async toggleFitActualA(at: { clientX: number; clientY: number }): Promise<void> {
    const pane = this.splitAPane();
    const canvas = this.splitCanvasRef?.nativeElement;
    if (!pane || !canvas) return;
    if (doubleClickZoomTarget(this.scaleA()) === 'actual') {
      await this.zoomSplitA(1, at);
      return;
    }
    const style = getComputedStyle(pane);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const baseWidth = canvas.getBoundingClientRect().width / this.scaleA();
    const fit = fitWidthScale(baseWidth, pane.clientWidth - padding);
    if (fit === null) return;
    await this.zoomSplitA(fit, null);
    this.resetSplitAScroll();
  }

  /** Zoom picked from the footer menu. */
  async setZoomPercent(percent: number) {
    this.zoomMenuOpen.set(false);
    await this.zoomToScale(percent / 100, this.viewerCenter());
  }

  /**
   * Ctrl/⌘ + wheel and trackpad pinch (they arrive as wheel events with Ctrl) zoom towards the
   * cursor. A plain wheel at the edge of the sheet may change page (P-63).
   */
  onViewerWheel(evt: WheelEvent): void {
    if (!this.pdfDoc()) {
      return;
    }
    if (!evt.ctrlKey && !evt.metaKey) {
      this.onWheelEdge(evt);
      return;
    }
    evt.preventDefault();
    if (this.splitActive() && !this.splitLinked() && this.isOverSplitA(evt)) {
      void this.zoomSplitA(this.scaleA() * wheelZoomFactor(evt.deltaY, evt.deltaMode), evt);
      return;
    }
    const requested = this.zoomBase() * wheelZoomFactor(evt.deltaY, evt.deltaMode);
    void this.zoomToScale(requested, { clientX: evt.clientX, clientY: evt.clientY });
  }

  setWheelPaging(on: boolean): void {
    this.wheelPaging.set(on);
    this.wheelState = initialWheelPageState();
    this.wheelEdge.set(null);
    try {
      localStorage.setItem(WHEEL_PAGING_KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  private storedWheelPaging(): boolean {
    try {
      return typeof localStorage === 'undefined' || localStorage.getItem(WHEEL_PAGING_KEY) !== '0';
    } catch {
      return true;
    }
  }

  private onWheelEdge(evt: WheelEvent): void {
    const viewer = evt.currentTarget as HTMLElement | null;
    if (
      !this.wheelPaging() ||
      !viewer ||
      !this.pdfDoc() ||
      this.pdfDoc()!.numPages < 1 ||
      this.preview() ||
      this.editing() ||
      this.panReady() ||
      this.panning() ||
      this.lasso() ||
      evt.shiftKey ||
      Math.abs(evt.deltaX) > Math.abs(evt.deltaY) ||
      isEditableElement(document.activeElement as HTMLElement | null) ||
      (this.splitActive() && !this.splitLinked() && this.isOverSplitA(evt))
    ) {
      return;
    }
    const pixels =
      evt.deltaMode === 1 ? evt.deltaY * 33 : evt.deltaMode === 2 ? evt.deltaY * 400 : evt.deltaY;
    const asA =
      this.comparing() && !this.pagesLinked() && this.splitActive() && this.isOverSplitA(evt);
    const pane: 'A' | 'B' | undefined =
      this.comparing() && !this.pagesLinked() ? (asA ? 'A' : 'B') : undefined;
    const page = asA ? this.freeAPage() : this.pageShown();
    const total = asA ? this.pageCountA() : this.pageTotalShown();
    const step = wheelEdgeStep(this.wheelState, {
      deltaY: pixels,
      now: performance.now(),
      atTop: viewer.scrollTop <= 0,
      atBottom: viewer.scrollTop + viewer.clientHeight >= viewer.scrollHeight - 1,
      hasPrev: page > 1,
      hasNext: page < total,
    });
    this.wheelState = step.state;
    const rect = viewer.getBoundingClientRect();
    const place = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    if (step.change) {
      const target = page + step.change;
      this.showWheelEdge({ pane, kind: 'now', progress: 1, page: target, total, ...place }, 900);
      void (asA ? this.setPageIndexA(target) : this.setPageIndex(target)).then(() => {
        viewer.scrollTop = step.change > 0 ? 0 : viewer.scrollHeight;
      });
      return;
    }
    if (step.limit) {
      this.showWheelEdge(
        { pane, kind: pixels > 0 ? 'last' : 'first', progress: 0, page, total, ...place },
        900,
      );
    } else if (step.progress > 0) {
      const dir = pixels > 0 ? 1 : -1;
      this.showWheelEdge(
        {
          pane,
          kind: dir > 0 ? 'next' : 'prev',
          progress: step.progress,
          page: page + dir,
          total,
          ...place,
        },
        500,
      );
    } else if (this.wheelEdge()?.kind === 'next' || this.wheelEdge()?.kind === 'prev') {
      this.wheelEdge.set(null);
    }
  }

  private showWheelEdge(value: WheelEdgeIndicator, ms: number): void {
    this.wheelEdge.set(value);
    if (this.wheelEdgeTimer) clearTimeout(this.wheelEdgeTimer);
    this.wheelEdgeTimer = setTimeout(() => this.wheelEdge.set(null), ms);
  }

  private zoomBase(): number {
    return clampScale(this.zoomPending?.requested ?? this.scale());
  }

  private viewerCenter(): { clientX: number; clientY: number } | null {
    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  private viewerScroller(): HTMLElement | null {
    return (this.pdfViewerRef?.nativeElement.closest('.viewer') as HTMLElement | null) ?? null;
  }

  /**
   * Espacio de trabajo ampliado (P-109): el visor deja a cada lado un margen vacío de la mitad de
   * su ancho para poder llevar cualquier PDF al centro. Se publica como `--work-margin` y se
   * mantiene al cambiar el tamaño del visor.
   */
  private updateWorkMargin(): void {
    const viewer = this.viewerScroller();
    if (!viewer) return;
    viewer.style.setProperty('--work-margin', `${workMarginFor(viewer.clientWidth)}px`);
    if (!this.workMarginObserver && typeof ResizeObserver !== 'undefined') {
      this.workMarginObserver = new ResizeObserver(() => this.updateWorkMargin());
      this.workMarginObserver.observe(viewer);
    }
    // C1: con «Dividida» desenlazada el panel A se desplaza solo y lleva su propio margen (mitad de su
    // ancho). El panel cambia de tamaño al desenlazar (crece desde 0) y al cambiar la ventana: se
    // observa y, si A sigue en su reposo (nadie la ha movido), vuelve al reposo con el margen nuevo.
    const pane = this.unlinkedSplit() ? this.splitAPane() : null;
    if (!pane) return;
    if (pane !== this.observedAPane && this.workMarginObserver) {
      if (this.observedAPane) this.workMarginObserver.unobserve(this.observedAPane);
      this.workMarginObserver.observe(pane);
      this.observedAPane = pane;
    }
    const before = pane.style.getPropertyValue('--a-margin');
    const margin = workMarginFor(pane.clientWidth);
    pane.style.setProperty('--a-margin', `${margin}px`);
    const untouched = before === '' || before === '0px' || Math.abs(pane.scrollLeft - this.aHomeLeft) <= 2;
    if (margin > 0 && `${margin}px` !== before && untouched) this.resetSplitAScroll();
  }

  /**
   * Publica el desplazamiento horizontal como `--vx` para que las capas ancladas al visor (tarjeta
   * de primeros pasos, pista, indicador de zoom) sigan en pantalla aunque el lienzo esté movido.
   */
  onViewerScroll(evt: Event): void {
    const viewer = evt.currentTarget as HTMLElement | null;
    viewer?.style.setProperty('--vx', `${Math.round(viewer.scrollLeft)}px`);
  }

  /**
   * Lo mismo para el panel A desenlazado, que se desplaza solo: `--ax`/`--ay` mantienen a la vista su
   * etiqueta y su paginador aunque A esté movida o ampliada (C1 de la 1.17).
   */
  onSplitAScroll(evt: Event): void {
    const pane = evt.currentTarget as HTMLElement | null;
    if (!pane) return;
    pane.style.setProperty('--ax', `${Math.round(pane.scrollLeft)}px`);
    pane.style.setProperty('--ay', `${Math.round(pane.scrollTop)}px`);
  }

  /** Hoja de A dentro de su panel (canvas y capas), en coordenadas del contenido desplazable del panel. */
  private splitASheet(): HTMLElement | null {
    return (this.splitLayerRef?.nativeElement.parentElement as HTMLElement | null) ?? null;
  }

  /** Reposo del panel A desenlazado: A centrada en su panel, o su borde izquierdo si no cabe (C1). */
  private resetSplitAScroll(smooth = false): void {
    if (!this.unlinkedSplit()) return;
    this.updateWorkMargin();
    const pane = this.splitAPane();
    const sheet = this.splitASheet();
    if (!pane || !sheet) return;
    const box = this.contentBox(pane, sheet);
    const padding = parseFloat(getComputedStyle(pane).paddingLeft) || 0;
    const home = homeScrollLeft({ contentLeft: box.left, contentWidth: box.width, viewportWidth: pane.clientWidth, padding });
    this.scrollViewerTo(pane, home, smooth);
    this.aHomeLeft = smooth ? home : pane.scrollLeft;
  }

  private scrollViewerTo(viewer: HTMLElement, left: number, smooth: boolean): void {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof viewer.scrollTo === 'function') {
      viewer.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    } else {
      viewer.scrollLeft = left;
    }
  }

  /** Posición del elemento en coordenadas del contenido desplazable del visor. */
  private contentBox(viewer: HTMLElement, el: HTMLElement): { left: number; width: number } {
    const v = viewer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { left: r.left - v.left + viewer.scrollLeft, width: r.width };
  }

  /** Devuelve el visor a su posición de siempre (PDFs centrados, o su borde izquierdo si no caben). */
  resetViewerScroll(smooth = false): void {
    this.updateWorkMargin();
    const viewer = this.viewerScroller();
    const b = this.pdfViewerRef?.nativeElement;
    if (!viewer || !b) return;
    const boxes = [this.splitActive() ? this.splitAPane() : null, b]
      .filter((el): el is HTMLElement => !!el)
      .map((el) => this.contentBox(viewer, el));
    const left = Math.min(...boxes.map((x) => x.left));
    const right = Math.max(...boxes.map((x) => x.left + x.width));
    const padding = parseFloat(getComputedStyle(viewer).paddingLeft) || 0;
    this.scrollViewerTo(
      viewer,
      homeScrollLeft({
        contentLeft: left,
        contentWidth: right - left,
        viewportWidth: viewer.clientWidth,
        padding,
      }),
      smooth,
    );
    this.resetSplitAScroll(smooth);
  }

  /**
   * Doble clic en la etiqueta «A» o «B» de «Dividida»: lleva ese PDF al centro del visor; otro
   * doble clic con el mismo PDF ya centrado reencuadra los dos (P-109). Desenlazada (C1), la «A»
   * centra A dentro de su propio panel (y otro doble clic la devuelve al reposo); la «B» no aplica.
   */
  centerPane(which: 'a' | 'b'): void {
    if (!this.splitActive()) return;
    if (this.unlinkedSplit()) {
      if (which === 'a') this.centerSplitA();
      return;
    }
    this.updateWorkMargin();
    const viewer = this.viewerScroller();
    const el = which === 'a' ? this.splitAPane() : (this.pdfViewerRef?.nativeElement ?? null);
    if (!viewer || !el) return;
    const target = centerScrollLeft(this.contentBox(viewer, el), viewer.clientWidth);
    if (Math.abs(target - viewer.scrollLeft) < 4) {
      this.resetViewerScroll(true);
      return;
    }
    this.scrollViewerTo(viewer, target, true);
  }

  private centerSplitA(): void {
    this.updateWorkMargin();
    const pane = this.splitAPane();
    const sheet = this.splitASheet();
    if (!pane || !sheet) return;
    const target = centerScrollLeft(this.contentBox(pane, sheet), pane.clientWidth);
    if (Math.abs(target - pane.scrollLeft) < 4) {
      this.resetSplitAScroll(true);
      return;
    }
    this.scrollViewerTo(pane, target, true);
  }

  /**
   * Zooms keeping the point under `anchor` fixed. Requests that arrive while a render is
   * running are merged into the latest one, so a fast wheel never queues stale renders.
   */
  async zoomToScale(requested: number, anchor: { clientX: number; clientY: number } | null = null) {
    if (!this.pdfDoc()) return;
    this.zoomPending = { requested, anchor };
    if (this.zoomBusy) return;
    this.zoomBusy = true;
    try {
      while (this.zoomPending) {
        const { requested: wanted, anchor: at } = this.zoomPending;
        this.zoomPending = null;
        const next = clampScale(wanted);
        this.showZoomHud(next, zoomLimitFor(wanted), this.unlinkedSplit() ? 'B' : undefined);
        const previous = this.scale();
        if (next === previous) continue;
        const canvas = this.pdfCanvasRef?.nativeElement;
        const container = this.pdfViewerRef?.nativeElement.parentElement;
        const before = canvas?.getBoundingClientRect();
        this.scale.set(next);
        await this.render();
        this.redrawAllForPage();
        if (at && canvas && container && before) {
          const after = canvas.getBoundingClientRect();
          const { dx, dy } = zoomAnchorScrollDelta(before, after, at, previous, next);
          container.scrollLeft += dx;
          container.scrollTop += dy;
        }
      }
    } finally {
      this.zoomBusy = false;
    }
  }

  private showZoomHud(scale: number, limit: ZoomLimit, side?: 'A' | 'B') {
    this.zoomHud.set({ percent: Math.round(scale * 100), limit, side });
    if (this.zoomHudTimer) clearTimeout(this.zoomHudTimer);
    this.zoomHudTimer = setTimeout(() => this.zoomHud.set(null), 1200);
    this.maybeShowWebZoomHint();
  }

  /** On the web, the browser zoom keeps working outside the viewer: say so once. */
  private maybeShowWebZoomHint() {
    if (typeof window === 'undefined' || (window as unknown as { desktop?: unknown }).desktop) return;
    try {
      if (localStorage.getItem('pdf-annotator.zoomHint') === '1') return;
      localStorage.setItem('pdf-annotator.zoomHint', '1');
    } catch {
      return;
    }
    this.toast.show(this.translationService.translate('zoom.hintWeb'), 'info', 10000);
  }

  private onPanPointerDown(evt: PointerEvent) {
    if (!this.pdfDoc() || this.panDrag) return;
    const target = evt.target as HTMLElement | null;
    const viewer =
      this.unlinkedSplit() && this.isOverSplitA(evt)
        ? this.splitAPane()
        : (target?.closest?.('.viewer') as HTMLElement | null);
    const wanted = evt.button === 1 || (evt.button === 0 && this.panReady());
    if (!viewer || !wanted || isEditableElement(target)) return;
    if (evt.button === 1 && this.isViewerDoubleClick('middle', evt)) {
      evt.preventDefault();
      evt.stopPropagation();
      void this.toggleFitActual(evt);
      return;
    }
    evt.preventDefault();
    evt.stopPropagation();
    this.panDrag = {
      x: evt.clientX,
      y: evt.clientY,
      left: viewer.scrollLeft,
      top: viewer.scrollTop,
      viewer,
    };
    this.panning.set(true);
    window.addEventListener('pointermove', this.panMoveHandler);
    window.addEventListener('pointerup', this.panUpHandler);
    window.addEventListener('pointercancel', this.panUpHandler);
  }

  private onPanPointerMove(evt: PointerEvent) {
    const drag = this.panDrag;
    if (!drag) return;
    const { left, top } = panScrollPosition(drag, evt);
    drag.viewer.scrollLeft = left;
    drag.viewer.scrollTop = top;
  }

  private endPan() {
    if (!this.panDrag) return;
    this.panDrag = null;
    this.panning.set(false);
    window.removeEventListener('pointermove', this.panMoveHandler);
    window.removeEventListener('pointerup', this.panUpHandler);
    window.removeEventListener('pointercancel', this.panUpHandler);
    // The click that follows a drag must not place or select an annotation.
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 0);
  }

  async fitPage() {
    if (!this.pdfDoc()) {
      return;
    }

    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) {
      return;
    }
    this.updateWorkMargin();

    const page = await this.pdfDoc()!.getPage(this.pageIndex());
    const base = page.getViewport({ scale: 1 });
    const style = getComputedStyle(container);
    const availableW =
      container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availableH =
      container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fit = fitPageScale(base.width, base.height, availableW, availableH);
    if (fit === null) {
      return;
    }

    this.scale.set(fit);
    await this.render();
    const overflow = container.scrollHeight - container.clientHeight;
    if (overflow > 0) {
      this.scale.set(fitPageScaleForOverflow(base.height, this.scale(), overflow));
      await this.render();
    }
    this.redrawAllForPage();
    this.resetViewerScroll();
  }

  async fitWidth() {
    if (!this.pdfDoc()) {
      return;
    }

    const container = this.pdfViewerRef?.nativeElement.parentElement;
    if (!container) {
      return;
    }
    this.updateWorkMargin();

    const page = await this.pdfDoc()!.getPage(this.pageIndex());
    const baseWidth = page.getViewport({ scale: 1 }).width;
    const style = getComputedStyle(container);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const available = container.clientWidth - padding;
    const fit = fitWidthScale(baseWidth, available);
    if (fit === null) {
      return;
    }

    this.scale.set(fit);
    await this.render();
    this.redrawAllForPage();
    this.resetViewerScroll();
  }

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

  clearAll(options?: { skipHistory?: boolean }) {
    this.replaceCoords([], options);
  }

  copyJSON() {
    navigator.clipboard.writeText(this.coordsTextModel()).catch(() => {});
  }

  toggleIncludeAdvancedJsonFields(checked: boolean) {
    if (this.includeAdvancedJsonFields() === checked) {
      return;
    }

    this.includeAdvancedJsonFields.set(checked);
    this.syncCoordsTextModel();
  }

  onCoordsTextChange(value: string) {
    this.coordsTextModel.set(value);
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
    const text = this.coordsTextModel().trim();

    if (!text) {
      if (options.clearWhenEmpty) {
        this.clearAll();
      }
      return false;
    }

    try {
      const { pages, report } = this.annotationImport.importFromText(text, (field) =>
        this.prepareFieldForStorage(field),
      );

      this.replaceCoords(pages, { preserveTextModel: true });
      if (!options.silent) {
        void this.reportImportIssues(report, pages);
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
      const { pages, report } = this.annotationImport.importFromText(text, (field) =>
        this.prepareFieldForStorage(field),
      );

      this.replaceCoords(pages, { preserveTextModel: false });
      void this.reportImportIssues(report, pages);
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      this.reportJsonImportError(error);
    } finally {
      input.value = '';
    }
  }

  downloadJSON() {
    downloadBlob(new Blob([this.coordsTextModel()], { type: 'application/json' }), 'coords.json');
  }

  saveCurrentAsTemplate() {
    const name = this.templateNameModel().trim();
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
    this.templateNameModel.set('');
    this.selectedTemplateId.set(savedTemplate.id);
  }

  loadSelectedTemplate() {
    if (!this.selectedTemplateId()) {
      return;
    }

    const template = this.templates().find((item) => item.id === this.selectedTemplateId());
    if (!template) {
      return;
    }

    this.applyTemplate(template);
  }

  deleteSelectedTemplate() {
    if (!this.selectedTemplateId() || this.selectedTemplateId() === this.defaultTemplateId) {
      return;
    }

    const templateId = this.selectedTemplateId()!;
    this.templatesService.deleteTemplate(templateId);
    const nextTemplates = this.templatesService.getTemplates();
    this.templates.set(nextTemplates);
    if (!nextTemplates.some((template) => template.id === templateId)) {
      this.selectedTemplateId.set(nextTemplates[0]?.id ?? this.templatesService.defaultTemplateId);
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

  /** Sample-sourced fields are stamped as the mapField unless the person chose the samples. */
  private exportText(field: PageField, useSamples: boolean): string {
    const ctx = this.previewSettings.context();
    const preview = resolveFieldPreview(field, ctx);
    if (useSamples || preview.source !== 'sample') {
      return preview.text;
    }
    return resolveFieldPreview(field, { ...ctx, mode: 'map' }).text;
  }

  readonly exportSamplesPrompt = signal<number | null>(null);
  private rememberedExportChoice: 'map' | 'sample' | null = null;

  async downloadAnnotatedPDF() {
    if (!this.pdfDoc()) return;
    const sampleFields = this.countSampleFields();
    if (sampleFields > 0) {
      if (this.rememberedExportChoice) {
        await this.runExport(this.rememberedExportChoice === 'sample');
      } else {
        this.exportSamplesPrompt.set(sampleFields);
      }
      return;
    }
    await this.runExport(false);
  }

  async confirmExportSamples(result: { choice: 'map' | 'sample'; remember: boolean }) {
    this.exportSamplesPrompt.set(null);
    if (result.remember) {
      this.rememberedExportChoice = result.choice;
    }
    await this.runExport(result.choice === 'sample');
  }

  cancelExportSamples() {
    this.exportSamplesPrompt.set(null);
  }

  private async runExport(useSamples: boolean) {
    if (!this.pdfDoc()) return;
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
        renderText: (field) => this.exportText(field, useSamples),
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
    const pdfDoc = this.pdfDoc();
    if (pdfDoc) {
      if (typeof pdfDoc.saveDocument === 'function') {
        try {
          const sanitized = await pdfDoc.saveDocument();
          this.rememberPdfBytes(sanitized, 2);
        } catch (error) {
          console.warn('No se pudo obtener una versión saneada del PDF para exportar.', error);
        }
      }

      try {
        const rawData = await pdfDoc.getData();
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

  syncCoordsTextModel() {
    this.coordsTextModel.set(
      jsonExportText(
        buildJsonExportPayload(this.coords(), (field) => this.serializeFieldForJson(field)),
      ),
    );
    this.refreshJsonPreview();
  }

  private snapshotCoords(pages: PageAnnotations[] = this.coords()): PageAnnotations[] {
    return this.store.snapshot(pages);
  }

  private serializeFieldForJson(field: PageField): Record<string, unknown> {
    return serializeFieldForJson(
      this.prepareFieldForStorage(field),
      this.includeAdvancedJsonFields(),
    );
  }

  applyCoordsChange(mutator: () => void, options?: { coalesceKey?: string }): boolean {
    return this.store.applyChange(mutator, options);
  }

  private replaceCoords(
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

  private refreshJsonPreview() {
    this.jsonTreePreview.set(buildJsonTreePreview(this.coordsTextModel()));
  }

  /**
   * After an explicit import/apply, warns about what was skipped or looks wrong. The import itself
   * is never altered: these are hints so the user can fix the JSON.
   */
  private async reportImportIssues(report: ImportReport, pages: PageAnnotations[]) {
    let outOfPage = 0;
    let missingPages = 0;
    const doc = this.pdfDoc();
    if (doc) {
      for (const page of pages) {
        if (page.num > doc.numPages) {
          missingPages += 1;
          continue;
        }
        const { width, height } = (await doc.getPage(page.num)).getViewport({ scale: 1 });
        outOfPage += page.fields.filter(
          (field) => field.x < 0 || field.y < 0 || field.x > width || field.y > height,
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
        }),
      );
      return;
    }

    const key =
      error instanceof JsonShapeError ? 'toast.importJsonNoPages' : 'toast.importJsonFailed';
    this.toast.error(this.translationService.translate(key));
  }
}

/*
 * El código de la página está repartido en archivos hermanos por áreas (IA, ajuste por textos, vista, parejas A↔B,
 * lote, selección, JSON y exportación). Cada uno es una clase sin estado cuyos métodos se copian al prototipo de la
 * página: `this` sigue siendo la página y los subcomponentes siguen llamando a `vm.metodo()`. El estado (signals)
 * vive en la página.
 */
const WORKSPACE_PARTS = [WorkspaceAi, WorkspaceAdjust, WorkspacePairing, WorkspaceSelection] as const;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspacePageComponent extends WorkspaceAi, WorkspaceAdjust, WorkspacePairing, WorkspaceSelection {}
for (const part of WORKSPACE_PARTS) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name !== 'constructor') {
      const descriptor = Object.getOwnPropertyDescriptor(part.prototype, name);
      if (descriptor) Object.defineProperty(WorkspacePageComponent.prototype, name, descriptor);
    }
  }
}
