import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PROVIDERS, buildSpawn, detectLimit, findExecutable, quote, runCli } from './providers.mjs';

test('quote entrecomilla solo lo necesario', () => {
  assert.equal(quote('-p'), '-p');
  assert.equal(quote('con espacios'), '"con espacios"');
  assert.equal(quote('a"b'), '"a\\"b"');
});

test('buildSpawn lanza directamente un ejecutable normal, sin shell', () => {
  const sp = buildSpawn('/usr/bin/claude', ['-p', 'hola mundo']);
  assert.deepEqual(sp, { file: '/usr/bin/claude', args: ['-p', 'hola mundo'], options: {} });
});

test('findExecutable devuelve null si no existe', () => {
  assert.equal(findExecutable('no-existe-este-cli-xyz'), null);
});

test('runCli avisa con claridad si el CLI no existe', async () => {
  PROVIDERS.fake = { label: 'fake', cmd: 'no-existe-este-cli-xyz', args: () => [], env: (b) => b };
  const r = await runCli('fake', os.tmpdir());
  assert.equal(r.ok, false);
  assert.match(r.stderr, /No encuentro/);
});

test('runCli corta con un mensaje claro si el CLI no responde', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fakecli-'));
  const exe = path.join(dir, 'lentocli');
  await writeFile(exe, '#!/bin/sh\nsleep 30\n');
  await chmod(exe, 0o755);
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  PROVIDERS.slow = { label: 'slow', cmd: 'lentocli', args: () => [], env: (b) => b };
  const r = await runCli('slow', dir, { timeoutMs: 300 });
  assert.equal(r.ok, false);
  assert.equal(r.code, -2);
  assert.match(r.stderr, /Tiempo agotado/);
});

test('detectLimit reconoce el límite de la suscripción y la hora de reinicio', () => {
  const out = '{"is_error":true,"api_error_status":429,"api_error":"usage_limit_reached","result":"You\'ve hit your 5-hour limit · resets 2:30am (Europe/Madrid)","type":"result"}';
  const msg = detectLimit(out);
  assert.match(msg, /límite de 5 horas/);
  assert.match(msg, /2:30am \(Europe\/Madrid\)/);
  assert.equal(detectLimit('{"is_error":true,"result":"Not logged in"}'), null);
  assert.match(detectLimit(out.slice(40) /* JSON roto, como un stdout cortado */), /límite/);
});

test('finalResultLine encuentra el evento final de stream-json aunque no vaya primero en la línea', async () => {
  const { finalResultLine, describeClaudeEvent } = await import('./providers.mjs');
  const out = ['{"type":"system"}', '{"total_cost_usd":0.01,"type":"result","result":"[]"}', '{"type":"system","subtype":"task_summary"}'].join('\n');
  assert.equal(JSON.parse(finalResultLine(out)).result, '[]');
  assert.equal(finalResultLine('{"result":"x"}'), '{"result":"x"}');
  const ev = describeClaudeEvent(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/x/A-p1.png' } }], usage: { input_tokens: 3, output_tokens: 9 } } }));
  assert.equal(ev.id, null);
  assert.deepEqual(ev.steps, [{ kind: 'read', file: 'A-p1.png', tool: 'Read' }]);
  assert.equal(ev.usage.output, 9);
});

test('totalUsage suma modelUsage (todos los turnos) y cae a usage si no existe', async () => {
  const { totalUsage } = await import('./providers.mjs');
  const j = { usage: { input_tokens: 2, output_tokens: 9 }, modelUsage: { a: { inputTokens: 6, outputTokens: 2000, cacheReadInputTokens: 90000, cacheCreationInputTokens: 30000 } } };
  assert.deepEqual(totalUsage(j), { input_tokens: 6, output_tokens: 2000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 30000 });
  assert.deepEqual(totalUsage({ usage: { input_tokens: 1 } }), { input_tokens: 1 });
});

test('Copilot adjunta las imágenes solo con COPILOT_ATTACH_IMAGES=1', async () => {
  const { PROVIDERS } = await import('./providers.mjs');
  const opts = { attachments: ['A-p1.png', 'B-p1.png'] };
  delete process.env.COPILOT_ATTACH_IMAGES;
  assert.ok(!PROVIDERS.copilot.args(opts).some((a) => a.startsWith('--attachment')));
  process.env.COPILOT_ATTACH_IMAGES = '1';
  assert.deepEqual(PROVIDERS.copilot.args(opts).filter((a) => a.startsWith('--attachment')), ['--attachment=A-p1.png', '--attachment=B-p1.png']);
  delete process.env.COPILOT_ATTACH_IMAGES;
});
