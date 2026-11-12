import {
  AiRow,
  confidenceLevel,
  isRowSelected,
  parseNdjson,
  sanitizeRow,
  sortAiRows,
  summarizeAi,
} from './ai-proposal.utils';

const row = (over: Partial<AiRow> = {}): AiRow => ({
  id: 'p1-f1',
  page: 1,
  index: 0,
  ok: true,
  newPage: 1,
  x: 10,
  y: 20,
  confidence: 0.9,
  reason: '',
  anchorA: 'A',
  anchorB: 'A',
  ...over,
});

describe('ai-proposal.utils', () => {
  it('parses complete lines and keeps the incomplete tail', () => {
    const out = parseNdjson('{"stage":"reading"}\n{"stage":"asking","n":1}\n{"resu');
    expect(out.messages).toEqual([{ stage: 'reading' }, { stage: 'asking' }]);
    expect(out.rest).toBe('{"resu');
  });

  it('ignores garbage lines and keeps errors', () => {
    const out = parseNdjson('nope\n{"error":{"code":"limit","message":"x","reset":"18:40"}}\n');
    expect(out.messages).toEqual([{ error: { code: 'limit', message: 'x', reset: '18:40' } }]);
  });

  it('sanitizes the result rows', () => {
    const out = parseNdjson(
      JSON.stringify({
        result: {
          rows: [
            { id: 'p1-f1', page: 1, index: 0, ok: true, newPage: 2, x: 5, y: 6, confidence: 7 },
            { id: 'p1-f2', page: 1, index: 1, ok: true, x: 'a', y: 1 },
            { page: 1 },
          ],
          seconds: 3,
          warnings: ['w'],
        },
      }) + '\n',
    );
    const result = (out.messages[0] as { result: { rows: AiRow[]; warnings: number } }).result;
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].confidence).toBe(1);
    expect(result.rows[0].newPage).toBe(2);
    expect(result.rows[1].ok).toBeFalse();
    expect(result.warnings).toBe(1);
  });

  it('rejects rows without id or page', () => {
    expect(sanitizeRow(null)).toBeNull();
    expect(sanitizeRow({ id: 'x', page: 0, index: 0 })).toBeNull();
  });

  it('levels confidence', () => {
    expect(confidenceLevel(0.9)).toBe('high');
    expect(confidenceLevel(0.6)).toBe('medium');
    expect(confidenceLevel(0.2)).toBe('low');
  });

  it('applies by default only confident, found rows; the person can override', () => {
    const low = row({ id: 'a', confidence: 0.2 });
    const gone = row({ id: 'b', ok: false });
    const fine = row({ id: 'c' });
    expect(isRowSelected(low, new Map())).toBeFalse();
    expect(isRowSelected(low, new Map([['a', true]]))).toBeTrue();
    expect(isRowSelected(gone, new Map([['b', true]]))).toBeFalse();
    expect(isRowSelected(fine, new Map([['c', false]]))).toBeFalse();
    const s = summarizeAi([low, gone, fine, row({ id: 'd', newPage: 2 })], new Map());
    expect(s).toEqual({ total: 4, placed: 3, changePage: 1, notFound: 1, selected: 2 });
  });

  it('lists what needs review first', () => {
    const sorted = sortAiRows([row({ id: 'a' }), row({ id: 'b', ok: false, index: 1 })]);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a']);
  });
});
