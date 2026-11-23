import { parseLooseJson } from './loose-json';

export type CopyKeys = 'quoted' | 'bare';
export type CopyQuote = 'double' | 'single';
export type CopyIndent = '2' | '4' | 'tab' | '0';

/** Cómo se escribe el JSON al copiarlo (el editor y la descarga no cambian). */
export interface JsonCopyFormat {
  keys: CopyKeys;
  quote: CopyQuote;
  indent: CopyIndent;
  trailingComma: boolean;
}

export const JSON_COPY_KEY = 'pdf-annotator.jsonCopyFormat';

export const JSON_COPY_STRICT: JsonCopyFormat = {
  keys: 'quoted',
  quote: 'double',
  indent: '2',
  trailingComma: false,
};

export const JSON_COPY_JS: JsonCopyFormat = {
  keys: 'bare',
  quote: 'single',
  indent: '2',
  trailingComma: true,
};

export type JsonCopyPreset = 'json' | 'js' | 'custom';

export function jsonCopyPreset(format: JsonCopyFormat): JsonCopyPreset {
  if (sameFormat(format, JSON_COPY_STRICT)) return 'json';
  if (sameFormat(format, JSON_COPY_JS)) return 'js';
  return 'custom';
}

/** ¿El resultado sigue siendo JSON válido? (la coma final no importa en modo compacto) */
export function isStrictJsonFormat(format: JsonCopyFormat): boolean {
  return (
    format.keys === 'quoted' &&
    format.quote === 'double' &&
    (!format.trailingComma || format.indent === '0')
  );
}

function sameFormat(a: JsonCopyFormat, b: JsonCopyFormat): boolean {
  return (
    a.keys === b.keys &&
    a.quote === b.quote &&
    a.indent === b.indent &&
    a.trailingComma === b.trailingComma
  );
}

/** Lee el formato guardado como dato no confiable: lo raro vuelve al valor por defecto. */
export function normalizeJsonCopyFormat(raw: unknown): JsonCopyFormat {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    keys: source['keys'] === 'bare' ? 'bare' : 'quoted',
    quote: source['quote'] === 'single' ? 'single' : 'double',
    indent:
      source['indent'] === '4' || source['indent'] === 'tab' || source['indent'] === '0'
        ? source['indent']
        : '2',
    trailingComma: source['trailingComma'] === true,
  };
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function quoteString(value: string, quote: CopyQuote): string {
  if (quote === 'double') return JSON.stringify(value);
  const escaped = JSON.stringify(value)
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/'/g, "\\'")
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `'${escaped}'`;
}

function write(value: unknown, format: JsonCopyFormat, level: number): string {
  const compact = format.indent === '0';
  const unit = format.indent === 'tab' ? '\t' : compact ? '' : ' '.repeat(Number(format.indent));
  const newline = compact ? '' : '\n';
  const inner = unit.repeat(level + 1);
  const outer = unit.repeat(level);
  const tail = format.trailingComma && !compact ? ',' : '';

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map((item) => inner + write(item, format, level + 1));
    return `[${newline}${items.join(',' + newline)}${tail}${newline}${outer}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return '{}';
    const separator = compact ? ':' : ': ';
    const lines = entries.map(([key, item]) => {
      // En un objeto de JS, `__proto__: x` cambia el prototipo en vez de crear la propiedad: va calculada.
      const name =
        key === '__proto__' && !isStrictJsonFormat(format)
          ? `[${quoteString(key, format.quote)}]`
          : format.keys === 'bare' && IDENTIFIER.test(key)
            ? key
            : quoteString(key, format.quote);
      return inner + name + separator + write(item, format, level + 1);
    });
    return `{${newline}${lines.join(',' + newline)}${tail}${newline}${outer}}`;
  }
  if (typeof value === 'string') return quoteString(value, format.quote);
  return JSON.stringify(value) ?? 'null';
}

/**
 * Reescribe el texto del editor con el formato pedido. Si el texto no se puede leer (por ejemplo a mitad
 * de escribir) devuelve `null` y quien llama copia el texto tal cual.
 */
export function formatJsonForCopy(text: string, format: JsonCopyFormat): string | null {
  let value: unknown;
  try {
    value = parseLooseJson(text);
  } catch {
    return null;
  }
  return write(value, format, 0);
}
