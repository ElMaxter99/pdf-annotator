import { Injectable, computed, signal } from '@angular/core';

type ShortcutCombination = string;

export type ShortcutAction =
  | 'openShortcuts'
  | 'prevPage'
  | 'nextPage'
  | 'zoomIn'
  | 'zoomOut'
  | 'undo'
  | 'redo'
  | 'downloadPdf';

export interface ShortcutDefinition {
  readonly action: ShortcutAction;
  readonly labelKey: string;
  readonly defaultBindings: readonly ShortcutCombination[];
}

interface ShortcutStorageState {
  readonly [key: string]: ShortcutCombination[] | undefined;
}

const SHORTCUT_STORAGE_KEY = 'pdf-annotator.shortcuts';

const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    action: 'openShortcuts',
    labelKey: 'shortcuts.actions.openShortcuts',
    defaultBindings: ['shift+/', 'ctrl+/', 'meta+/'],
  },
  {
    action: 'prevPage',
    labelKey: 'shortcuts.actions.prevPage',
    defaultBindings: ['arrowleft', 'pageup'],
  },
  {
    action: 'nextPage',
    labelKey: 'shortcuts.actions.nextPage',
    defaultBindings: ['arrowright', 'pagedown'],
  },
  {
    action: 'zoomIn',
    labelKey: 'shortcuts.actions.zoomIn',
    defaultBindings: ['ctrl+=', 'ctrl++', 'meta+=', 'meta++'],
  },
  {
    action: 'zoomOut',
    labelKey: 'shortcuts.actions.zoomOut',
    defaultBindings: ['ctrl+-', 'meta+-'],
  },
  {
    action: 'undo',
    labelKey: 'shortcuts.actions.undo',
    defaultBindings: ['ctrl+z', 'meta+z'],
  },
  {
    action: 'redo',
    labelKey: 'shortcuts.actions.redo',
    defaultBindings: ['ctrl+shift+z', 'meta+shift+z', 'ctrl+y', 'meta+y'],
  },
  {
    action: 'downloadPdf',
    labelKey: 'shortcuts.actions.downloadPdf',
    defaultBindings: ['ctrl+s', 'meta+s'],
  },
];

@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  readonly definitions = SHORTCUT_DEFINITIONS;

  private readonly bindingMap = signal<Record<ShortcutAction, ShortcutCombination[]>>(
    this.loadBindings()
  );

  readonly bindings = computed(() => this.bindingMap());

  addBinding(action: ShortcutAction, binding: ShortcutCombination) {
    const normalized = this.normalizeCombo(binding);
    if (!normalized) {
      return;
    }

    this.bindingMap.update((current) => {
      const nextBindings = Array.from(new Set([...(current[action] ?? []), normalized]));
      const nextMap = { ...current, [action]: nextBindings };
      this.persist(nextMap);
      return nextMap;
    });
  }

  removeBinding(action: ShortcutAction, binding: ShortcutCombination) {
    const normalized = this.normalizeCombo(binding);
    if (!normalized) {
      return;
    }

    this.bindingMap.update((current) => {
      const remaining = (current[action] ?? []).filter((combo) => combo !== normalized);
      const nextMap = { ...current, [action]: remaining };
      this.persist(nextMap);
      return nextMap;
    });
  }

  resetBindings() {
    const defaults = this.buildDefaultBindings();
    this.bindingMap.set(defaults);
    this.persist(defaults);
  }

  getBindings(): Record<ShortcutAction, ShortcutCombination[]> {
    return this.bindingMap();
  }

  getBindingsFor(action: ShortcutAction): ShortcutCombination[] {
    return this.bindingMap()[action] ?? [];
  }

  formatBindingLabel(binding: ShortcutCombination): string {
    const parts = binding
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => this.formatKeyPart(part));

    return parts.join(' + ');
  }

  match(event: KeyboardEvent, action: ShortcutAction): boolean {
    const combo = this.getEventCombo(event);
    if (!combo) {
      return false;
    }

    return (this.bindingMap()[action] ?? []).includes(combo);
  }

  matchAny(event: KeyboardEvent): ShortcutAction | null {
    const combo = this.getEventCombo(event);
    if (!combo) {
      return null;
    }

    for (const definition of this.definitions) {
      if ((this.bindingMap()[definition.action] ?? []).includes(combo)) {
        return definition.action;
      }
    }

    return null;
  }

  getEventCombo(event: KeyboardEvent): ShortcutCombination | null {
    return this.toEventCombo(event);
  }

  private formatKeyPart(part: string): string {
    const normalized = part.toLowerCase();
    switch (normalized) {
      case 'ctrl':
        return 'Ctrl';
      case 'meta':
        return 'Cmd';
      case 'alt':
        return 'Alt';
      case 'shift':
        return 'Shift';
      case 'arrowleft':
        return 'Arrow Left';
      case 'arrowright':
        return 'Arrow Right';
      case 'arrowup':
        return 'Arrow Up';
      case 'arrowdown':
        return 'Arrow Down';
      case 'pageup':
        return 'Page Up';
      case 'pagedown':
        return 'Page Down';
      case ' ': {
        return 'Space';
      }
      default: {
        return normalized.length === 1
          ? normalized.toUpperCase()
          : normalized.charAt(0).toUpperCase() + normalized.slice(1);
      }
    }
  }

  private loadBindings(): Record<ShortcutAction, ShortcutCombination[]> {
    const defaults = this.buildDefaultBindings();
    const storage = this.getLocalStorage();

    if (!storage) {
      return defaults;
    }

    try {
      const storedValue = storage.getItem(SHORTCUT_STORAGE_KEY);
      if (!storedValue) {
        return defaults;
      }

      const parsed = JSON.parse(storedValue) as ShortcutStorageState | null;
      if (!parsed || typeof parsed !== 'object') {
        return defaults;
      }

      const merged: Record<ShortcutAction, ShortcutCombination[]> = { ...defaults };

      for (const definition of this.definitions) {
        const rawBindings = parsed[definition.action];
        if (!Array.isArray(rawBindings)) {
          continue;
        }

        const normalized = rawBindings
          .map((binding) => this.normalizeCombo(binding))
          .filter((binding): binding is ShortcutCombination => !!binding);

        if (normalized.length || rawBindings.length === 0) {
          merged[definition.action] = Array.from(new Set(normalized));
        }
      }

      return merged;
    } catch {
      return defaults;
    }
  }

  private normalizeCombo(combo: string): ShortcutCombination | null {
    if (!combo) {
      return null;
    }

    const normalized = combo
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join('+');

    return normalized || null;
  }

  private toEventCombo(event: KeyboardEvent): ShortcutCombination | null {
    if (!event.key) {
      return null;
    }

    const key = event.key.toLowerCase();

    if (['shift', 'control', 'ctrl', 'meta', 'alt'].includes(key)) {
      return null;
    }

    const parts: string[] = [];
    if (event.ctrlKey || key === 'control' || key === 'ctrl') {
      parts.push('ctrl');
    }
    if (event.metaKey) {
      parts.push('meta');
    }
    if (event.altKey) {
      parts.push('alt');
    }
    if (event.shiftKey) {
      parts.push('shift');
    }

    parts.push(key);

    return this.normalizeCombo(parts.join('+'));
  }

  private buildDefaultBindings(): Record<ShortcutAction, ShortcutCombination[]> {
    const entries = this.definitions.map((definition) => [
      definition.action,
      definition.defaultBindings
        .map((binding) => this.normalizeCombo(binding))
        .filter((binding): binding is ShortcutCombination => !!binding),
    ] as const);

    return Object.fromEntries(entries) as Record<ShortcutAction, ShortcutCombination[]>;
  }

  private persist(bindings: Record<ShortcutAction, ShortcutCombination[]>) {
    const storage = this.getLocalStorage();
    if (!storage) {
      return;
    }

    storage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(bindings));
  }

  private getLocalStorage(): Storage | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    return window.localStorage;
  }
}
