// Credenciales del servidor SFTP (fase 3b, mesa P-91): se guardan solo en el almacén seguro del sistema
// (Keychain, DPAPI, libsecret) mediante `safeStorage` de Electron. Sin almacén seguro no se guarda nada:
// la contraseña se pide en cada sesión y vive solo en memoria. Nunca se escribe en texto plano.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

/** `safeStorage` de Electron, o uno de pruebas con la misma forma. */
export function createSecretStore({ safeStorage, file, platform = process.platform }) {
  let session = null;
  const available = () => {
    try {
      if (!safeStorage?.isEncryptionAvailable?.()) return false;
      // En Linux sin llavero Electron cifra con una clave fija: eso no protege nada, se trata como no disponible.
      if (platform === 'linux') {
        const backend = safeStorage.getSelectedStorageBackend?.();
        if (!backend || backend === 'basic_text' || backend === 'unknown') return false;
      }
      return true;
    } catch {
      return false;
    }
  };
  return {
    available,
    /** Guarda en el almacén seguro; devuelve false si no hay (queda solo en memoria durante la sesión). */
    save(secret) {
      session = { ...secret };
      if (!available()) return false;
      try {
        writeFileSync(file, safeStorage.encryptString(JSON.stringify(secret)), { mode: 0o600 });
        return true;
      } catch {
        return false;
      }
    },
    /** Lo de la sesión si lo hay; si no, lo guardado (descifrado en este proceso, nunca se envía a la web). */
    load() {
      if (session) return session;
      if (!available()) return null;
      try {
        const parsed = JSON.parse(safeStorage.decryptString(readFileSync(file)));
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        /* no hay o no se puede leer */
      }
      return null;
    },
    /** ¿Hay una credencial guardada (en el almacén seguro)? */
    saved() {
      if (!available()) return false;
      try {
        readFileSync(file);
        return true;
      } catch {
        return false;
      }
    },
    hasSession() {
      return session !== null;
    },
    remember(secret) {
      session = { ...secret };
    },
    clear() {
      session = null;
      rmSync(file, { force: true });
    },
  };
}
