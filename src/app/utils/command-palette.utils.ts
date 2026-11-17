/** Pure rules of the command palette (Ctrl+K): search, ranking and the «recent» list. */

export interface PaletteCommand {
  readonly id: string;
  /** Already translated, shown as the row title. */
  readonly label: string;
  readonly icon: string;
  /** Extra words that also match (already translated, plus the English ones). */
  readonly keywords?: string;
  /** Small text on the right (group, state or position in the batch). */
  readonly hint?: string;
  /** Keyboard shortcut shown on the right. */
  readonly shortcut?: string;
  /** Why the action cannot run now; the row stays visible but dimmed. */
  readonly disabledReason?: string;
  readonly run: () => void;
}

const RECENT_KEY = 'pdf-annotator-palette-recent';
const MAX_RECENT = 4;

/** Lower case and without accents, so «plantilla» finds «Plantilla» and «Catala» finds «Català». */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function tokens(query: string): string[] {
  return normalizeSearch(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Commands whose label or keywords contain every word of the query (any order). Matches at the
 * start of the label come first; the original order breaks ties. An empty query returns nothing.
 */
export function filterCommands(
  commands: readonly PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const words = tokens(query);
  if (!words.length) {
    return [];
  }
  const scored: { command: PaletteCommand; score: number; index: number }[] = [];
  commands.forEach((command, index) => {
    const label = normalizeSearch(command.label);
    const haystack = `${label} ${normalizeSearch(command.keywords ?? '')}`;
    if (!words.every((word) => haystack.includes(word))) {
      return;
    }
    const inLabel = words.filter((word) => label.includes(word)).length;
    const startsWith = label.startsWith(words[0]) ? 1 : 0;
    scored.push({ command, score: inLabel * 2 + startsWith, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.command);
}

/** Without a query: the recently used commands first, then the defaults, up to `limit`. */
export function suggestedCommands(
  commands: readonly PaletteCommand[],
  recentIds: readonly string[],
  defaultIds: readonly string[],
  limit = MAX_RECENT,
): PaletteCommand[] {
  const byId = new Map(commands.map((command) => [command.id, command]));
  const picked: PaletteCommand[] = [];
  for (const id of [...recentIds, ...defaultIds]) {
    const command = byId.get(id);
    if (command && !picked.includes(command)) {
      picked.push(command);
    }
    if (picked.length >= limit) {
      break;
    }
  }
  return picked;
}

/** Puts `id` first in the recent list (no repeats, at most four). */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((entry) => entry !== id)].slice(0, MAX_RECENT);
}

/** The recent ids from `localStorage`, read as untrusted: only a short list of short strings. */
export function loadRecent(): string[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === 'string' && id.length <= 80).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(recent: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* private mode or full storage: the list just is not kept */
  }
}

/** Next enabled index when moving by `delta` (wraps around); -1 when every row is disabled. */
export function moveActive(
  commands: readonly PaletteCommand[],
  from: number,
  delta: 1 | -1,
): number {
  const count = commands.length;
  for (let step = 1; step <= count; step += 1) {
    const index = (((from + delta * step) % count) + count) % count;
    if (!commands[index].disabledReason) {
      return index;
    }
  }
  return -1;
}
