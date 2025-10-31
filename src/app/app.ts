import { CommonModule, DOCUMENT } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  AfterViewChecked,
  HostListener,
  OnDestroy,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { Meta, Title } from '@angular/platform-browser';
import { TranslationPipe } from './i18n/translation.pipe';
import { Language, TranslationService } from './i18n/translation.service';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from './app-version';
import './promise-with-resolvers.polyfill';
import './array-buffer-transfer.polyfill';
import { FieldType, PageAnnotations, PageField } from './models/annotation.model';
import { AnnotationTemplatesService, AnnotationTemplate } from './annotation-templates.service';
import { LanguageSelectorComponent } from './components/language-selector/language-selector.component';

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

type GuideSettings = {
  showGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  showAlignment: boolean;
  snapToGrid: boolean;
  snapToMargins: boolean;
  snapToCenters: boolean;
  snapToCustom: boolean;
  marginSize: number;
  snapTolerance: number;
  snapPointsX: readonly number[];
  snapPointsY: readonly number[];
  usePdfCoordinates: boolean;
};

type OverlayGuide = {
  orientation: 'horizontal' | 'vertical';
  position: number;
  highlighted?: boolean;
};

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  imports: [CommonModule, FormsModule, TranslationPipe, LanguageSelectorComponent],
  styleUrls: ['./app.scss'],
})
export class App implements AfterViewChecked, OnDestroy {
  pdfDoc: PDFDocumentProxy | null = null;
  pageIndex = signal(1);
  scale = signal(1.5);
  coords = signal<PageAnnotations[]>([]);
  private readonly undoStack = signal<PageAnnotations[][]>([]);
  private readonly redoStack = signal<PageAnnotations[][]>([]);
  preview = signal<PreviewState>(null);
  editing = signal<EditState>(null);
  previewHexInput = signal('#000000');
  previewRgbInput = signal('rgb(0, 0, 0)');
  editHexInput = signal('#000000');
  editRgbInput = signal('rgb(0, 0, 0)');
  coordsTextModel = JSON.stringify({ pages: [] }, null, 2);
  guidesFeatureEnabled = signal(false);
  advancedOptionsOpen = signal(false);
  guideSettings = signal<GuideSettings>({
    showGrid: true,
    gridSize: 10,
    showRulers: true,
    showAlignment: true,
    snapToGrid: true,
    snapToMargins: true,
    snapToCenters: true,
    snapToCustom: false,
    marginSize: 18,
    snapTolerance: 8,
    snapPointsX: [],
    snapPointsY: [],
    usePdfCoordinates: false,
  });
  snapPointsXText = signal('');
  snapPointsYText = signal('');
  fileDropActive = signal(false);
  private readonly translationService = inject(TranslationService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly templatesService = inject(AnnotationTemplatesService);
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
    moved: boolean;
  } | null = null;
  private draggingElement: HTMLDivElement | null = null;
  private pdfByteSources = new Map<string, { bytes: Uint8Array; weight: number }>();
  private overlayDragRect: { left: number; top: number; width: number; height: number } | null =
    null;
  private overlayGuides: OverlayGuide[] = [];
  private clipboard: PageField | null = null;

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false })
  annotationsLayerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfViewer', { static: false }) pdfViewerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewEditor') previewEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('editEditor') editEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfFileInput', { static: false }) pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('coordsFileInput', { static: false })
  coordsFileInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
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

  ngOnDestroy() {
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
    this.guidesFeatureEnabled.set(enabled);
    if (enabled) {
      this.advancedOptionsOpen.set(true);
    }
    if (!enabled) {
      this.advancedOptionsOpen.set(false);
      this.overlayDragRect = null;
      this.overlayGuides = [];
      this.refreshOverlay(null, []);
      return;
    }

    this.refreshOverlay();
  }

  toggleAdvancedOptions(open: boolean) {
    this.advancedOptionsOpen.set(open);
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

    let nextSnapPointsY = currentSettings.snapPointsY;
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
    const appTitle = 'PDF Annotator | Diseña anotaciones precisas para tus PDFs';
    const description =
      'Carga un PDF, marca regiones clave y exporta coordenadas listas para integrarlas en tus flujos de trabajo.';
    const fallbackOrigin = 'https://pdf-annotator-rho.vercel.app';
    const documentLocation = this.document?.location;
    const baseUrl = (documentLocation?.origin ?? fallbackOrigin).replace(/\/$/, '');
    const imageUrl = `${baseUrl}/og-image.svg`;
    this.title.setTitle(appTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: appTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:site_name', content: 'PDF Annotator' });
    this.meta.updateTag({ property: 'og:url', content: baseUrl });
    this.meta.updateTag({ property: 'og:image', content: imageUrl });
    this.meta.updateTag({
      property: 'og:image:alt',
      content: 'Vista previa de anotaciones en PDF con coordenadas resaltadas',
    });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: appTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: imageUrl });
    this.meta.updateTag({
      name: 'twitter:image:alt',
      content: 'Vista previa de anotaciones en PDF con coordenadas resaltadas',
    });
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

  private projectYPoint(
    point: number,
    height: number,
    scale: number,
    usePdfCoordinates: boolean
  ) {
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
    bounds: { maxLeft: number; minTop: number; maxTop: number },
    el: HTMLDivElement,
    pdfCanvas: HTMLCanvasElement
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

    type Candidate = { candidate: number; line: number; delta: number };

    const verticalCandidates: Candidate[] = [];
    const horizontalCandidates: Candidate[] = [];

    const pushVertical = (candidate: number, line: number) => {
      if (!Number.isFinite(candidate) || !Number.isFinite(line)) {
        return;
      }
      const clampedCandidate = Math.min(Math.max(candidate, 0), bounds.maxLeft);
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
        const linePx = this.projectYPoint(point, height, scale, settings.usePdfCoordinates);
        pushHorizontal(linePx, linePx);
      });
    }

    let snappedLeft = Math.min(Math.max(baseLeft, 0), bounds.maxLeft);
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
    if (!this.isPdfFile(file)) {
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
    this.fileDropActive.set(false);
  }

  private isPdfFile(file: File) {
    if (!file.type) {
      return file.name.toLowerCase().endsWith('.pdf');
    }

    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
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
    this.preview.set({
      page: this.pageIndex(),
      field: {
        x: pt.x,
        y: pt.y,
        mapField: '',
        fontSize: 14,
        color: defaultColor,
        type: 'text',
        value: '',
        appender: '',
        decimals: null,
      },
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
    this.editHexInput.set(value);
    const normalized = this.normalizeHexInput(value);
    if (!normalized) return;
    this.editing.update((e) => (e ? { ...e, field: { ...e.field, color: normalized } } : e));
    this.updateEditingColorState(normalized);
  }

  setEditColorFromRgb(value: string) {
    this.editRgbInput.set(value);
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
    this.editing.update((e) => (e ? { ...e, field: { ...e.field, color: hex } } : e));
    this.updateEditingColorState(hex);
  }

  onEditColorPicker(value: string) {
    this.editing.update((e) => (e ? { ...e, field: { ...e.field, color: value } } : e));
    this.updateEditingColorState(value);
  }

  confirmPreview() {
    const p = this.preview();
    if (!p || !this.fieldHasRenderableContent(p.field)) {
      this.preview.set(null);
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
  }

  cancelPreview() {
    this.preview.set(null);
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
  }

  confirmEdit() {
    const e = this.editing();
    if (!e) return;
    if (!this.fieldHasRenderableContent(e.field)) {
      this.editing.set(null);
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
  }

  cancelEdit() {
    this.editing.set(null);
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
    if (!this.preview() && !this.editing()) {
      return;
    }

    const viewer = this.pdfViewerRef?.nativeElement;
    const target = event.target as Node | null;

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
    const originalValue = (original as { value?: unknown }).value;
    const originalAppender = (original as { appender?: unknown }).appender;
    const originalDecimals = (original as { decimals?: unknown }).decimals;
    const originalType = (original as { type?: unknown }).type;

    return (
      original.x !== sanitized.x ||
      original.y !== sanitized.y ||
      original.mapField !== sanitized.mapField ||
      original.fontSize !== sanitized.fontSize ||
      original.color !== sanitized.color ||
      originalType !== sanitized.type ||
      originalValue !== sanitized.value ||
      originalAppender !== sanitized.appender ||
      originalDecimals !== sanitized.decimals
    );
  }

  private prepareFieldForStorage(field: PageField): PageField {
    const type = this.normalizeFieldType(field.type);
    const base: PageField = {
      x: field.x,
      y: field.y,
      mapField: typeof field.mapField === 'string' ? field.mapField : '',
      fontSize: field.fontSize,
      color: this.normalizeColor(field.color),
      type,
    };

    const value = this.sanitizeTextPreservingSpacing(field.value);
    if (value !== undefined) {
      base.value = value;
    }

    if (type === 'number') {
      const decimals = this.normalizeFieldDecimals(field.decimals);
      if (decimals !== undefined) {
        base.decimals = decimals;
      }
      const appender = this.sanitizeOptionalAppender(field.appender);
      if (appender !== undefined) {
        base.appender = appender;
      }
    }

    return base;
  }

  private prepareFieldForForm(field: PageField): PageField {
    const decimals =
      typeof field.decimals === 'number' && Number.isFinite(field.decimals)
        ? Math.max(0, Math.round(field.decimals))
        : null;

    return {
      ...field,
      value: typeof field.value === 'string' ? field.value : '',
      appender: typeof field.appender === 'string' ? field.appender : '',
      decimals,
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
          const left = field.x * scale;
          const top = pdfCanvas.height - field.y * scale;

          const el = document.createElement('div');
          el.className = 'annotation';
          el.textContent = this.getFieldRenderValue(field);
          el.style.left = `${left}px`;
          el.style.top = `${top - field.fontSize * scale}px`;
          el.style.fontSize = `${field.fontSize * scale}px`;
          el.style.color = field.color;
          el.style.fontFamily = 'Helvetica, Arial, sans-serif';

          el.onpointerdown = (evt) => this.handleAnnotationPointerDown(evt, pageIndex, fieldIndex);
          layer.appendChild(el);
        });
      });

    this.refreshOverlay();
  }

  private handleAnnotationPointerDown(evt: PointerEvent, pageIndex: number, fieldIndex: number) {
    evt.preventDefault();
    evt.stopPropagation();
    const el = evt.currentTarget as HTMLDivElement | null;
    if (!el) return;

    const computedFontSize = parseFloat(getComputedStyle(el).fontSize || '0');
    this.dragInfo = {
      pageIndex,
      fieldIndex,
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      startLeft: parseFloat(el.style.left || '0'),
      startTop: parseFloat(el.style.top || '0'),
      fontSize: computedFontSize,
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
    const maxLeft = Math.max(pdfCanvas.width - el.offsetWidth, 0);
    const clampedLeft = Math.min(Math.max(tentativeLeft, 0), maxLeft);
    const clampedTop = Math.min(Math.max(tentativeTop, minTop), maxTop);

    if (!this.guidesFeatureEnabled()) {
      el.style.left = `${clampedLeft}px`;
      el.style.top = `${clampedTop}px`;
      this.refreshOverlay(null, []);
      return;
    }

    const snapResult = this.applySnapping(
      clampedLeft,
      clampedTop,
      { maxLeft, minTop, maxTop },
      el,
      pdfCanvas
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
      this.updateAnnotationPosition(drag.pageIndex, drag.fieldIndex, left, top, drag.fontSize);
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
    fontSizePx: number
  ) {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!pdfCanvas) return;
    const scale = this.scale();
    const boundedLeft = Math.min(Math.max(leftPx, 0), pdfCanvas.width);
    const boundedTop = Math.min(Math.max(topPx, -fontSizePx), pdfCanvas.height - fontSizePx);
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
          const updatedFields = page.fields.map((field, fIdx) =>
            fIdx === fieldIndex ? { ...field, x: newX, y: newY } : field
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

  async prevPage() {
    if (this.pageIndex() > 1) {
      this.pageIndex.update((v) => v - 1);
      await this.render();
      this.redrawAllForPage();
    }
  }

  async nextPage() {
    if (this.pdfDoc && this.pageIndex() < this.pdfDoc.numPages) {
      this.pageIndex.update((v) => v + 1);
      await this.render();
      this.redrawAllForPage();
    }
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

    const savedTemplate = this.templatesService.saveTemplate(name, this.coords());
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
    this.coords.set(clonedPages);
    this.syncCoordsTextModel();
    this.preview.set(null);
    this.editing.set(null);
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
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const loadOptions = {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
      } as const;

      const candidates = await this.getPdfByteCandidates();
      if (!candidates.length) {
        throw new Error('No se encontraron bytes de PDF para procesar.');
      }

      let pdf: any = null;
      let usedBytes: Uint8Array | null = null;
      const loadErrors: unknown[] = [];

      for (const candidate of candidates) {
        try {
          pdf = await PDFDocument.load(candidate, loadOptions);
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
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const pdfPageCount = pdf.getPageCount();

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
          const hex = field.color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;

          page.drawText(this.getFieldRenderValue(field), {
            x: field.x,
            y: field.y,
            size: field.fontSize,
            color: rgb(r, g, b),
            font,
          });
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
    return (
      a.x === b.x &&
      a.y === b.y &&
      a.mapField === b.mapField &&
      a.fontSize === b.fontSize &&
      a.color === b.color &&
      a.type === b.type &&
      (a.value ?? undefined) === (b.value ?? undefined) &&
      (a.appender ?? undefined) === (b.appender ?? undefined) &&
      (a.decimals ?? undefined) === (b.decimals ?? undefined)
    );
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

        fields.push(normalizedField);
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
