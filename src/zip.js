// Minimal read-only ZIP parser. Supports stored (0) and deflate (8) entries.
// Used on archives we fetched ourselves (GitHub codeload, ClawHub downloads).
// Hard caps protect against zip bombs: entry count and total decoded bytes.

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  // Node fallback (local tests / seed tooling)
  const { inflateRawSync } = await import('node:zlib');
  return new Uint8Array(inflateRawSync(bytes));
}

function findEocd(view) {
  // End Of Central Directory record: search last 64KB for signature 0x06054b50
  const len = view.byteLength;
  const start = Math.max(0, len - 65557);
  for (let i = len - 22; i >= start; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

// Returns [{ path, data:Uint8Array }] for file entries within caps.
// Throws Error with a plain message on malformed or oversized archives.
export async function unzip(bytes, { maxEntries = 2000, maxTotalBytes = 32 * 1024 * 1024 } = {}) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('not a zip archive');
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  if (count > maxEntries) throw new Error('archive has too many entries');
  const out = [];
  let total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  for (let n = 0; n < count; n++) {
    if (view.getUint32(off, true) !== 0x02014b50) break; // central dir signature
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    // Local header: skip to data
    const lNameLen = view.getUint16(localOff + 26, true);
    const lExtraLen = view.getUint16(localOff + 28, true);
    const dataOff = localOff + 30 + lNameLen + lExtraLen;
    const comp = bytes.subarray(dataOff, dataOff + compSize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = await inflateRaw(comp);
    else continue; // unsupported method: skip
    total += data.byteLength;
    if (total > maxTotalBytes) throw new Error('archive expands beyond size cap');
    out.push({ path: name, data });
  }
  return out;
}

export async function sha256Hex(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
