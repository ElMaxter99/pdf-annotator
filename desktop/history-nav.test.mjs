import test from 'node:test';
import assert from 'node:assert/strict';
import { goInHistory, historyDirectionForCommand, historyDirectionForKey } from './history-nav.mjs';

const key = (k, mods = {}) => ({ type: 'keyDown', key: k, alt: false, meta: false, control: false, shift: false, ...mods });

test('Windows y Linux: Alt+← atrás y Alt+→ adelante', () => {
  for (const platform of ['win32', 'linux']) {
    assert.equal(historyDirectionForKey(key('ArrowLeft', { alt: true }), platform), -1);
    assert.equal(historyDirectionForKey(key('ArrowRight', { alt: true }), platform), 1);
    assert.equal(historyDirectionForKey(key('ArrowLeft'), platform), 0);
    assert.equal(historyDirectionForKey(key('ArrowLeft', { alt: true, shift: true }), platform), 0);
    assert.equal(historyDirectionForKey(key('ArrowLeft', { alt: true, control: true }), platform), 0);
  }
});

test('macOS: ⌘[ y ⌘]; ⌘← y ⌘→ se dejan para los textos', () => {
  assert.equal(historyDirectionForKey(key('[', { meta: true }), 'darwin'), -1);
  assert.equal(historyDirectionForKey(key(']', { meta: true }), 'darwin'), 1);
  assert.equal(historyDirectionForKey(key('ArrowLeft', { meta: true }), 'darwin'), 0);
  assert.equal(historyDirectionForKey(key('ArrowLeft', { alt: true }), 'darwin'), 0);
});

test('teclas multimedia y eventos que no son keyDown', () => {
  assert.equal(historyDirectionForKey(key('BrowserBack'), 'linux'), -1);
  assert.equal(historyDirectionForKey(key('BrowserForward'), 'darwin'), 1);
  assert.equal(historyDirectionForKey({ ...key('ArrowLeft', { alt: true }), type: 'keyUp' }, 'win32'), 0);
  assert.equal(historyDirectionForKey(null, 'win32'), 0);
});

test('botones del ratón y gesto de deslizar', () => {
  assert.equal(historyDirectionForCommand('browser-backward'), -1);
  assert.equal(historyDirectionForCommand('browser-forward'), 1);
  assert.equal(historyDirectionForCommand('left'), -1);
  assert.equal(historyDirectionForCommand('right'), 1);
  assert.equal(historyDirectionForCommand('up'), 0);
});

test('goInHistory solo se mueve si hay a dónde ir', () => {
  const calls = [];
  const history = (back, forward) => ({
    canGoBack: () => back,
    canGoForward: () => forward,
    goBack: () => calls.push('back'),
    goForward: () => calls.push('forward'),
  });
  assert.equal(goInHistory(history(true, false), -1), true);
  assert.equal(goInHistory(history(false, false), -1), false);
  assert.equal(goInHistory(history(false, true), 1), true);
  assert.equal(goInHistory(history(true, true), 0), false);
  assert.deepEqual(calls, ['back', 'forward']);
});
