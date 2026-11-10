import { CommonModule } from '@angular/common';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';

interface JsonTreeNode {
  label?: string;
  kind: 'object' | 'array' | 'value';
  path: string;
  isIndex?: boolean;
  children?: JsonTreeNode[];
  value?: unknown;
  valueType?: JsonPrimitiveType;
}

export interface JsonTreeMark {
  kind: 'moved' | 'new' | 'page' | 'was';
  text?: string;
}

type JsonPrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'unknown';

@Component({
  selector: 'app-json-tree',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './json-tree.component.html',
  styleUrls: ['./json-tree.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonTreeComponent implements OnChanges {
  @Input() value: unknown = null;
  @Input() label: string | null = null;
  /** Optional marks by node path (A/B comparison in batch mode): a kind chip and/or a short text. */
  @Input() marks: Readonly<Record<string, JsonTreeMark>> | null = null;

  protected rootNode: JsonTreeNode | null = null;

  private knownMarkPaths = new Set<string>();
  private readonly collapsedPaths = signal<Set<string>>(new Set());
  private readonly focusedPath = signal<string | null>(null);

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges) {
    if ('value' in changes || 'label' in changes || 'marks' in changes) {
      const previousRoot = this.rootNode;
      const previousCollapsed = new Set(this.collapsedPaths());
      const previouslyExpanded = new Set<string>();

      if (previousRoot) {
        this.collectExpandedPaths(previousRoot, previousCollapsed, previouslyExpanded);
      }

      this.rootNode = this.buildNode(this.value, {
        label: this.label,
        path: 'root',
      });
      const collapsed = new Set<string>();
      const interactivePaths = new Set<string>();
      if (this.rootNode) {
        this.populateCollapsedPaths(this.rootNode, collapsed, interactivePaths);
      }

      for (const path of previouslyExpanded) {
        if (interactivePaths.has(path)) {
          collapsed.delete(path);
        }
      }

      // Newly marked nodes open their ancestors, so a difference is visible without hunting for it.
      const markPaths = new Set(Object.keys(this.marks ?? {}));
      for (const path of markPaths) {
        if (this.knownMarkPaths.has(path)) continue;
        for (const ancestor of this.collectAncestorPaths(path)) {
          if (ancestor !== path) collapsed.delete(ancestor);
        }
      }
      this.knownMarkPaths = markPaths;

      this.collapsedPaths.set(collapsed);
    }
  }

  protected markOf(node: JsonTreeNode): JsonTreeMark | null {
    return this.marks?.[node.path] ?? null;
  }

  protected toggleNode(node: JsonTreeNode) {
    if (!node.children?.length) {
      return;
    }

    this.collapsedPaths.update((paths) => {
      const next = new Set(paths);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
      }
      return next;
    });
  }

  protected isCollapsed(node: JsonTreeNode): boolean {
    return this.collapsedPaths().has(node.path);
  }

  protected isFocused(node: JsonTreeNode): boolean {
    return this.focusedPath() === node.path;
  }

  protected trackByPath(_index: number, node: JsonTreeNode): string {
    return node.path;
  }

  protected formatValue(value: unknown, type: JsonPrimitiveType): string {
    if (type === 'string') {
      return `"${String(value)}"`;
    }

    if (type === 'null') {
      return 'null';
    }

    return String(value);
  }

  focusPath(path: string, options?: { smooth?: boolean }) {
    if (!path) {
      this.focusedPath.set(null);
      return;
    }

    this.expandPath(path);
    this.focusedPath.set(path);

    this.runAfterRender(() => {
      const target = this.findNodeElement(path);
      if (!target) {
        return;
      }

      const behavior = options?.smooth ? 'smooth' : 'auto';
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'center', behavior });
      }
    });
  }

  clearFocus() {
    this.focusedPath.set(null);
  }

  private buildNode(
    value: unknown,
    options: { label: string | null; path: string; isIndex?: boolean }
  ): JsonTreeNode {
    const { label, path, isIndex } = options;

    if (Array.isArray(value)) {
      return {
        label: label ?? undefined,
        kind: 'array',
        path,
        isIndex,
        children: value.map((item, index) =>
          this.buildNode(item, {
            label: `[${index}]`,
            path: this.joinPath(path, index.toString()),
            isIndex: true,
          })
        ),
      };
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      return {
        label: label ?? undefined,
        kind: 'object',
        path,
        isIndex,
        children: entries.map(([key, childValue]) =>
          this.buildNode(childValue, {
            label: key,
            path: this.joinPath(path, this.escapePathSegment(key)),
          })
        ),
      };
    }

    const valueType = this.resolveValueType(value);

    return {
      label: label ?? undefined,
      kind: 'value',
      path,
      isIndex,
      value,
      valueType,
    };
  }

  private resolveValueType(value: unknown): JsonPrimitiveType {
    if (value === null) {
      return 'null';
    }

    switch (typeof value) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      default:
        return 'unknown';
    }
  }

  private joinPath(parent: string, segment: string): string {
    return parent ? `${parent}/${segment}` : segment;
  }

  private escapePathSegment(value: string): string {
    return encodeURIComponent(value);
  }

  private collectExpandedPaths(
    node: JsonTreeNode,
    collapsed: Set<string>,
    target: Set<string>
  ) {
    if (!node.children?.length) {
      return;
    }

    if (!collapsed.has(node.path)) {
      target.add(node.path);
    }

    for (const child of node.children) {
      this.collectExpandedPaths(child, collapsed, target);
    }
  }

  private populateCollapsedPaths(
    node: JsonTreeNode,
    target: Set<string>,
    interactive: Set<string>
  ) {
    if (!node.children?.length) {
      return;
    }

    target.add(node.path);
    interactive.add(node.path);

    for (const child of node.children) {
      this.populateCollapsedPaths(child, target, interactive);
    }
  }

  private expandPath(path: string) {
    if (!path) {
      return;
    }

    const ancestors = this.collectAncestorPaths(path);
    if (!ancestors.length) {
      return;
    }

    this.collapsedPaths.update((paths) => {
      const next = new Set(paths);
      for (const ancestor of ancestors) {
        next.delete(ancestor);
      }
      return next;
    });
  }

  private collectAncestorPaths(path: string): string[] {
    const segments = path.split('/');
    const ancestors: string[] = [];
    for (let i = 1; i <= segments.length; i += 1) {
      const candidate = segments.slice(0, i).join('/');
      if (candidate) {
        ancestors.push(candidate);
      }
    }
    return ancestors;
  }

  private findNodeElement(path: string): HTMLElement | null {
    const hostElement = this.host.nativeElement;
    return hostElement.querySelector<HTMLElement>(`[data-json-path="${path}"]`);
  }

  private runAfterRender(callback: () => void) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => callback());
      return;
    }

    setTimeout(callback, 0);
  }
}
