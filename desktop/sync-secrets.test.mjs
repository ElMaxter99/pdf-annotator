import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createSecretStore } from './sync-secrets.mjs';

const fakeSafe = (backend = 'gnome_libsecret') => ({
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => backend,
  encryptString: (text) => Buffer.from(`ENC:${Buffer.from(text).toString('base64')}`),
  decryptString: (buf) => Buffer.from(buf.toString().slice(4), 'base64').toString(),
});

test('con almacén seguro: se guarda cifrado y se recupera', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sec-'));
  try {
    const file = path.join(dir, 's.bin');
    const store = createSecretStore({ safeStorage: fakeSafe(), file, platform: 'linux' });
    assert.equal(store.save({ password: 'secreto' }), true);
    assert.ok(!readFileSync(file).toString().includes('secreto'));
    const again = createSecretStore({ safeStorage: fakeSafe(), file, platform: 'linux' });
    assert.equal(again.saved(), true);
    assert.deepEqual(again.load(), { password: 'secreto' });
    again.clear();
    assert.equal(again.saved(), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin almacén seguro (Linux basic_text): no se escribe nada, solo memoria de la sesión', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sec-'));
  try {
    const file = path.join(dir, 's.bin');
    const store = createSecretStore({
      safeStorage: fakeSafe('basic_text'),
      file,
      platform: 'linux',
    });
    assert.equal(store.available(), false);
    assert.equal(store.save({ password: 'x' }), false);
    assert.equal(store.saved(), false);
    assert.deepEqual(store.load(), { password: 'x' });
    assert.throws(() => readFileSync(file));
    const next = createSecretStore({
      safeStorage: fakeSafe('basic_text'),
      file,
      platform: 'linux',
    });
    assert.equal(next.load(), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
