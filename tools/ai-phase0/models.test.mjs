import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAcpModels, parseClaudeModels } from '../ai-helper/models.mjs';

test('Claude: omite «default», usa el nombre visible y descarta ids raros', () => {
  const r = parseClaudeModels([
    { value: 'default', displayName: 'Default', description: 'x' },
    { value: 'sonnet', displayName: 'Sonnet 5.5', description: 'Eficiente' },
    { value: 'sonnet', displayName: 'Repetido' },
    { value: 'a b; rm', displayName: 'Malo' },
    { value: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5' },
  ]);
  assert.deepEqual(r.map((m) => m.id), ['sonnet', 'claude-haiku-4-5-20251001']);
  assert.equal(r[0].name, 'Sonnet 5.5');
});

test('Claude: entrada que no es lista', () => {
  assert.deepEqual(parseClaudeModels(undefined), []);
  assert.deepEqual(parseClaudeModels('x'), []);
});

test('ACP: agrupa por proveedor y quita «auto»', () => {
  const r = parseAcpModels({ currentModelId: 'gpt-6.1-sol', availableModels: [{ modelId: 'auto', name: 'Auto' }, { modelId: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5' }, { modelId: 'gpt-6.1-sol' }, { modelId: 'gemini-3.8-flash' }, { modelId: 'otro' }] });
  assert.deepEqual(r.map((m) => [m.id, m.group]), [['claude-sonnet-5.5', 'Anthropic'], ['gpt-6.1-sol', 'OpenAI'], ['gemini-3.8-flash', 'Google'], ['otro', '']]);
  assert.equal(r[1].name, 'gpt-6.1-sol');
});

test('ACP: sin models', () => {
  assert.deepEqual(parseAcpModels({}), []);
  assert.deepEqual(parseAcpModels(null), []);
});
