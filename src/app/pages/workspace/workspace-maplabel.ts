import { normalizeFieldType } from '../../utils/annotation-fields.utils';
import {
  placeLabels,
  shortenMapField,
  splitMapField,
  wantsMapLabel,
  type Rect,
} from '../../utils/map-label.utils';
import type { WorkspacePageComponent } from './workspace.page';

const HOVER_DELAY_MS = 250;
const LEAVE_DELAY_MS = 120;

/**
 * Rótulo mini y cuadro con el mapField de cada anotación (mesas P-184 a P-186). Métodos de `WorkspacePageComponent`
 * (se copian a su prototipo con `WORKSPACE_PARTS`; `this` es la página). Solo es ayuda de pantalla: nada de esto llega
 * al JSON ni al PDF.
 */
export class WorkspaceMapLabel {
  /** Draws the labels of the current page and wires the tooltip. Called after the annotations are drawn. */
  drawMapLabels(this: WorkspacePageComponent, layer: HTMLElement): void {
    for (const old of Array.from(layer.querySelectorAll('.map-label, .map-label-tick'))) {
      old.remove();
    }
    const cfg = this.previewSettings.mapLabel();
    const annotations = Array.from(layer.querySelectorAll<HTMLElement>('.annotation'));
    for (const el of annotations) {
      if (cfg.show) {
        const field = this.mapFieldOf(el);
        el.tabIndex = 0;
        el.setAttribute('aria-label', this.mapFieldAria(el, field?.mapField));
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('aria-label');
      }
    }
    this.mapLabelsHidden.set(0);
    if (!cfg.show) {
      this.hideMapTip();
      return;
    }
    this.wireMapTip(layer);

    const origin = layer.getBoundingClientRect();
    const rectOf = (el: HTMLElement): Rect => {
      const r = el.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    };
    const ctx = this.previewSettings.context();
    const wanted: { el: HTMLElement; text: string; box: Rect; missing: boolean }[] = [];
    for (const el of annotations) {
      if (el.dataset['hidden'] === 'true') continue;
      const field = this.mapFieldOf(el);
      if (!field) continue;
      const type = normalizeFieldType(field.type);
      const hasValue = typeof field.value === 'string' && field.value.trim() !== '';
      if (!wantsMapLabel(type, cfg.scope, ctx.mode, hasValue)) continue;
      const name = (field.mapField ?? '').trim();
      wanted.push({
        el,
        text: name ? shortenMapField(name, cfg.max) : this.translationService.translate('mapLabel.none'),
        box: rectOf(el),
        missing: !name,
      });
    }
    if (!wanted.length) return;

    const labels = wanted.map((w) => {
      const label = document.createElement('div');
      label.className = 'map-label';
      label.classList.toggle('map-label--none', w.missing);
      label.textContent = w.text;
      label.setAttribute('aria-hidden', 'true');
      label.style.visibility = 'hidden';
      layer.appendChild(label);
      return label;
    });
    const sizes = labels.map((l) => ({ w: l.offsetWidth, h: l.offsetHeight }));
    const obstacles = annotations.filter((el) => el.dataset['hidden'] !== 'true').map(rectOf);
    const placements = placeLabels(
      wanted.map((w, i) => ({ box: w.box, label: sizes[i] })),
      obstacles,
      cfg.position,
    );
    let hidden = 0;
    placements.forEach((p, i) => {
      const label = labels[i];
      if (p.slot === 'hidden') {
        label.remove();
        hidden += 1;
        return;
      }
      label.style.left = `${p.x}px`;
      label.style.top = `${p.y}px`;
      label.style.visibility = '';
      if (p.slot === 'lane2' || p.slot === 'above2') {
        label.classList.add('map-label--lane2');
        const box = wanted[i].box;
        const tick = document.createElement('i');
        tick.className = 'map-label-tick';
        tick.setAttribute('aria-hidden', 'true');
        const top = p.slot === 'lane2' ? box.y + box.h : p.y + sizes[i].h;
        const height = p.slot === 'lane2' ? p.y - top : box.y - top;
        tick.style.left = `${box.x + box.w / 2}px`;
        tick.style.top = `${top}px`;
        tick.style.height = `${Math.max(0, height)}px`;
        layer.appendChild(tick);
      }
    });
    this.mapLabelsHidden.set(hidden);
  }

  onMapLabelMax(this: WorkspacePageComponent, value: unknown): void {
    this.mapLabelMaxError.set(!this.previewSettings.setMapLabelMax(value));
  }

  resetMapLabel(this: WorkspacePageComponent): void {
    this.mapLabelMaxError.set(false);
    this.previewSettings.resetMapLabel();
  }

  mapFieldOf(this: WorkspacePageComponent, el: HTMLElement) {
    const page = Number(el.dataset['pageIndex']);
    const index = Number(el.dataset['fieldIndex']);
    return this.coords()[page]?.fields[index] ?? null;
  }

  mapFieldAria(this: WorkspacePageComponent, el: HTMLElement, mapField: string | undefined): string {
    const field = this.mapFieldOf(el);
    const type = this.translationService.translate(
      `annotation.fields.type.options.${normalizeFieldType(field?.type)}`,
    );
    return `${type}, ${mapField?.trim() || this.translationService.translate('mapLabel.none')}`;
  }

  /** Hover (after 250 ms) and focus (at once) open the tooltip; Esc, leaving and any press close it. */
  wireMapTip(this: WorkspacePageComponent, layer: HTMLElement): void {
    if (layer.dataset['mapTip'] === '1') return;
    layer.dataset['mapTip'] = '1';
    const annotationOf = (target: EventTarget | null) =>
      target instanceof Element ? (target.closest('.annotation') as HTMLElement | null) : null;
    layer.addEventListener('pointerover', (evt) => {
      const el = annotationOf(evt.target);
      if (!el || (evt.buttons ?? 0) !== 0) return;
      this.scheduleMapTip(el, HOVER_DELAY_MS);
    });
    layer.addEventListener('pointerout', (evt) => {
      const el = annotationOf(evt.target);
      if (!el || el.contains(evt.relatedTarget as Node | null)) return;
      this.scheduleMapTipHide(LEAVE_DELAY_MS);
    });
    layer.addEventListener('pointerdown', () => this.hideMapTip());
    layer.addEventListener('focusin', (evt) => {
      const el = annotationOf(evt.target);
      if (el) this.scheduleMapTip(el, 0);
    });
    layer.addEventListener('focusout', () => this.hideMapTip());
    // Esc cierra el cuadro aunque solo se haya abierto con el cursor (el foco no está en la capa).
    document.addEventListener(
      'keydown',
      (evt) => {
        if (evt.key === 'Escape' && this.mapTip()) {
          evt.stopPropagation();
          this.hideMapTip();
        }
      },
      true,
    );
  }

  scheduleMapTip(this: WorkspacePageComponent, el: HTMLElement, delay: number): void {
    window.clearTimeout(this.mapTipTimer);
    this.mapTipTimer = window.setTimeout(() => this.showMapTip(el), delay);
  }

  scheduleMapTipHide(this: WorkspacePageComponent, delay: number): void {
    window.clearTimeout(this.mapTipTimer);
    this.mapTipTimer = window.setTimeout(() => this.mapTip.set(null), delay);
  }

  hideMapTip(this: WorkspacePageComponent): void {
    window.clearTimeout(this.mapTipTimer);
    this.mapTip.set(null);
  }

  keepMapTip(this: WorkspacePageComponent): void {
    window.clearTimeout(this.mapTipTimer);
  }

  showMapTip(this: WorkspacePageComponent, el: HTMLElement): void {
    const cfg = this.previewSettings.mapLabel();
    const field = this.mapFieldOf(el);
    if (!cfg.show || !cfg.tooltip || !field || !el.isConnected) {
      this.mapTip.set(null);
      return;
    }
    const name = (field.mapField ?? '').trim();
    const { prefix, tail } = splitMapField(name);
    const t = (key: string, params?: Record<string, string | number>) =>
      this.translationService.translate(key, params);
    const rect = el.getBoundingClientRect();
    this.mapTip.set({
      prefix,
      tail: name ? tail : t('mapLabel.none'),
      none: !name,
      meta: t('mapLabel.meta', {
        type: t(`annotation.fields.type.options.${normalizeFieldType(field.type)}`),
        page: this.coords()[Number(el.dataset['pageIndex'])]?.num ?? this.pageIndex(),
        x: String(field.x).replace('.', ','),
        y: String(field.y).replace('.', ','),
      }),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)),
      top: rect.bottom + 8,
    });
  }
}
