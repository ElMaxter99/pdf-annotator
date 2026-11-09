/** Hex SHA-256 of a file's bytes; the same content always gives the same fingerprint. */
export async function hashBlob(blob: Blob): Promise<string> {
  const bytes = await blob.arrayBuffer();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Insecure contexts have no SubtleCrypto: fall back to a 64-bit FNV-1a over every byte.
  let hash = 0xcbf29ce484222325n;
  for (const byte of new Uint8Array(bytes)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `fnv-${hash.toString(16)}-${blob.size}`;
}
