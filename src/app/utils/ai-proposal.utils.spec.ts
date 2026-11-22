import {
  AiRow,
  sanitizeDetails,
  proposalGroup,
  confidenceLevel,
  estimateTokens,
  sumUsage,
  isRowSelected,
  parseNdjson,
  sanitizeRow,
  sortAiRows,
  summarizeAi,
  isAbsentInB,
  countPlacement
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
  why: '',
  source: 'ai',
  ...over,
});

describe('ai-proposal.utils', () => {
  it('parses complete lines and keeps the incomplete tail', () => {
    const out = parseNdjson('{"stage":"reading"}\n{"stage":"asking","n":1}\n{"resu');
    expect(out.messages).toEqual([{ stage: 'reading' }, { stage: 'asking', n: 1 }]);
    expect(out.rest).toBe('{"resu');
  });

  it('ignores garbage lines and keeps errors', () => {
    const out = parseNdjson('nope\n{"error":{"code":"limit","message":"x","reset":"18:40"}}\n');
    expect(out.messages).toEqual([{ error: { code: 'limit', message: 'x', reset: '18:40', details: null } }]);
  });

  it('keeps the attempts of a failed run so the modal can still show the usage', () => {
    const line = JSON.stringify({
      error: { code: 'images_not_read', message: 'x', details: { provider: 'claude', attempts: [{ n: 1, usage: { input: 6, output: 900, cacheRead: 10, cacheWrite: 2 } }] } },
    });
    const out = parseNdjson(line + '\n');
    const error = (out.messages[0] as { error: { details: { attempts: Array<{ usage: { output: number } | null }> } | null } }).error;
    expect(error.details?.attempts[0].usage?.output).toBe(900);
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

  it('reads live events and details from the helper and ignores bad data', () => {
    const lines = [
      JSON.stringify({ event: { type: 'step', attempt: 1, steps: [{ kind: 'read', file: 'A-p1.png', tool: 'Read' }, { kind: 'x' }], usage: { input: 3, output: 5, cacheRead: 7, cacheWrite: 1 } } }),
      JSON.stringify({ event: { type: 'nope' } }),
      JSON.stringify({ result: { rows: [], seconds: 1, warnings: [], details: { usageSource: 'measured', diagnosis: 'no_text_a', placed: 0, attempts: [{ n: 1, usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, costUsd: 0.01, aiCredits: 6.76, premiumRequests: 1 }] } } }),
      '',
    ].join('\n');
    const { messages } = parseNdjson(lines);
    expect(messages.length).toBe(2);
    const ev = messages[0] as { event: { steps: unknown[]; usage: { cacheRead: number } } };
    expect(ev.event.steps.length).toBe(1);
    expect(ev.event.usage.cacheRead).toBe(7);
    const res = messages[1] as { result: { details: { diagnosis: string; usageSource: string } } };
    expect(res.result.details.diagnosis).toBe('no_text_a');
    expect(res.result.details.usageSource).toBe('measured');
    expect((res.result.details as unknown as { attempts: { aiCredits: number }[] }).attempts[0].aiCredits).toBe(6.76);
  });

  it('keeps the «cap_reached» diagnosis and up to 8 calls of the split engine', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({ n: i + 1 }));
    const line = JSON.stringify({ result: { rows: [], seconds: 1, warnings: [], details: { usageSource: 'measured', diagnosis: 'cap_reached', placed: 3, attempts } } });
    const res = parseNdjson(line + '\n').messages[0] as { result: { details: { diagnosis: string; attempts: unknown[] } } };
    expect(res.result.details.diagnosis).toBe('cap_reached');
    expect(res.result.details.attempts.length).toBe(8);
  });

  it('reads why and source of each row and counts what does not exist in B apart', () => {
    const base = { id: 'p1-f1', page: 1, index: 0, x: 10, y: 20, confidence: 0.8, reason: '', anchorA: '', anchorB: '' };
    const placedByText = sanitizeRow({ ...base, ok: true, source: 'text' })!;
    const absent = sanitizeRow({ ...base, id: 'p1-f2', index: 1, ok: false, why: 'no_existe_en_b' })!;
    const missing = sanitizeRow({ ...base, id: 'p1-f3', index: 2, ok: false, why: 'ancla_B_no_encontrada' })!;
    const junk = sanitizeRow({ ...base, id: 'p1-f4', index: 3, ok: false, why: '<script>', source: 'otra' })!;
    expect(placedByText.source).toBe('text');
    expect(junk.why).toBe('');
    expect(junk.source).toBe('ai');
    expect(isAbsentInB(absent)).toBeTrue();
    expect(isAbsentInB(missing)).toBeFalse();
    expect(countPlacement([placedByText, absent, missing, junk])).toEqual({ placed: 1, absent: 1, missing: 2, total: 4, withoutAi: 1 });
  });

  it('sums usage and estimates tokens only from sizes', () => {
    expect(sumUsage([null, null])).toBeNull();
    expect(sumUsage([{ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 }, null, { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }])).toEqual({ input: 2, output: 3, cacheRead: 4, cacheWrite: 5 });
    const sent = { files: [{ name: 'A-p1.png', bytes: 9000 }, { name: 'fields.json', bytes: 8000 }, { name: 'A.pdf', bytes: 5 }], fields: 1, pagesA: 1, pagesB: 1, textsA: 1, textsB: 1, imageBytes: 9000 };
    expect(estimateTokens(sent)).toBe(3600);
    expect(estimateTokens(null)).toBe(0);
  });
});

describe('sanitizeDetails · motivo del parcial y reparto de páginas', () => {
  it('acepta solo los motivos conocidos y planes con nombres de página válidos', () => {
    const d = sanitizeDetails({
      aborted: 'images_not_read',
      requests: 4,
      plan: [
        { group: 'A-p1', candidatesB: ['B-p3', 'B-p4', '<script>'], fields: 7 },
        { group: 'malo', candidatesB: ['B-p1'], fields: 1 },
      ],
    });
    expect(d?.aborted).toBe('images_not_read');
    expect(d?.requests).toBe(4);
    expect(d?.plan).toEqual([{ group: 'A-p1', candidatesB: ['B-p3', 'B-p4'], fields: 7 }]);
    expect(sanitizeDetails({ aborted: 'rm -rf' })?.aborted).toBeNull();
  });
});

describe('proposalGroup · grupos claros de la propuesta', () => {
  const base = { id: 'p1-f1', page: 1, index: 0, ok: true, newPage: 1, x: 1, y: 1, confidence: 0.9, reason: '', anchorA: '', anchorB: '', why: '', source: 'ai' } as AiRow;
  it('separa seguros, a revisar, nuevos en B, sin colocar y que ya no existen', () => {
    expect(proposalGroup(base)).toBe('ready');
    expect(proposalGroup({ ...base, confidence: 0.6 })).toBe('review');
    expect(proposalGroup({ ...base, id: 'pattern-1-p12', source: 'pattern' })).toBe('newInB');
    expect(proposalGroup({ ...base, ok: false, why: 'sin_respuesta' })).toBe('notFound');
    expect(proposalGroup({ ...base, ok: false, why: 'no_existe_en_b' })).toBe('absent');
  });
});

describe('sanitizeRow · «igual que en A»', () => {
  it('conserva la marca solo si es exactamente true', () => {
    const raw = { id: 'p1-f1', page: 1, index: 0, ok: true, newPage: 2, x: 10, y: 20, confidence: 0.6, reason: 'misma zona', anchorA: '', anchorB: '' };
    expect(sanitizeRow({ ...raw, sameAsA: true })?.sameAsA).toBeTrue();
    expect(sanitizeRow({ ...raw, sameAsA: 'yes' })?.sameAsA).toBeUndefined();
    expect(proposalGroup(sanitizeRow({ ...raw, sameAsA: true })!)).toBe('review'); // nunca «seguro»
  });
});
