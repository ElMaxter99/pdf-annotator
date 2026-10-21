/**
 * Safe, non-evaluating parser for "loose" JSON (the kind people paste from JS code):
 * single-quoted strings, backtick strings, unquoted keys, trailing commas, comments
 * and raw line breaks inside strings. It never executes input.
 */
const MAX_DEPTH = 64;

/** Syntax error with a 1-based position inside the parsed text. */
export class LooseJsonError extends SyntaxError {
  constructor(
    message: string,
    readonly position: number,
    readonly line: number,
    readonly column: number
  ) {
    super(message);
    this.name = 'LooseJsonError';
  }
}

function locate(text: string, position: number): { line: number; column: number } {
  const clamped = Math.min(Math.max(position, 0), text.length);
  const before = text.slice(0, clamped);
  const line = before.split('\n').length;
  const column = clamped - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

class LooseJsonParser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): unknown {
    const value = this.parseValue(0);
    this.skipTrivia();
    if (this.pos < this.src.length) {
      this.fail();
    }
    return value;
  }

  private fail(): never {
    const { line, column } = locate(this.src, this.pos);
    throw new LooseJsonError(`Unexpected token at position ${this.pos}`, this.pos, line, column);
  }

  private skipTrivia() {
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '﻿') {
        this.pos += 1;
      } else if (c === '/' && s[this.pos + 1] === '/') {
        while (this.pos < s.length && s[this.pos] !== '\n') this.pos += 1;
      } else if (c === '/' && s[this.pos + 1] === '*') {
        const end = s.indexOf('*/', this.pos + 2);
        if (end === -1) this.fail();
        this.pos = end + 2;
      } else {
        break;
      }
    }
  }

  private parseValue(depth: number): unknown {
    if (depth > MAX_DEPTH) this.fail();
    this.skipTrivia();
    const c = this.src[this.pos];
    if (c === '{') return this.parseObject(depth);
    if (c === '[') return this.parseArray(depth);
    if (c === '"' || c === "'" || c === '`') return this.parseString(c);
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return this.parseNumber();
    return this.parseKeyword();
  }

  private parseObject(depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null);
    this.pos += 1;
    for (;;) {
      this.skipTrivia();
      if (this.src[this.pos] === '}') {
        this.pos += 1;
        return { ...result };
      }
      const key = this.parseKey();
      this.skipTrivia();
      if (this.src[this.pos] !== ':') this.fail();
      this.pos += 1;
      const value = this.parseValue(depth + 1);
      if (key !== '__proto__') {
        result[key] = value;
      }
      this.skipTrivia();
      const next = this.src[this.pos];
      if (next === ',') {
        this.pos += 1;
      } else if (next !== '}') {
        this.fail();
      }
    }
  }

  private parseArray(depth: number): unknown[] {
    const result: unknown[] = [];
    this.pos += 1;
    for (;;) {
      this.skipTrivia();
      if (this.src[this.pos] === ']') {
        this.pos += 1;
        return result;
      }
      result.push(this.parseValue(depth + 1));
      this.skipTrivia();
      const next = this.src[this.pos];
      if (next === ',') {
        this.pos += 1;
      } else if (next !== ']') {
        this.fail();
      }
    }
  }

  private parseKey(): string {
    const c = this.src[this.pos];
    if (c === '"' || c === "'" || c === '`') return this.parseString(c);
    const match = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.pos));
    if (!match) this.fail();
    this.pos += match[0].length;
    return match[0];
  }

  private parseString(quote: string): string {
    const s = this.src;
    let out = '';
    this.pos += 1;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (c === quote) {
        this.pos += 1;
        return out;
      }
      if (c === '\\') {
        out += this.parseEscape();
        continue;
      }
      if (c === '\r') {
        this.pos += 1;
        continue;
      }
      out += c;
      this.pos += 1;
    }
    return this.fail();
  }

  private parseEscape(): string {
    const s = this.src;
    const code = s[this.pos + 1];
    this.pos += 2;
    switch (code) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case 'b': return '\b';
      case 'f': return '\f';
      case '\n': return '';
      case 'u': {
        const hex = s.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail();
        this.pos += 4;
        return String.fromCharCode(parseInt(hex, 16));
      }
      case undefined:
        return this.fail();
      default:
        return code;
    }
  }

  private parseNumber(): number {
    const match = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(this.src.slice(this.pos));
    if (!match) this.fail();
    this.pos += match[0].length;
    return Number(match[0]);
  }

  private parseKeyword(): unknown {
    const match = /^[A-Za-z]+/.exec(this.src.slice(this.pos));
    if (!match) this.fail();
    this.pos += match[0].length;
    switch (match[0]) {
      case 'true': return true;
      case 'false': return false;
      case 'null': return null;
      default: return this.fail();
    }
  }
}

export function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return new LooseJsonParser(text).parse();
  }
}
