import { type AiRow } from '../../utils/ai-proposal.utils';
import {
  closestByName,
  closestElementIndex,
  lineBetween,
  pairName,
  type PairCandidate,
} from '../../utils/pairing.utils';
import { PairRefB, PairTarget } from './workspace.types';
import type { WorkspacePageComponent } from './workspace.page';

/**
 * Parejas A↔B: llevar a la pareja desde una tarjeta o un clic, resaltar ambos campos y unirlos con la línea.
 * Métodos de `WorkspacePageComponent` (se copian a su prototipo con `WORKSPACE_PARTS`, al final de workspace.page.ts;
 * `this` es la página).
 */
export class WorkspacePairing {
  /** Campos de A con su página propia (lo que dibuja «Dividida»). */
  pairCandidatesA(this: WorkspacePageComponent): PairCandidate<null>[] {
    return this.aPagesView().flatMap((page) =>
      page.fields.map((field) => ({
        name: pairName(field),
        page: page.num,
        x: field.x,
        y: field.y,
        ref: null,
      })),
    );
  }

  /** Campos de B ya puestos. */
  pairCandidatesB(this: WorkspacePageComponent): PairCandidate<PairRefB>[] {
    return this.coords().flatMap((page, pageIndex) =>
      page.fields.map((field, index) => ({
        name: pairName(field),
        page: page.num,
        x: field.x,
        y: field.y,
        ref: { kind: 'field' as const, page: page.num, pageIndex, index },
      })),
    );
  }

  /** Pareja en B de un campo de A: su fila de la propuesta de la IA (si hay) o el campo de B con el mismo nombre. */
  partnerInB(
    this: WorkspacePageComponent,
    name: string,
    aPage: number | null,
    x: number,
    y: number,
  ): PairCandidate<PairRefB> | null {
    const session = this.ai();
    if (session?.phase === 'ready' && aPage !== null) {
      let best: { row: AiRow; d: number } | null = null;
      for (const row of session.rows) {
        const t = this.aiTemplate.get(row.id);
        if (!row.ok || !t || row.page !== aPage || pairName(t) !== name) {
          continue;
        }
        const d = Math.hypot(t.x - x, t.y - y);
        if (!best || d < best.d) {
          best = { row, d };
        }
      }
      if (best) {
        const r = best.row;
        return {
          name,
          page: r.newPage,
          x: r.x,
          y: r.y,
          ref: { kind: 'ai', id: r.id, page: r.newPage },
        };
      }
    }
    return closestByName(name, this.pairCandidatesB(), { page: this.pageIndex(), x, y });
  }

  /** Pareja en A de un campo de B (por nombre; la página de A que va con la de B, si la hay). */
  partnerInA(
    this: WorkspacePageComponent,
    name: string,
    bPage: number,
    x: number,
    y: number,
  ): PairCandidate<null> | null {
    const shown = this.aPage();
    const near = bPage === this.pageIndex() && shown !== null ? shown : bPage;
    return closestByName(name, this.pairCandidatesA(), { page: near, x, y });
  }

  /** Lleva el visor a la pareja (B a su página y, en «Dividida», A a la suya si se puede) y la une con una línea. */
  async revealPair(this: WorkspacePageComponent, target: PairTarget): Promise<void> {
    this.clearPair();
    if (target.b && target.b.page !== this.pageIndex()) {
      await this.setPageIndex(target.b.page);
    } else if (
      !target.b &&
      target.aPage !== null &&
      this.splitActive() &&
      this.pagesLinked() &&
      !this.pageMap() &&
      target.aPage <= (this.pdfDoc()?.numPages ?? 0)
    ) {
      await this.setPageIndex(target.aPage);
    }
    if (this.splitActive() && target.aPage !== null && this.aPage() !== target.aPage) {
      if (!this.pagesLinked()) {
        await this.setPageIndexA(target.aPage);
      } else {
        // Enlazadas, A sigue a B: no se desenlaza por sorpresa; se avisa de en qué página de A está.
        this.toast.show(
          this.translationService.translate('pairing.otherPageA', { page: target.aPage }),
        );
      }
    }
    this.pairTarget = { ...target, flashUntil: Date.now() + 2000 };
    this.runAfterRender(() => this.schedulePairTick());
  }

  schedulePairTick(this: WorkspacePageComponent): void {
    if (typeof window === 'undefined' || this.pairFrame) {
      return;
    }
    this.pairFrame = window.requestAnimationFrame(() => {
      this.pairFrame = 0;
      this.pairTick();
    });
  }

  /** Cada fotograma con una pareja activa: encuentra los dos elementos (las capas se redibujan) y recoloca la línea. */
  pairTick(this: WorkspacePageComponent): void {
    const t = this.pairTarget;
    if (!t) {
      return;
    }
    if (t.b && t.b.page !== this.pageIndex()) {
      this.clearPair();
      return;
    }
    const aEl = this.findPairElementA(t);
    const bEl = this.findPairElementB(t);
    const flash = Date.now() < (t.flashUntil ?? 0);
    this.document?.querySelectorAll('.pair-focus, .pair-flash').forEach((el) => {
      if (el !== aEl && el !== bEl) {
        el.classList.remove('pair-focus', 'pair-flash');
      }
    });
    for (const el of [aEl, bEl]) {
      el?.classList.add('pair-focus');
      el?.classList.toggle('pair-flash', flash);
    }
    if (aEl && bEl) {
      const next = lineBetween(aEl.getBoundingClientRect(), bEl.getBoundingClientRect());
      const cur = this.pairLine();
      const moved = cur
        ? Math.abs(cur.x1 - next.x1) +
          Math.abs(cur.y1 - next.y1) +
          Math.abs(cur.x2 - next.x2) +
          Math.abs(cur.y2 - next.y2)
        : Infinity;
      if (moved > 0.5) {
        this.pairLine.set(next);
      }
    } else if (this.pairLine()) {
      this.pairLine.set(null);
    }
    this.schedulePairTick();
  }

  findPairElementA(this: WorkspacePageComponent, t: PairTarget): HTMLElement | null {
    const layer = this.splitLayerRef?.nativeElement;
    if (!layer || !this.splitActive() || t.aPage === null || this.aPage() !== t.aPage || !t.aName) {
      return null;
    }
    const els = Array.from(layer.querySelectorAll<HTMLElement>('.reference-field')).filter(
      (el) => el.dataset['name'] === t.aName,
    );
    if (els.length <= 1) {
      return els[0] ?? null;
    }
    const s = this.scaleOfA();
    const h = this.splitCanvasRef?.nativeElement.height ?? 0;
    const i = closestElementIndex(
      els.map((el) => ({
        left: parseFloat(el.style.left) || 0,
        top: (parseFloat(el.style.top) || 0) + (parseFloat(el.style.height) || 0),
      })),
      { left: (t.aX ?? 0) * s, top: h - (t.aY ?? 0) * s },
    );
    return els[i] ?? null;
  }

  findPairElementB(this: WorkspacePageComponent, t: PairTarget): HTMLElement | null {
    if (!t.b || t.b.page !== this.pageIndex()) {
      return null;
    }
    if (t.b.kind === 'ai') {
      return (
        this.referenceLayerRef?.nativeElement.querySelector<HTMLElement>(
          `[data-ai-id="${CSS.escape(t.b.id)}"]`,
        ) ?? null
      );
    }
    return (
      this.annotationsLayerRef?.nativeElement.querySelector<HTMLElement>(
        `.annotation[data-page-index="${t.b.pageIndex}"][data-field-index="${t.b.index}"]`,
      ) ?? null
    );
  }

  /** Quita la línea y los resaltados. */
  clearPair(this: WorkspacePageComponent): void {
    this.pairTarget = null;
    if (this.pairFrame && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.pairFrame);
    }
    this.pairFrame = 0;
    if (this.pairLine()) {
      this.pairLine.set(null);
    }
    this.document
      ?.querySelectorAll('.pair-focus, .pair-flash')
      .forEach((el) => el.classList.remove('pair-focus', 'pair-flash'));
  }

  showPairTip(this: WorkspacePageComponent, el: Element | null | undefined, key: string): void {
    if (this.pairTipTimer) {
      clearTimeout(this.pairTipTimer);
    }
    if (!el) {
      return;
    }
    const r = el.getBoundingClientRect();
    this.pairTip.set({ x: r.left + r.width / 2, y: r.top, key });
    this.pairTipTimer = setTimeout(() => this.pairTip.set(null), 1800);
  }

  /** Campo de A bajo el puntero en «Dividida» (con su posición en A). */
  hitFieldOfA(
    this: WorkspacePageComponent,
    event: MouseEvent,
  ): { el: HTMLElement; name: string; x: number; y: number } | null {
    const layer = this.splitLayerRef?.nativeElement;
    const page = this.aPage();
    if (!layer || page === null) {
      return null;
    }
    const el = Array.from(layer.querySelectorAll<HTMLElement>('.reference-field')).find((node) => {
      const r = node.getBoundingClientRect();
      return (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      );
    });
    if (!el) {
      return null;
    }
    const name = el.dataset['name'] ?? '';
    const s = this.scaleOfA();
    const h = this.splitCanvasRef?.nativeElement.height ?? 0;
    const same = this.fieldsOfA(page).filter((f) => f.name === name);
    const left = parseFloat(el.style.left) || 0;
    const bottom = (parseFloat(el.style.top) || 0) + (parseFloat(el.style.height) || 0);
    const i = closestElementIndex(
      same.map((f) => ({ left: f.x * s, top: h - f.y * s })),
      { left, top: bottom },
    );
    const f = same[i];
    return { el, name, x: f?.x ?? left / s, y: f?.y ?? (h - bottom) / s };
  }

  /** Clic en un campo de A («Dividida»): B va a la página de su pareja y se unen con una línea. */
  async onSplitAClick(this: WorkspacePageComponent, event: MouseEvent): Promise<void> {
    const hit = this.hitFieldOfA(event);
    if (!hit) {
      this.clearPair();
      return;
    }
    const aPage = this.aPage();
    const partner = this.partnerInB(hit.name, aPage, hit.x, hit.y);
    if (!partner) {
      this.clearPair();
      this.showPairTip(hit.el, 'pairing.noPartnerB');
      return;
    }
    await this.revealPair({ aName: hit.name, aPage, aX: hit.x, aY: hit.y, b: partner.ref });
  }

  /** Tarjeta de la propuesta de la IA: B a la página donde cae, A a la de origen, y la pareja unida. */
  async focusAiRow(this: WorkspacePageComponent, row: AiRow): Promise<void> {
    const t = this.aiTemplate.get(row.id);
    const target: PairTarget = {
      aName: pairName(t),
      aPage: row.page,
      aX: t?.x,
      aY: t?.y,
      b: row.ok ? { kind: 'ai', id: row.id, page: row.newPage } : null,
    };
    await this.revealPair(target);
    if (!row.ok) {
      this.runAfterRender(() =>
        this.showPairTip(this.findPairElementA(target), 'pairing.noPartnerB'),
      );
    }
  }

  /** Pasar el ratón ≥ 400 ms por un campo de B (puesto o propuesto) une con su pareja de A. */
  hoverPairB(this: WorkspacePageComponent, event: MouseEvent): void {
    const bLayer = this.annotationsLayerRef?.nativeElement;
    const refLayer = this.referenceLayerRef?.nativeElement;
    const inside = (el: Element) => {
      const r = el.getBoundingClientRect();
      return (
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom
      );
    };
    type Found = { key: string; name: string; page: number; x: number; y: number; b: PairRefB };
    let found: Found | null = null;
    const page = this.pageIndex();
    const session = this.ai();
    const proposal =
      session?.phase === 'ready'
        ? Array.from(refLayer?.querySelectorAll<HTMLElement>('[data-ai-id]') ?? []).find(inside)
        : undefined;
    if (proposal && session) {
      const id = proposal.dataset['aiId'] ?? '';
      const row = session.rows.find((r) => r.id === id);
      const t = this.aiTemplate.get(id);
      if (row && t) {
        found = {
          key: `ai:${id}`,
          name: pairName(t),
          page: row.page,
          x: t.x,
          y: t.y,
          b: { kind: 'ai', id, page: row.newPage },
        };
      }
    } else {
      const el = Array.from(bLayer?.querySelectorAll<HTMLElement>('.annotation') ?? []).find(
        inside,
      );
      const pageIndex = Number(el?.dataset['pageIndex']);
      const index = Number(el?.dataset['fieldIndex']);
      const field = el ? this.coords()[pageIndex]?.fields[index] : undefined;
      const partner = field ? this.partnerInA(pairName(field), page, field.x, field.y) : null;
      if (field && partner) {
        found = {
          key: `f:${page}:${index}`,
          name: partner.name,
          page: partner.page,
          x: partner.x,
          y: partner.y,
          b: { kind: 'field', page, pageIndex, index },
        };
      }
    }
    if ((found?.key ?? null) === this.pairHoverKey) {
      return;
    }
    this.pairHoverKey = found?.key ?? null;
    if (this.pairHoverTimer) {
      clearTimeout(this.pairHoverTimer);
      this.pairHoverTimer = null;
    }
    if (!found) {
      return;
    }
    const f = found;
    this.pairHoverTimer = setTimeout(() => {
      this.pairHoverTimer = null;
      if (this.pairHoverKey !== f.key) {
        return;
      }
      // Sin mover B (ya está a la vista): A va a la página de la pareja solo con páginas libres.
      if (this.aPage() !== f.page && !this.pagesLinked()) {
        void this.setPageIndexA(f.page);
      }
      this.pairTarget = { aName: f.name, aPage: f.page, aX: f.x, aY: f.y, b: f.b, flashUntil: 0 };
      this.schedulePairTick();
    }, 400);
  }

  markPair(this: WorkspacePageComponent, name: string | null): void {
    const aLayer = this.splitLayerRef?.nativeElement;
    const bLayer = this.annotationsLayerRef?.nativeElement;
    const fields = this.coords().find((page) => page.num === this.pageIndex())?.fields ?? [];
    aLayer?.querySelectorAll<HTMLElement>('.reference-field').forEach((el) => {
      el.classList.toggle('reference-field--pair', !!name && el.dataset['name'] === name);
    });
    bLayer?.querySelectorAll<HTMLElement>('.annotation').forEach((el) => {
      const field = fields[Number(el.dataset['fieldIndex'])];
      const own = field ? (field.mapField || field.value || '').trim() : '';
      el.classList.toggle('annotation--pair', !!name && own === name);
    });
    // La propuesta de la IA (capa encima de B) también responde al campo de A bajo el puntero.
    if (this.ai()?.phase === 'ready') {
      this.referenceLayerRef?.nativeElement
        .querySelectorAll<HTMLElement>('[data-ai-id]')
        .forEach((el) => {
          el.classList.toggle('reference-field--pair', !!name && el.dataset['name'] === name);
        });
    }
  }
}
