import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { PageField } from '../../../../models/annotation.model';
import { fieldHasRenderableContent } from '../../../../utils/field-style.utils';
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  formatDateParts,
  sanitizeDateFormat,
} from '../../../../utils/date-format.utils';
import {
  placePopover,
  popoverMaxHeight,
  sheetScrollDelta,
  PopoverRect,
} from '../../../../utils/popover-placement.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

export type AnnotationEditorMode = 'preview' | 'edit';

const MORE_KEY = 'pdf-annotator.editorMore';

function readMore(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MORE_KEY) === '1';
  } catch {
    return false;
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-annotation-editor',
  standalone: true,
  templateUrl: './annotation-editor.component.html',
  imports: [CommonModule, FormsModule, TranslationPipe],
  host: { style: 'display: contents' },
})
export class AnnotationEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  @Input({ required: true }) mode!: AnnotationEditorMode;
  @Input({ required: true }) field!: PageField;
  @Input({ required: true }) leftPx = 0;
  @Input({ required: true }) topPx = 0;

  @ViewChild('editorRoot', { static: false }) editorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('fontDropdown', { static: false }) fontDropdownRef?: ElementRef<HTMLDivElement>;
  @ViewChild('fontSearch', { static: false }) fontSearchRef?: ElementRef<HTMLInputElement>;

  readonly types = ['text', 'check', 'radio', 'number', 'date'] as const;
  readonly datePresets = DATE_FORMAT_PRESETS;
  readonly defaultDateFormat = DEFAULT_DATE_FORMAT;
  /** «Personalizado…» elegido aunque el texto escrito coincida (aún) con una opción de la lista. */
  private readonly customDate = signal(false);
  readonly more = signal(readMore());
  readonly showError = signal(false);

  private viewer: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private sheetScrolled = false;
  private readonly onViewport = () => this.reposition();

  get isEdit(): boolean {
    return this.mode === 'edit';
  }

  /** In edit mode a locked annotation cannot be modified until unlocked. */
  get locked(): boolean {
    return this.isEdit && !!this.field.locked;
  }

  get dateChoice(): string {
    const format = (this.field.dateFormat ?? '').trim() || DEFAULT_DATE_FORMAT;
    return !this.customDate() && (DATE_FORMAT_PRESETS as readonly string[]).includes(format)
      ? format
      : 'custom';
  }

  /** Ejemplo con un día y un mes de una cifra, para que se vea la diferencia entre D y DD. */
  get dateExample(): string {
    const format = sanitizeDateFormat(this.field.dateFormat) ?? DEFAULT_DATE_FORMAT;
    return formatDateParts({ year: 2026, month: 3, day: 5 }, format);
  }

  onDateChoice(choice: string) {
    if (choice === 'custom') {
      this.customDate.set(true);
      return;
    }
    this.customDate.set(false);
    this.field.dateFormat = choice;
  }

  get hexValue(): string {
    return this.isEdit ? this.vm.editHexInput() : this.vm.previewHexInput();
  }

  get rgbValue(): string {
    return this.isEdit ? this.vm.editRgbInput() : this.vm.previewRgbInput();
  }

  ngAfterViewInit() {
    const root = this.editorRef?.nativeElement;
    if (!root) return;
    this.viewer = root.closest<HTMLElement>('.viewer');
    this.viewer?.addEventListener('scroll', this.onViewport, { passive: true });
    if (typeof window !== 'undefined') window.addEventListener('resize', this.onViewport);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.reposition());
      this.observer.observe(root);
      if (this.viewer) this.observer.observe(this.viewer);
    }
    this.reposition();
  }

  ngOnChanges() {
    if (this.editorRef) this.reposition();
  }

  ngOnDestroy() {
    this.viewer?.removeEventListener('scroll', this.onViewport);
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onViewport);
    this.observer?.disconnect();
  }

  toggleMore() {
    const next = !this.more();
    this.more.set(next);
    try {
      localStorage.setItem(MORE_KEY, next ? '1' : '0');
    } catch {
      /* sin almacenamiento: solo vale para esta caja */
    }
    queueMicrotask(() => this.reposition());
  }

  /** Coloca la caja junto al punto sin salirse del visor (ver `placePopover`). */
  reposition() {
    const root = this.editorRef?.nativeElement;
    const viewer = this.viewer;
    const stage = root?.offsetParent as HTMLElement | null;
    if (!root || !viewer || !stage) return;

    const vr = viewer.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const left = vr.left + viewer.clientLeft - sr.left;
    const top = vr.top + viewer.clientTop - sr.top;
    const bounds: PopoverRect = {
      left,
      top,
      right: left + viewer.clientWidth,
      bottom: top + viewer.clientHeight,
    };

    root.style.maxHeight = `${popoverMaxHeight(bounds)}px`;
    root.style.width = '';
    const place = placePopover({
      anchor: { x: this.leftPx, y: this.topPx },
      size: { width: root.offsetWidth, height: root.offsetHeight },
      bounds,
    });
    if (place.mode === 'sheet') {
      root.style.maxHeight = `${place.maxHeight}px`;
      root.style.width = `${place.width}px`;
      // La altura real puede haber cambiado por el nuevo máximo.
      place.top = Math.max(bounds.top, bounds.bottom - root.offsetHeight);
    }
    root.style.left = `${Math.round(place.left)}px`;
    root.style.top = `${Math.round(place.top)}px`;
    root.dataset['placement'] = place.mode;
    root.dataset['arrow'] = place.arrow;
    root.style.setProperty('--arrow-top', `${Math.round(place.arrowTop)}px`);

    if (place.mode === 'sheet' && !this.sheetScrolled) {
      this.sheetScrolled = true;
      const delta = sheetScrollDelta(this.topPx, place.top);
      if (delta > 0) viewer.scrollBy({ top: delta, behavior: 'auto' });
    }
  }

  onColorPicker(value: string) {
    this.isEdit ? this.vm.onEditColorPicker(value) : this.vm.onPreviewColorPicker(value);
  }

  onHexInput(value: string) {
    this.isEdit ? this.vm.setEditColorFromHex(value) : this.vm.setPreviewColorFromHex(value);
  }

  onRgbInput(value: string) {
    this.isEdit ? this.vm.setEditColorFromRgb(value) : this.vm.setPreviewColorFromRgb(value);
  }

  confirm() {
    if (!this.isEdit && !fieldHasRenderableContent(this.field)) {
      this.showError.set(true);
      this.editorRef?.nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      return;
    }
    this.isEdit ? this.vm.confirmEdit() : this.vm.confirmPreview();
  }

  cancel() {
    this.isEdit ? this.vm.cancelEdit() : this.vm.cancelPreview();
  }
}
