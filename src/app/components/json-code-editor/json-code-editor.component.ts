import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  PLATFORM_ID,
  ViewEncapsulation,
  AfterViewInit,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { EditorView } from '@codemirror/view';
import type { StateEffectType } from '@codemirror/state';

/** Texto completo con el que se sincroniza el editor; se reemplaza solo lo que cambia para conservar el plegado. */
export function diffRange(
  prev: string,
  next: string,
): { from: number; to: number; insert: string } {
  let start = 0;
  const min = Math.min(prev.length, next.length);
  while (start < min && prev.charCodeAt(start) === next.charCodeAt(start)) {
    start += 1;
  }
  let endPrev = prev.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
  ) {
    endPrev -= 1;
    endNext -= 1;
  }
  return { from: start, to: endPrev, insert: next.slice(start, endNext) };
}

/** Lo que dura el destello al copiar, en ms (la animación del SCSS dura lo mismo). */
export const COPY_FLASH_MS = 600;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Flecha del margen de plegado con la forma de VS Code (abajo = desplegado, derecha = plegado). */
function chevron(open: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', open ? 'M3.5 6 8 10.5 12.5 6' : 'M6 3.5 10.5 8 6 12.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

export interface JsonSearchLabels {
  find: string;
  matchCase: string;
  wholeWord: string;
  regexp: string;
  previous: string;
  next: string;
  close: string;
  /** Con `{{current}}` y `{{total}}`. */
  count: string;
  none: string;
}

export const DEFAULT_SEARCH_LABELS: JsonSearchLabels = {
  find: 'Buscar',
  matchCase: 'Coincidir mayúsculas y minúsculas',
  wholeWord: 'Solo palabras completas',
  regexp: 'Usar expresión regular',
  previous: 'Anterior (Mayús+Intro)',
  next: 'Siguiente (Intro)',
  close: 'Cerrar (Esc)',
  count: '{{current}} de {{total}}',
  none: 'Sin resultados',
};

/** Tope de coincidencias que se cuentan (como VS Code, que enseña «1000+»). */
export const MAX_COUNTED_MATCHES = 1000;

/** «N de M» del cuadro de búsqueda: posición de la selección entre las coincidencias (0 si no está en una). */
export function countMatches(
  matches: Iterable<{ from: number; to: number }>,
  selection: { from: number; to: number },
  limit = MAX_COUNTED_MATCHES,
): { current: number; total: number; capped: boolean } {
  let total = 0;
  let current = 0;
  for (const m of matches) {
    total += 1;
    if (!current && m.from === selection.from && m.to === selection.to) {
      current = total;
    }
    if (total >= limit) {
      return { current, total, capped: true };
    }
  }
  return { current, total, capped: false };
}

/** Cuadro de búsqueda con el aspecto del de VS Code: arriba a la derecha, Aa / ab / .*, «N de M», ↑ ↓ y ✕. */
function createFindPanel(
  v: EditorView,
  cm: typeof import('@codemirror/search'),
  viewModule: typeof import('@codemirror/view'),
  labels: () => JsonSearchLabels,
): import('@codemirror/view').Panel {
  const L = labels();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => {
    const el = document.createElement(tag);
    el.className = cls;
    return el;
  };
  const dom = make('div', 'cm-vscFind');
  dom.setAttribute('role', 'search');
  const input = make('input', 'cm-vscFind__input');
  input.type = 'text';
  input.placeholder = L.find;
  input.setAttribute('aria-label', L.find);
  input.setAttribute('main-field', 'true');
  input.spellcheck = false;
  input.setAttribute('data-testid', 'json-find-input');
  const toggle = (text: string, title: string, id: string) => {
    const b = make('button', 'cm-vscFind__toggle');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-testid', id);
    return b;
  };
  const caseBtn = toggle('Aa', L.matchCase, 'json-find-case');
  const wordBtn = toggle('ab', L.wholeWord, 'json-find-word');
  wordBtn.classList.add('cm-vscFind__toggle--word');
  const regexBtn = toggle('.*', L.regexp, 'json-find-regexp');
  const field = make('div', 'cm-vscFind__field');
  const toggles = make('span', 'cm-vscFind__toggles');
  toggles.append(caseBtn, wordBtn, regexBtn);
  field.append(input, toggles);
  const count = make('span', 'cm-vscFind__count');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('data-testid', 'json-find-count');
  const action = (path: string, title: string, id: string, run: () => void) => {
    const b = make('button', 'cm-vscFind__action');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('data-testid', id);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.4');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    b.appendChild(svg);
    b.onclick = () => {
      run();
    };
    return b;
  };
  const prev = action('M8 13V3M3.5 7.5 8 3l4.5 4.5', L.previous, 'json-find-prev', () => {
    cm.findPrevious(v);
  });
  const next = action('M8 3v10M3.5 8.5 8 13l4.5-4.5', L.next, 'json-find-next', () => {
    cm.findNext(v);
  });
  const close = action('M4 4l8 8M12 4l-8 8', L.close, 'json-find-close', () => {
    cm.closeSearchPanel(v);
    v.focus();
  });
  dom.append(field, count, prev, next, close);

  const flags = { caseSensitive: false, wholeWord: false, regexp: false };
  const readQuery = (q: import('@codemirror/search').SearchQuery) => {
    if (document.activeElement !== input) input.value = q.search;
    flags.caseSensitive = q.caseSensitive;
    flags.wholeWord = q.wholeWord;
    flags.regexp = q.regexp;
    caseBtn.setAttribute('aria-pressed', `${flags.caseSensitive}`);
    wordBtn.setAttribute('aria-pressed', `${flags.wholeWord}`);
    regexBtn.setAttribute('aria-pressed', `${flags.regexp}`);
  };
  const commit = () => {
    const query = new cm.SearchQuery({ search: input.value, ...flags });
    v.dispatch({ effects: cm.setSearchQuery.of(query) });
  };
  const refreshCount = () => {
    const query = cm.getSearchQuery(v.state);
    const labelsNow = labels();
    if (!query.search) {
      count.textContent = '';
      dom.classList.remove('cm-vscFind--none');
      return;
    }
    if (!query.valid) {
      count.textContent = labelsNow.none;
      dom.classList.add('cm-vscFind--none');
      return;
    }
    const sel = v.state.selection.main;
    const cursor = query.getCursor(v.state) as Iterator<{ from: number; to: number }>;
    const res = countMatches({ [Symbol.iterator]: () => cursor }, sel);
    dom.classList.toggle('cm-vscFind--none', res.total === 0);
    count.textContent = res.total
      ? labelsNow.count
          .replace('{{current}}', res.current ? `${res.current}` : '?')
          .replace('{{total}}', `${res.total}${res.capped ? '+' : ''}`)
      : labelsNow.none;
  };
  for (const [btn, key] of [
    [caseBtn, 'caseSensitive'],
    [wordBtn, 'wholeWord'],
    [regexBtn, 'regexp'],
  ] as const) {
    btn.onclick = () => {
      flags[key] = !flags[key];
      btn.setAttribute('aria-pressed', `${flags[key]}`);
      commit();
    };
  }
  input.addEventListener('input', () => {
    commit();
    // Como VS Code: al escribir salta a la primera coincidencia desde el cursor, sin saltarse la que ya está
    // seleccionada (al añadir una letra, la coincidencia actual sigue valiendo si aún encaja).
    // (No se usa `findNext`: selecciona el texto del cuadro y la siguiente letra lo borraría.)
    const query = cm.getSearchQuery(v.state);
    if (input.value && query.valid) {
      const from = v.state.selection.main.from;
      const first = (cursor: Iterator<{ from: number; to: number }>) => {
        const step = cursor.next();
        return step.done ? null : step.value;
      };
      const match =
        first(query.getCursor(v.state, from) as Iterator<{ from: number; to: number }>) ??
        first(query.getCursor(v.state) as Iterator<{ from: number; to: number }>);
      if (match) {
        v.dispatch({
          selection: { anchor: match.from, head: match.to },
          effects: viewModule.EditorView.scrollIntoView(match.from, { y: 'center' }),
          userEvent: 'select.search',
        });
      }
    }
    refreshCount();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) cm.findPrevious(v);
      else cm.findNext(v);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cm.closeSearchPanel(v);
      v.focus();
    } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      caseBtn.click();
    } else if (e.altKey && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      wordBtn.click();
    } else if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      regexBtn.click();
    }
  });
  readQuery(cm.getSearchQuery(v.state));
  return {
    dom,
    top: true,
    mount: () => {
      // Abrir con texto seleccionado lo busca (como VS Code); si no, se queda la última búsqueda.
      const sel = v.state.selection.main;
      const picked = sel.empty ? '' : v.state.sliceDoc(sel.from, sel.to);
      if (picked && !picked.includes('\n')) {
        input.value = picked;
        commit();
      }
      input.select();
      refreshCount();
    },
    update: (u) => {
      const changedQuery = u.transactions.some((t) =>
        t.effects.some((e) => e.is(cm.setSearchQuery)),
      );
      if (changedQuery) readQuery(cm.getSearchQuery(u.state));
      if (changedQuery || u.docChanged || u.selectionSet) refreshCount();
    },
  };
}

/**
 * Editor de código del JSON de anotaciones (P-200 a P-202): CodeMirror 6 con margen de plegado como VS Code.
 * Se carga de forma diferida (`import()`) para que ni la landing ni el lote paguen su peso. El plegado es solo
 * visual: copiar una selección que cubra un bloque plegado copia el texto completo.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  selector: 'app-json-code-editor',
  standalone: true,
  template: '',
  styleUrl: './json-code-editor.component.scss',
  host: { class: 'json-code-editor' },
})
export class JsonCodeEditorComponent implements AfterViewInit, OnDestroy {
  readonly value = input<string>('');
  readonly placeholderText = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly foldLabel = input<string>('Plegar');
  readonly unfoldLabel = input<string>('Desplegar');
  /** Textos del cuadro de búsqueda (Ctrl+F), traducidos por quien usa el editor. */
  readonly searchLabels = input<JsonSearchLabels>(DEFAULT_SEARCH_LABELS);
  /** Línea (1) del error de sintaxis, para marcarla. 0 o null: ninguna. */
  readonly errorLine = input<number | null>(null);

  readonly valueChange = output<string>();
  readonly pasted = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private view: EditorView | null = null;
  private setError: StateEffectType<number> | null = null;
  private cm: {
    state: typeof import('@codemirror/state');
    view: typeof import('@codemirror/view');
    language: typeof import('@codemirror/language');
  } | null = null;
  private pendingFocus = false;
  private destroyed = false;

  constructor() {
    // Lectura del texto completo desde fuera (e2e y depuración): el editor virtualiza las líneas del DOM.
    Object.defineProperty(this.host.nativeElement, 'value', {
      get: () => this.getValue(),
      configurable: true,
    });
    Object.defineProperty(this.host.nativeElement, 'selectedText', {
      get: () => {
        const sel = this.view?.state.selection.main;
        return sel ? this.view!.state.sliceDoc(sel.from, sel.to) : '';
      },
      configurable: true,
    });
    effect(() => {
      const next = this.value();
      this.syncValue(next);
    });
    effect(() => {
      const line = this.errorLine();
      if (this.view && this.setError) {
        this.view.dispatch({ effects: this.setError.of(line ?? 0) });
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const [state, view, commands, language, langJson, highlight, search] = await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/lang-json'),
      import('@lezer/highlight'),
      import('@codemirror/search'),
    ]);
    if (this.destroyed) {
      return;
    }
    this.cm = { state, view, language };
    const errorEffect = state.StateEffect.define<number>();
    this.setError = errorEffect;
    const errorField = state.StateField.define({
      create: () => view.Decoration.none,
      update: (deco, tr) => {
        let next = deco.map(tr.changes);
        for (const e of tr.effects) {
          if (e.is(errorEffect)) {
            const n = e.value;
            next =
              n > 0 && n <= tr.state.doc.lines
                ? view.Decoration.set([
                    view.Decoration.line({ class: 'cm-errorLine' }).range(
                      tr.state.doc.line(n).from,
                    ),
                  ])
                : view.Decoration.none;
          }
        }
        return next;
      },
      provide: (f) => view.EditorView.decorations.from(f),
    });
    const foldLabel = () => this.foldLabel();
    const unfoldLabel = () => this.unfoldLabel();
    // Destello al copiar (como «highlight on copy» de VS Code): marca lo copiado un instante.
    const flashEffect = state.StateEffect.define<{ from: number; to: number }[]>();
    const flashField = state.StateField.define({
      create: () => view.Decoration.none,
      update: (deco, tr) => {
        let next = deco.map(tr.changes);
        for (const e of tr.effects) {
          if (e.is(flashEffect)) {
            next = view.Decoration.set(
              e.value
                .filter((r) => r.to > r.from)
                .map((r) => view.Decoration.mark({ class: 'cm-copyFlash' }).range(r.from, r.to)),
              true,
            );
          }
        }
        return next;
      },
      provide: (f) => view.EditorView.decorations.from(f),
    });
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    const flashCopy = (v: EditorView) => {
      const sel = v.state.selection;
      const ranges = sel.ranges.some((r) => !r.empty)
        ? sel.ranges.filter((r) => !r.empty).map((r) => ({ from: r.from, to: r.to }))
        : // Sin selección, copiar copia la línea entera (como VS Code): se destella la línea.
          sel.ranges.map((r) => {
            const line = v.state.doc.lineAt(r.head);
            return { from: line.from, to: line.to };
          });
      v.dispatch({ effects: flashEffect.of(ranges) });
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        if (this.view === v) v.dispatch({ effects: flashEffect.of([]) });
      }, COPY_FLASH_MS);
    };
    // Fondo de la línea plegada (como `editor.foldBackground` de VS Code).
    const foldedLines = view.ViewPlugin.fromClass(
      class {
        decorations: import('@codemirror/view').DecorationSet;
        constructor(v: EditorView) {
          this.decorations = this.build(v);
        }
        update(u: import('@codemirror/view').ViewUpdate) {
          this.decorations = this.build(u.view);
        }
        build(v: EditorView) {
          const marks: import('@codemirror/state').Range<import('@codemirror/view').Decoration>[] =
            [];
          const iter = language.foldedRanges(v.state).iter();
          for (; iter.value; iter.next()) {
            marks.push(
              view.Decoration.line({ class: 'cm-foldedLine' }).range(
                v.state.doc.lineAt(iter.from).from,
              ),
            );
          }
          return view.Decoration.set(marks, true);
        }
      },
      { decorations: (p) => p.decorations },
    );
    const extensions = [
      view.lineNumbers(),
      language.foldGutter({
        markerDOM: (open) => {
          const el = document.createElement('span');
          el.className = open ? 'cm-foldMarker' : 'cm-foldMarker cm-foldMarker--folded';
          el.title = open ? foldLabel() : unfoldLabel();
          el.setAttribute('aria-label', el.title);
          el.setAttribute('role', 'button');
          el.appendChild(chevron(open));
          return el;
        },
      }),
      foldedLines,
      flashField,
      language.codeFolding({
        placeholderDOM: (v, onclick) => {
          const el = document.createElement('span');
          el.className = 'cm-foldPlaceholder';
          el.textContent = '⋯';
          el.title = unfoldLabel();
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', unfoldLabel());
          el.onclick = onclick;
          return el;
        },
      }),
      search.search({
        top: true,
        createPanel: (v) => createFindPanel(v, search, view, () => this.searchLabels()),
      }),
      view.drawSelection(),
      view.highlightActiveLine(),
      commands.history(),
      language.syntaxHighlighting(highlight.classHighlighter),
      langJson.json(),
      view.keymap.of([
        ...search.searchKeymap,
        ...language.foldKeymap,
        ...commands.defaultKeymap,
        ...commands.historyKeymap,
      ]),
      view.EditorView.lineWrapping,
      view.EditorView.contentAttributes.of({
        'aria-label': this.ariaLabel(),
        spellcheck: 'false',
        autocapitalize: 'off',
        autocorrect: 'off',
      }),
      view.EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) {
          this.valueChange.emit(u.state.doc.toString());
        }
      }),
      view.EditorView.domEventHandlers({
        paste: () => {
          this.pasted.emit();
          return false;
        },
        copy: (_e, v) => {
          flashCopy(v);
          return false;
        },
      }),
      errorField,
      ...(this.placeholderText() ? [view.placeholder(this.placeholderText())] : []),
    ];
    const external = state.Annotation.define<boolean>();
    this.externalAnnotation = external;
    this.extensions = extensions;
    this.view = new view.EditorView({
      state: state.EditorState.create({ doc: this.value(), extensions }),
      parent: this.host.nativeElement,
    });
    const line = this.errorLine();
    if (line) {
      this.view.dispatch({ effects: errorEffect.of(line) });
    }
    if (this.pendingFocus) {
      this.view.focus();
      this.pendingFocus = false;
    }
  }

  private extensions: import('@codemirror/state').Extension[] = [];
  private externalAnnotation: ReturnType<
    typeof import('@codemirror/state').Annotation.define<boolean>
  > | null = null;

  ngOnDestroy(): void {
    this.destroyed = true;
    this.view?.destroy();
    this.view = null;
  }

  /** Vacía el historial de deshacer del editor (al cambiar de documento, como al asignar `value` a un textarea). */
  resetHistory(): void {
    const view = this.view;
    const cm = this.cm;
    if (!view || !cm) {
      return;
    }
    view.setState(
      cm.state.EditorState.create({ doc: view.state.doc.toString(), extensions: this.extensions }),
    );
    if (this.errorLine()) {
      view.dispatch({ effects: this.setError!.of(this.errorLine() ?? 0) });
    }
  }

  getValue(): string {
    return this.view ? this.view.state.doc.toString() : this.value();
  }

  private syncValue(next: string): void {
    const view = this.view;
    if (!view || !this.externalAnnotation) {
      return;
    }
    const prev = view.state.doc.toString();
    if (prev === next) {
      return;
    }
    const change = diffRange(prev, next);
    view.dispatch({
      changes: change,
      annotations: [
        this.externalAnnotation.of(true),
        this.cm!.state.Transaction.addToHistory.of(false),
      ],
    });
  }

  focus(): void {
    if (this.view) {
      this.view.focus();
    } else {
      this.pendingFocus = true;
    }
  }

  /** Selecciona el rango, lo despliega si está dentro de un bloque plegado y lo deja a la vista (sin robar el foco). */
  revealRange(start: number, end: number): void {
    const view = this.view;
    const cm = this.cm;
    if (!view || !cm) {
      return;
    }
    const len = view.state.doc.length;
    const from = Math.max(0, Math.min(start, len));
    const to = Math.max(from, Math.min(end, len));
    const effects: import('@codemirror/state').StateEffect<unknown>[] = [];
    const folded = cm.language.foldedRanges(view.state).iter();
    for (; folded.value; folded.next()) {
      if (folded.from < to && folded.to > from) {
        effects.push(cm.language.unfoldEffect.of({ from: folded.from, to: folded.to }));
      }
    }
    effects.push(cm.view.EditorView.scrollIntoView(from, { y: 'start', yMargin: 48 }));
    view.dispatch({ selection: { anchor: from, head: to }, effects });
  }

  /** Pliega todo salvo el objeto raíz (queda `{ "pages": […] }` y sus bloques interiores plegados). */
  foldAll(): void {
    const view = this.view;
    const cm = this.cm;
    if (!view || !cm) {
      return;
    }
    const { state } = view;
    const effects: import('@codemirror/state').StateEffect<unknown>[] = [];
    for (let n = 2; n <= state.doc.lines; n += 1) {
      const line = state.doc.line(n);
      const range = cm.language.foldable(state, line.from, line.to);
      if (range) {
        effects.push(cm.language.foldEffect.of(range));
      }
    }
    if (effects.length) {
      view.dispatch({ effects });
    }
  }

  unfoldAll(): void {
    if (this.view && this.cm) {
      this.cm.language.unfoldAll(this.view);
    }
  }
}
