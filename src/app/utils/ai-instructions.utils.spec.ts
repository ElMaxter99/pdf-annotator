import { AI_INSTRUCTIONS_MAX, cleanAiInstructions, effectiveAiInstructions } from './ai-instructions.utils';

describe('ai-instructions.utils', () => {
  it('keeps plain text only: no control characters, normalised breaks, trimmed and capped', () => {
    expect(cleanAiInstructions(undefined)).toBe('');
    expect(cleanAiInstructions(42)).toBe('');
    expect(cleanAiInstructions({ text: 'x' })).toBe('');
    expect(cleanAiInstructions('   \n\t ')).toBe('');
    expect(cleanAiInstructions('a\r\nb\rc\td')).toBe('a\nb\nc d');
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    const rlo = String.fromCharCode(0x202e);
    const zwsp = String.fromCharCode(0x200b);
    expect(cleanAiInstructions(`x${nul}y${bell}z${rlo}!${zwsp}`)).toBe('xyz!');
    expect(cleanAiInstructions('uno\n\n\n\ndos   \ntres')).toBe('uno\n\ndos\ntres');
    expect(cleanAiInstructions('ñ'.repeat(800)).length).toBe(AI_INSTRUCTIONS_MAX);
  });

  it('a PDF uses its own instructions (even empty) and otherwise the batch ones', () => {
    expect(effectiveAiInstructions(null, ' Lote ')).toBe('Lote');
    expect(effectiveAiInstructions({}, 'Lote')).toBe('Lote');
    expect(effectiveAiInstructions({ aiInstructions: 'Solo este' }, 'Lote')).toBe('Solo este');
    expect(effectiveAiInstructions({ aiInstructions: '' }, 'Lote')).toBe('');
    expect(effectiveAiInstructions({ aiInstructions: undefined }, '')).toBe('');
  });
});
