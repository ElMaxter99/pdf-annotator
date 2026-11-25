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
    const [state, view, commands, language, langJson, highlight] = await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/lang-json'),
      import('@lezer/highlight'),
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
      view.drawSelection(),
      view.highlightActiveLine(),
      commands.history(),
      language.syntaxHighlighting(highlight.classHighlighter),
      langJson.json(),
      view.keymap.of([
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
