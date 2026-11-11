import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PROVIDERS, buildSpawn, findExecutable, quote, runCli } from './providers.mjs';

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
