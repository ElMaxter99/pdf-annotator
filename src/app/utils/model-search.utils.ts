export interface TextSegment {
  text: string;
  hit: boolean;
}

/** Lower-cases and strips accents one character at a time, so indices stay aligned with the original. */
export function foldChars(text: string): string {
  let out = '';
  for (const ch of text) {
    const folded = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out +=
      folded.length === ch.length
        ? folded
        : ch.toLowerCase().slice(0, ch.length).padEnd(ch.length, ' ');
  }
  return out;
}

export function queryWords(query: string): string[] {
  return foldChars(query).split(/\s+/).filter(Boolean);
}

/** True when every word of the query appears somewhere in the haystack (accents and case ignored). */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = queryWords(query);
  if (words.length === 0) {
    return true;
  }
  const folded = foldChars(haystack);
  return words.every((w) => folded.includes(w));
}

/** Splits `text` into runs, marking the parts that match any word of the query. */
export function highlight(text: string, query: string): TextSegment[] {
  const words = queryWords(query);
  if (!text || words.length === 0) {
    return text ? [{ text, hit: false }] : [];
  }
  const folded = foldChars(text);
  const hit = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    for (let i = folded.indexOf(w); i !== -1; i = folded.indexOf(w, i + 1)) {
      hit.fill(true, i, i + w.length);
    }
  }
  const out: TextSegment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || hit[i] !== hit[start]) {
      out.push({ text: text.slice(start, i), hit: hit[start] });
      start = i;
    }
  }
  return out;
}
