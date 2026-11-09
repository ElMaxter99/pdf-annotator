/** Fields of a template that usually hold the PDF's name, in order of preference. */
export const KEY_FIELD_CANDIDATES = [
  'pdfName',
  'pdf_name',
  'pdfFileName',
  'fileName',
  'filename',
  'file',
  'pdf',
  'name',
] as const;

/** Pseudo key: the name of the file a lone template came from. */
export const FILE_KEY = '#file';
export const DEFAULT_KEY_FIELD = 'pdfName';

export interface MatchableTemplate {
  readonly id: string;
  readonly keys: Readonly<Record<string, string>>;
}

export interface MatchablePdf {
  readonly id: string;
  readonly name: string;
}

export type MatchKind = 'exact' | 'similar' | 'choose' | 'none';

export interface MatchOutcome {
  readonly kind: MatchKind;
  /** Set for `exact` and `similar`: the one template that was paired. */
  readonly templateId?: string;
  /** Templates to pick from when the match is ambiguous. */
  readonly candidates: readonly string[];
}

/** Lower case, no accents, no `.pdf`, separators collapsed: `Álbarán_0331.PDF` → `albaran-0331`. */
export function normalizeMatchName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\.pdf$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function keyOf(template: MatchableTemplate, keyField: string): string {
  return (template.keys[keyField] ?? '').trim();
}

export function templateLabel(template: MatchableTemplate, keyField: string, fallback: string): string {
  return keyOf(template, keyField) || template.keys[FILE_KEY] || fallback;
}

export function matchPdfToTemplates(
  pdfName: string,
  templates: readonly MatchableTemplate[],
  keyField: string
): MatchOutcome {
  const withKey = templates.filter((template) => keyOf(template, keyField));
  const exact = withKey.filter((template) => keyOf(template, keyField) === pdfName.trim());
  if (exact.length === 1) return { kind: 'exact', templateId: exact[0].id, candidates: [exact[0].id] };
  if (exact.length > 1) return { kind: 'choose', candidates: exact.map((t) => t.id) };

  const wanted = normalizeMatchName(pdfName);
  const similar = wanted
    ? withKey.filter((template) => normalizeMatchName(keyOf(template, keyField)) === wanted)
    : [];
  if (similar.length === 1) {
    return { kind: 'similar', templateId: similar[0].id, candidates: [similar[0].id] };
  }
  if (similar.length > 1) return { kind: 'choose', candidates: similar.map((t) => t.id) };
  return { kind: 'none', candidates: [] };
}

/**
 * Matches every PDF. A template never ends up paired automatically with two PDFs: if several
 * claim it, the exact claimant keeps it (when there is only one) and the rest must be chosen.
 */
export function matchAll(
  pdfs: readonly MatchablePdf[],
  templates: readonly MatchableTemplate[],
  keyField: string
): Map<string, MatchOutcome> {
  const outcomes = new Map<string, MatchOutcome>();
  const claims = new Map<string, string[]>();
  for (const pdf of pdfs) {
    const outcome = matchPdfToTemplates(pdf.name, templates, keyField);
    outcomes.set(pdf.id, outcome);
    if (outcome.templateId) claims.set(outcome.templateId, [...(claims.get(outcome.templateId) ?? []), pdf.id]);
  }
  for (const [templateId, pdfIds] of claims) {
    if (pdfIds.length < 2) continue;
    const exact = pdfIds.filter((id) => outcomes.get(id)?.kind === 'exact');
    const keeper = exact.length === 1 ? exact[0] : null;
    for (const id of pdfIds) {
      if (id !== keeper) outcomes.set(id, { kind: 'choose', candidates: [templateId] });
    }
  }
  return outcomes;
}

function bigrams(value: string): string[] {
  const text = value.replace(/-/g, ' ');
  if (text.length < 2) return [text];
  const pairs: string[] = [];
  for (let i = 0; i < text.length - 1; i += 1) pairs.push(text.slice(i, i + 2));
  return pairs;
}

/** 0–100 closeness of two names (Dice coefficient on character pairs, after normalising). */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeMatchName(a);
  const y = normalizeMatchName(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const pool = bigrams(y);
  let hits = 0;
  for (const pair of bigrams(x)) {
    const at = pool.indexOf(pair);
    if (at !== -1) {
      hits += 1;
      pool.splice(at, 1);
    }
  }
  return Math.round(((2 * hits) / (bigrams(x).length + bigrams(y).length)) * 100);
}

export interface TemplateSuggestion {
  readonly templateId: string;
  readonly score: number;
}

export function suggestTemplates(
  pdfName: string,
  templates: readonly MatchableTemplate[],
  keyField: string,
  limit = 5
): TemplateSuggestion[] {
  return templates
    .map((template, index) => ({
      templateId: template.id,
      score: nameSimilarity(pdfName, keyOf(template, keyField) || template.keys[FILE_KEY] || ''),
      index,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ templateId, score }) => ({ templateId, score }));
}

export interface KeyFieldOption {
  readonly field: string;
  readonly count: number;
}

/** Fields that hold a text in at least one template, likely candidates first. */
export function availableKeyFields(templates: readonly MatchableTemplate[]): KeyFieldOption[] {
  const counts = new Map<string, number>();
  for (const template of templates) {
    for (const [field, value] of Object.entries(template.keys)) {
      if (value.trim()) counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }
  const rank = (field: string) => {
    if (field === FILE_KEY) return 1000;
    const at = (KEY_FIELD_CANDIDATES as readonly string[]).indexOf(field);
    return at === -1 ? 100 : at;
  };
  return [...counts.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => rank(a.field) - rank(b.field) || b.count - a.count);
}

/** The field to match on: the preferred candidate present in most templates. */
export function detectKeyField(templates: readonly MatchableTemplate[]): string {
  const options = availableKeyFields(templates).filter(
    (option) => (KEY_FIELD_CANDIDATES as readonly string[]).includes(option.field) || option.field === FILE_KEY
  );
  if (!options.length) return DEFAULT_KEY_FIELD;
  const best = Math.max(...options.map((option) => option.count));
  return (options.find((option) => option.count === best) ?? options[0]).field;
}
