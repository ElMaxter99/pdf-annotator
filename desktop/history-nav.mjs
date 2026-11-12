// Atrás / Adelante en la app de escritorio: Electron no trae los atajos del navegador.
// Lógica pura (sin Electron) para poder probarla con `node --test`.

/**
 * Dirección del historial para una tecla (`before-input-event`): -1 atrás, 1 adelante, 0 nada.
 * Windows y Linux: Alt+← / Alt+→. macOS: ⌘[ / ⌘] (⌘← / ⌘→ se dejan para mover el cursor en los textos).
 */
export function historyDirectionForKey(input, platform) {
  if (!input || input.type !== 'keyDown') return 0;
  const { key, alt, meta, control, shift } = input;
  if (key === 'BrowserBack') return -1;
  if (key === 'BrowserForward') return 1;
  if (shift || control) return 0;
  if (platform === 'darwin') {
    if (!meta || alt) return 0;
    return key === '[' ? -1 : key === ']' ? 1 : 0;
  }
  if (!alt || meta) return 0;
  return key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
}

/** Botones laterales del ratón (`app-command`, Windows y Linux) y gesto de deslizar (macOS). */
export function historyDirectionForCommand(command) {
  if (command === 'browser-backward' || command === 'left') return -1;
  if (command === 'browser-forward' || command === 'right') return 1;
  return 0;
}

/** Va atrás o adelante si se puede; devuelve si se movió. */
export function goInHistory(history, direction) {
  if (direction < 0 && history.canGoBack()) {
    history.goBack();
    return true;
  }
  if (direction > 0 && history.canGoForward()) {
    history.goForward();
    return true;
  }
  return false;
}
