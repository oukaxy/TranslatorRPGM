// ===== 1. CONFIG & STRING UI =====
// Mode tes memakai DB terpisah agar data asli di origin yang sama tidak ikut terhapus.
export const DB_NAME = globalThis.__RPGTL_TEST__ ? 'rpgtl-db-test' : 'rpgtl-db';
export const PAGE_SIZE = 50;
export const LINE_WARN = 48;
export const UI = {
  noData: 'Folder data tidak ditemukan. Pilih folder data atau zip game',
  zipBad: 'Zip tidak bisa dibaca. Ekstrak dulu lalu pilih folder data',
  zipMethod: 'Metode kompresi zip tidak didukung. Ekstrak dulu lalu pilih folder',
  blocked: 'Database terkunci. Tutup tab lain lalu muat ulang',
  none: 'Belum ada proyek. Impor game di tab Proyek',
  noKey: 'API key belum diisi. Isi di Pengaturan',
  keyBad: 'API key salah. Periksa di Pengaturan',
  credit: 'Saldo atau kuota provider habis. Periksa akun provider',
  net: 'Tidak bisa terhubung ke provider. Periksa koneksi dan base URL di Pengaturan',
  badResp: 'Respons provider kosong. Coba lagi',
  badJson: 'Respons model tidak valid. Coba terjemahkan ulang',
  emptyTr: 'Terjemahan kosong. Coba terjemahkan ulang',
  tokenBad: 'Kode escape berubah. Coba terjemahkan ulang',
  tooMany: 'Tiga batch gagal berturut-turut. Periksa Pengaturan atau koneksi, lalu lanjutkan',
  exportEmpty: 'Belum ada terjemahan yang bisa diekspor. Terjemahkan dulu di tab Translate',
  urlBad: 'Base URL harus memakai https. Untuk lokal pakai localhost',
};

// ===== 2. STORAGE (wrapper IndexedDB, hash, hapus data) =====
let dbp;
/** Membuka rpgtl-db (sekali, di-cache). */
export function openDb() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      const e = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
      e.createIndex('projectId', 'projectId');
      e.createIndex('projectFile', ['projectId', 'file']);
      e.createIndex('projectStatus', ['projectId', 'status']);
      e.createIndex('hash', 'hash');
      db.createObjectStore('cache', { keyPath: 'key' });
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('origFiles', { keyPath: 'key' });
    };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; res(r.result); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error(UI.blocked));
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
export async function dbGet(store, key) { return wrap((await openDb()).transaction(store).objectStore(store).get(key)); }
export async function dbPut(store, val) { return wrap((await openDb()).transaction(store, 'readwrite').objectStore(store).put(val)); }
/** Menulis banyak nilai dalam satu transaksi. */
export async function dbPutMany(store, vals) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite'), o = t.objectStore(store);
    vals.forEach((v) => o.put(v));
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
/** Semua nilai yang key-nya diawali prefix (untuk origFiles: projectId + ':'). */
export async function dbPrefix(store, prefix) { return wrap((await openDb()).transaction(store).objectStore(store).getAll(IDBKeyRange.bound(prefix, prefix + '\uffff'))); }
export async function dbQuery(store, index, key) { return wrap((await openDb()).transaction(store).objectStore(store).index(index).getAll(key)); }
/** SHA-256 hex (butuh HTTPS atau localhost). */
export async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/** Hapus satu proyek beserta entries dan origFiles miliknya (cache dan data proyek lain tidak disentuh). */
export async function deleteProject(id) {
  const cur = await dbGet('settings', 'current'), db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(['projects', 'entries', 'origFiles', 'settings'], 'readwrite');
    t.objectStore('projects').delete(id);
    t.objectStore('origFiles').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
    if (cur?.value === id) t.objectStore('settings').delete('current');
    t.objectStore('entries').index('projectId').openCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
      const c = e.target.result; if (c) { c.delete(); c.continue(); }
    };
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
/** Reset semua data aplikasi (hanya rpgtl-db dan key rpgtl:*). */
/** @param {Function} [onBlocked] dipanggil bila tab lain masih membuka DB; penghapusan menunggu sampai tab itu ditutup. */
export async function resetAll(onBlocked) {
  if (dbp) { (await dbp).close(); dbp = null; }
  await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = res; r.onerror = () => rej(r.error); r.onblocked = () => onBlocked?.(UI.blocked); });
  Object.keys(localStorage).filter((k) => k.startsWith('rpgtl:')).forEach((k) => localStorage.removeItem(k));
}

// ===== 3. TEXT (whitelist, masker, deteksi bahasa, cek dasar) =====
export const DB_FIELDS = {
  Actors: ['name', 'nickname', 'profile'], Classes: ['name'],
  Skills: ['name', 'description', 'message1', 'message2'],
  Items: ['name', 'description'], Weapons: ['name', 'description'], Armors: ['name', 'description'],
  Enemies: ['name'], States: ['name', 'message1', 'message2', 'message3', 'message4'],
};
const ESC = /\\(?:[A-Za-z]+\[\d+\]|[A-Za-z]|[{}.|!^$<>\\])/g;
const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
/** Ganti kode escape dengan token ⟦n⟧. */
export function maskText(text) {
  const tokens = [];
  return { text: text.replace(ESC, (m) => { tokens.push(m); return `⟦${tokens.length - 1}⟧`; }), tokens };
}
/** Kembalikan kode escape. ok=false bila token hilang, duplikat, atau asing. */
export function unmaskText(text, tokens) {
  const seen = new Array(tokens.length).fill(0); let ok = true;
  const out = text.replace(/⟦(\d+)⟧/g, (m, n) => { if (tokens[n] === undefined) { ok = false; return m; } seen[n]++; return tokens[n]; });
  return { ok: ok && seen.every((c) => c === 1), text: out };
}
/** Teks tanpa kode escape (untuk mengukur panjang baris yang terlihat). */
export const stripEscapes = (s) => s.replace(ESC, '');
/** Apakah string layak diterjemahkan (bukan kosong/hanya escape; sumber ja harus ada kana/kanji). */
export function isTranslatable(s, src = 'ja') {
  if (typeof s !== 'string') return false;
  const t = s.replace(ESC, '').trim();
  return !!t && (src !== 'ja' || JA.test(t));
}

// ===== 4. PIPELINE (importer, ZIP reader/writer, CRC-32, extractor, exporter, diff guard) =====
/** Baca ZIP secara lazy lewat Blob.slice (mendukung Zip64). */
export async function readZip(blob) {
  const size = blob.size, tl = Math.min(size, 65557);
  const tail = new DataView(await blob.slice(size - tl).arrayBuffer());
  let p = tail.byteLength - 22;
  while (p >= 0 && tail.getUint32(p, true) !== 0x06054b50) p--;
  if (p < 0) throw new Error(UI.zipBad);
  let count = tail.getUint16(p + 10, true), cdSize = tail.getUint32(p + 12, true), cdOff = tail.getUint32(p + 16, true);
  if (cdOff === 0xffffffff || count === 0xffff) {
    const loc = new DataView(await blob.slice(size - tl + p - 20, size - tl + p).arrayBuffer());
    if (loc.byteLength < 20 || loc.getUint32(0, true) !== 0x07064b50) throw new Error(UI.zipBad);
    const o = Number(loc.getBigUint64(8, true));
    const z = new DataView(await blob.slice(o, o + 56).arrayBuffer());
    count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true));
  }
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const entries = []; let o = 0;
  for (let i = 0; i < count && o + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(o, true) !== 0x02014b50) break;
    const flags = cd.getUint16(o + 8, true), method = cd.getUint16(o + 10, true);
    let csize = cd.getUint32(o + 20, true), usize = cd.getUint32(o + 24, true), lho = cd.getUint32(o + 42, true);
    const nl = cd.getUint16(o + 28, true), el = cd.getUint16(o + 30, true), cl = cd.getUint16(o + 32, true);
    const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'windows-1252').decode(new Uint8Array(cd.buffer, o + 46, nl));
    if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) {
      let x = o + 46 + nl; const end = x + el;
      while (x + 4 <= end) {
        const id = cd.getUint16(x, true), len = cd.getUint16(x + 2, true);
        if (id === 1) {
          let q = x + 4;
          if (usize === 0xffffffff) { usize = Number(cd.getBigUint64(q, true)); q += 8; }
          if (csize === 0xffffffff) { csize = Number(cd.getBigUint64(q, true)); q += 8; }
          if (lho === 0xffffffff) lho = Number(cd.getBigUint64(q, true));
        }
        x += 4 + len;
      }
    }
    entries.push({ name, method, csize, usize, lho, flags, crc: cd.getUint32(o + 16, true) });
    o += 46 + nl + el + cl;
  }
  return {
    entries,
    /** Ekstrak satu entry menjadi Uint8Array. */
    async read(e) {
      if (e.flags & 1) throw new Error(UI.zipBad);
      const h = new DataView(await blob.slice(e.lho, e.lho + 30).arrayBuffer());
      const s = e.lho + 30 + h.getUint16(26, true) + h.getUint16(28, true);
      const data = blob.slice(s, s + e.csize);
      if (e.method === 0) return new Uint8Array(await data.arrayBuffer());
      if (e.method === 8) return new Uint8Array(await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      throw new Error(UI.zipMethod);
    },
  };
}
/** Path file -> 'data/X.json' atau 'www/data/X.json'; null bila bukan JSON langsung di folder data. */
export function normalizeDataPath(p) {
  const a = p.replace(/\\/g, '/').split('/'), i = a.lastIndexOf('data');
  if (i < 0 || i !== a.length - 2 || !/\.json$/i.test(a[i + 1])) return null;
  return (a[i - 1] === 'www' ? 'www/' : '') + 'data/' + a[i + 1];
}
async function collectSources(files) {
  const list = [];
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const z = await readZip(files[0]);
    z.entries.forEach((e) => list.push({ path: e.name, read: async () => new TextDecoder().decode(await z.read(e)) }));
  } else for (const f of files) list.push({ path: f.webkitRelativePath || f.name, read: () => f.text() });
  const has = (re) => list.some((i) => re.test(i.path));
  const engine = has(/(^|\/)js\/rmmz_core\.js$/) ? 'MZ' : has(/(^|\/)js\/rpg_core\.js$/) ? 'MV' : null;
  const data = new Map();
  for (const i of list) { const k = normalizeDataPath(i.path); if (k) data.set(k, i); }
  return { engine, data };
}
/**
 * Ekstrak unit teks dari satu file JSON sesuai whitelist.
 * @returns {Array} entry tanpa id/projectId/hash
 */
export function extractFile(path, json, { src = 'ja' } = {}) {
  const base = path.split('/').pop().replace(/\.json$/i, ''), out = [];
  const add = (p, kind, category, original, meta = {}, lineCount = 1) => {
    if (!isTranslatable(original, src)) return;
    out.push({ file: path, path: JSON.stringify(p), kind, category, original, translation: '', status: 'pending', order: out.length, lineCount, meta, source: src, error: '' });
  };
  const scanList = (list, p) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const c = list[i], P = c.parameters || [];
      if (c.code === 101 || c.code === 105) {
        const body = c.code === 101 ? 401 : 405, lines = []; let j = i + 1;
        if (c.code === 101 && typeof P[4] === 'string') add([...p, i, 'parameters', 4], 'speaker', 'speaker', P[4]);
        while (list[j]?.code === body) { lines.push(list[j].parameters[0]); j++; }
        if (lines.length) add([...p, i], 'block', body === 401 ? 'dialog' : 'scroll', lines.join('\n'), { speaker: P[4] || '' }, lines.length);
        i = j - 1;
      } else if (c.code === 102 && Array.isArray(P[0])) P[0].forEach((t, k) => add([...p, i, 'parameters', 0, k], 'choice', 'choice', t));
    }
  };
  const walk = (v, p) => {
    if (typeof v === 'string') add(p, 'field', 'system', v);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...p, i]));
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], [...p, k]));
  };
  const pages = (pg, p) => (pg || []).forEach((pa, pi) => scanList(pa?.list, [...p, 'pages', pi, 'list']));
  if (base === 'System') {
    ['gameTitle', 'currencyUnit'].forEach((k) => add([k], 'field', 'system', json[k]));
    walk(json.terms, ['terms']);
  } else if (/^Map\d+$/.test(base)) {
    add(['displayName'], 'field', 'map', json.displayName);
    (json.events || []).forEach((ev, ei) => ev && pages(ev.pages, ['events', ei]));
  } else if (base === 'CommonEvents') (json || []).forEach((ev, i) => ev && scanList(ev.list, [i, 'list']));
  else if (base === 'Troops') (json || []).forEach((t, i) => t && pages(t.pages, [i]));
  else if (DB_FIELDS[base]) (json || []).forEach((it, i) => it && DB_FIELDS[base].forEach((f) => add([i, f], 'field', base.toLowerCase(), it[f])));
  return out;
}
// ---- Penulis ZIP, CRC-32, exporter, diff guard (M-3) ----
const CRC_T = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
/** CRC-32 (tabel 256 entri) dari Uint8Array. */
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/**
 * Tulis ZIP (tanpa Zip64; hanya untuk file kecil). Nama file ditandai UTF-8.
 * Deflate bila CompressionStream tersedia dan hasilnya lebih kecil, selain itu store.
 * @param {{name:string, data:Uint8Array}[]} files
 * @returns {Promise<Blob>}
 */
export async function writeZip(files, { compress = true } = {}) {
  const parts = [], cd = [], enc = new TextEncoder(), now = new Date();
  const dt = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dd = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data); let data = f.data, method = 0;
    if (compress && typeof CompressionStream !== 'undefined' && data.length) {
      const z = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      if (z.length < data.length) { data = z; method = 8; }
    }
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(8, method, true);
    l.setUint16(10, dt, true); l.setUint16(12, dd, true); l.setUint32(14, crc, true); l.setUint32(18, data.length, true);
    l.setUint32(22, f.data.length, true); l.setUint16(26, name.length, true);
    parts.push(l.buffer, name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(10, method, true);
    c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true);
    c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cd.push(c.buffer, name);
    off += 30 + name.length + data.length;
  }
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cd.reduce((a, b) => a + b.byteLength, 0), true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, e.buffer], { type: 'application/zip' });
}

const getAt = (r, p) => p.reduce((o, k) => o?.[k], r);
const isApplicable = (e) => (e.status === 'done' || e.status === 'edited') && typeof e.translation === 'string' && e.translation.trim() !== '';
/** Sinkronkan 402 (parameters[1]) yang sebelumnya sama dengan teks pilihan 102 lama. */
function sync402(list, i, k, oldText, newText) {
  const n = list?.[i]?.indent;
  for (let j = i + 1; j < (list?.length || 0); j++) {
    const c = list[j];
    if (c.code === 404 && c.indent === n) break;
    if (c.code === 402 && c.indent === n && c.parameters?.[0] === k && c.parameters[1] === oldText) c.parameters[1] = newText;
  }
}
/**
 * Terapkan terjemahan ke JSON (diubah di tempat). Blok dialog dari indeks terbesar ke terkecil dalam satu list.
 * @param {*} json hasil JSON.parse file asli
 * @param {Array} entries entri milik file ini (yang tidak done/edited dilewati)
 * @param {string[]} problems diisi bila path tidak cocok
 */
export function applyTranslations(json, entries, problems = []) {
  const blocks = new Map();
  for (const e of entries.filter(isApplicable)) {
    const p = JSON.parse(e.path);
    if (e.kind === 'block') { const k = JSON.stringify(p.slice(0, -1)); if (!blocks.has(k)) blocks.set(k, []); blocks.get(k).push({ p, e }); continue; }
    const parent = getAt(json, p.slice(0, -1)), key = p.at(-1);
    if (typeof parent?.[key] !== 'string') { problems.push(`${e.file} ${e.path}: path tidak cocok dengan file asli`); continue; }
    const old = parent[key];
    parent[key] = e.kind === 'choice' ? e.translation.replace(/\s*\n\s*/g, ' ') : e.translation;
    if (e.kind === 'choice') sync402(getAt(json, p.slice(0, -4)), p.at(-4), p.at(-1), old, parent[key]);
  }
  for (const [k, arr] of blocks) {
    const list = getAt(json, JSON.parse(k));
    arr.sort((a, b) => b.p.at(-1) - a.p.at(-1));
    for (const { p, e } of arr) {
      const i = p.at(-1), head = Array.isArray(list) ? list[i] : null, body = head?.code === 101 ? 401 : head?.code === 105 ? 405 : 0;
      if (!body) { problems.push(`${e.file} ${e.path}: header blok tidak cocok dengan file asli`); continue; }
      let j = i + 1; while (list[j]?.code === body) j++;
      const lines = e.translation.replace(/^\n+|\n+$/g, '').split('\n');
      list.splice(i + 1, j - i - 1, ...lines.map((t) => ({ code: body, indent: head.indent, parameters: [t] })));
    }
  }
  return json;
}
const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const sameDeep = (a, b) => {
  const ka = kindOf(a);
  if (ka !== kindOf(b)) return false;
  if (ka === 'array') return a.length === b.length && a.every((x, i) => sameDeep(x, b[i]));
  if (ka === 'object') { const k = Object.keys(a); return k.length === Object.keys(b).length && k.every((x) => x in b && sameDeep(a[x], b[x])); }
  return a === b;
};
const isCmd = (v) => v && typeof v === 'object' && !Array.isArray(v) && typeof v.code === 'number' && Array.isArray(v.parameters);
const bodyOf = (c) => (c.code === 101 ? 401 : c.code === 105 ? 405 : 0);
/** Pisahkan list perintah menjadi perintah biasa dan run baris dialog (401/405) di bawah header 101/105. */
function splitList(list) {
  const rest = [], idx = [], runs = new Map();
  for (let i = 0; i < list.length; i++) {
    const c = list[i], body = bodyOf(c); rest.push(c); idx.push(i);
    if (body) { const run = []; while (list[i + 1]?.code === body) run.push(list[++i]); runs.set(rest.length - 1, run); }
  }
  return { rest, idx, runs };
}
/**
 * Diff guard: bandingkan JSON asli dan hasil. Hanya string pada path whitelist (dari extractor) dan
 * penyisipan/penghapusan baris 401/405 pada blok 101/105 yang boleh berbeda.
 * @returns {string[]} daftar masalah (kosong bila lolos), maksimal 20
 */
export function diffGuard(orig, next, file = 'data/X.json') {
  const probs = [], allowS = new Set(), allowB = new Set();
  // Proyek lama menyimpan indeks array System.terms sebagai string; samakan jadi angka.
  const norm = (path) => JSON.stringify(JSON.parse(path).map((k) => (typeof k === 'string' && /^\d+$/.test(k) ? Number(k) : k)));
  for (const e of extractFile(file, orig, { src: 'en' })) (e.kind === 'block' ? allowB : allowS).add(norm(e.path));
  const bad = (p, why) => { if (probs.length < 20) probs.push(`${file} ${JSON.stringify(p)}: ${why}`); };
  const cmpList = (a, b, p) => {
    const A = splitList(a), B = splitList(b);
    if (A.rest.length !== B.rest.length) return bad(p, 'perintah lain bergeser atau berubah jumlahnya');
    A.rest.forEach((c, r) => {
      const hp = [...p, A.idx[r]]; cmp(c, B.rest[r], hp);
      const ra = A.runs.get(r) || [], rb = B.runs.get(r) || [];
      if (sameDeep(ra, rb)) return;
      if (!allowB.has(JSON.stringify(hp))) return bad(hp, 'baris dialog berubah di luar whitelist');
      if (!rb.length) return bad(hp, 'blok dialog menjadi kosong');
      for (const x of rb) if (x.code !== bodyOf(c) || x.indent !== c.indent || x.parameters.length !== 1 || typeof x.parameters[0] !== 'string' || Object.keys(x).length !== 3) return bad(hp, 'baris dialog baru tidak valid');
    });
  };
  const cmp = (a, b, p, key) => {
    if (probs.length >= 20) return;
    const t = kindOf(a);
    if (t !== kindOf(b)) return bad(p, 'tipe berubah');
    if (t === 'string') { if (a !== b && !allowS.has(JSON.stringify(p))) bad(p, 'teks di luar whitelist berubah'); return; }
    if (t === 'array') {
      if (key === 'list' && a.every(isCmd) && b.every(isCmd)) return cmpList(a, b, p);
      if (a.length !== b.length) return bad(p, 'panjang array berubah');
      return a.forEach((x, i) => cmp(x, b[i], [...p, i]));
    }
    if (t === 'object') {
      const ka = Object.keys(a).sort();
      if (!sameDeep(ka, Object.keys(b).sort())) return bad(p, 'key berubah');
      if (a.code === 402 && typeof a.parameters?.[1] === 'string') allowS.add(JSON.stringify([...p, 'parameters', 1]));
      return ka.forEach((k) => cmp(a[k], b[k], [...p, k], k));
    }
    if (a !== b) bad(p, 'nilai berubah');
  };
  cmp(orig, next, []);
  return probs;
}
/**
 * Bangun patch dari JSON asli dan entries (tanpa IndexedDB). Entry pending/error dilewati.
 * @param {{path:string,text:string}[]} files origFiles
 * @returns {{ok:boolean, empty?:boolean, problems:string[], files:{name:string,data:Uint8Array}[], report:string, stat:object}}
 */
export function buildPatch(files, entries, { model = '', date = new Date() } = {}) {
  const byFile = new Map(), out = [], problems = [], stat = { files: 0, applied: 0, pending: 0, error: 0, skipped: 0 };
  for (const e of entries) {
    if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e);
    if (e.status === 'pending' || e.status === 'translating') stat.pending++; else if (e.status === 'error') stat.error++; else if (e.status === 'skipped') stat.skipped++;
  }
  for (const f of files) {
    const es = (byFile.get(f.path) || []).filter(isApplicable);
    if (!es.length) continue;
    let orig, work; try { orig = JSON.parse(f.text); work = JSON.parse(f.text); } catch { problems.push(`${f.path}: JSON asli rusak`); continue; }
    const pr = []; applyTranslations(work, es, pr);
    const text = JSON.stringify(work); let re = null;
    try { re = JSON.parse(text); } catch { pr.push(`${f.path}: hasil tidak bisa dibaca ulang`); }
    if (!pr.length) pr.push(...diffGuard(orig, re, f.path));
    if (pr.length) { problems.push(...pr); continue; }
    out.push({ name: f.path, data: new TextEncoder().encode(text) }); stat.files++; stat.applied += es.length;
  }
  const report = ['RPG Maker Translator - patch-report', `Tanggal: ${date.toISOString()}`, `Model: ${model}`, `File diubah: ${stat.files}`, `Teks diterapkan: ${stat.applied}`,
    `Belum diterjemahkan (tetap asli): ${stat.pending}`, `Error (tetap asli): ${stat.error}`, `Dilewati: ${stat.skipped}`, '', ...out.map((x) => x.name)].join('\n');
  return { ok: !problems.length && out.length > 0, empty: !problems.length && !out.length, problems, files: out, report, stat };
}
/** Ekspor proyek: JSON asli + terjemahan, lolos diff guard, lalu zip. Bila gagal, tidak ada zip. */
export async function exportProject(project, model = '') {
  const files = await dbPrefix('origFiles', project.id + ':'), entries = await dbQuery('entries', 'projectId', project.id);
  const r = buildPatch(files, entries, { model });
  if (!r.ok) return r;
  return { ...r, blob: await writeZip([...r.files, { name: 'patch-report.txt', data: new TextEncoder().encode(r.report) }]) };
}
/** Impor folder/zip: simpan JSON asli dan entries ke IndexedDB. */
export async function importProject(files, src = 'ja') {
  const { engine: eng, data } = await collectSources(files);
  if (!data.size) throw new Error(UI.noData);
  const id = 'p' + Date.now().toString(36), orig = [], entries = [], broken = [], counts = {};
  let sys = null;
  for (const [path, item] of data) {
    let text, json;
    try { text = await item.read(); json = JSON.parse(text); } catch { broken.push(path); continue; }
    if (path.endsWith('System.json')) sys = json;
    orig.push({ key: `${id}:${path}`, projectId: id, path, text });
    for (const e of extractFile(path, json, { src })) {
      e.projectId = id; e.hash = await sha256(e.original); entries.push(e);
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
  }
  const engine = eng || (sys && (sys.advanced || sys.itemCategories) ? 'MZ' : 'MV');
  const project = { id, engine, src, tgt: 'id', files: orig.length, broken, counts, total: entries.length, updatedAt: Date.now() };
  await dbPutMany('origFiles', orig);
  await dbPutMany('entries', entries);
  await dbPut('projects', project);
  await dbPut('settings', { key: 'current', value: id });
  return project;
}

// ===== 5. TRANSLATE (batch, cache, retry, resume, klien LLM, biaya) =====
export const DEFAULT_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', remember: false, model: 'google/gemini-2.5-flash',
  temperature: 0.3, batchSize: 20, maxChars: 3000, concurrency: 2, delay: 300, priceIn: 0, priceOut: 0,
};
const LANG = { ja: 'Japanese', en: 'English', id: 'Indonesian' };
const TODO = new Set(['pending', 'error', 'translating']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let memKey = '';

/** Galat dari klien LLM. fatal=true berarti retry tidak berguna. */
export class LlmError extends Error {
  constructor(msg, { status = 0, fatal = false } = {}) { super(msg); this.name = 'LlmError'; this.status = status; this.fatal = fatal; }
}
/** Baca pengaturan. Bila "ingat key" mati, key hanya ada di memori tab ini. */
export async function loadConfig() {
  const r = await dbGet('settings', 'config');
  const c = { ...DEFAULT_CONFIG, ...(r?.value || {}) };
  if (!c.remember) c.apiKey = memKey;
  return c;
}
/** Simpan pengaturan. Key ke IndexedDB hanya bila remember aktif. */
export async function saveConfig(c) {
  memKey = c.apiKey;
  await dbPut('settings', { key: 'config', value: { ...c, apiKey: c.remember ? c.apiKey : '' } });
}
/** Base URL harus https, kecuali localhost. */
export function urlOk(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(x.hostname); } catch { return false; }
}
/** Satu panggilan chat completions (OpenAI-compatible). Key hanya dikirim ke baseUrl. */
export async function llmChat(cfg, messages, signal, fetchFn = fetch) {
  if (!cfg.apiKey) throw new LlmError(UI.noKey, { fatal: true });
  if (!urlOk(cfg.baseUrl)) throw new LlmError(UI.urlBad, { fatal: true });
  let res;
  try {
    res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.model, temperature: cfg.temperature, messages }),
    });
  } catch (e) { if (e.name === 'AbortError') throw e; throw new LlmError(UI.net); }
  if (!res.ok) {
    const s = res.status;
    if (s === 401 || s === 403) throw new LlmError(UI.keyBad, { status: s, fatal: true });
    if (s === 402) throw new LlmError(UI.credit, { status: s, fatal: true });
    let d = ''; try { d = (await res.json())?.error?.message || ''; } catch { /* abaikan */ }
    const fatal = s !== 429 && s < 500;
    throw new LlmError(`Provider menolak permintaan (${s}). ${d || (fatal ? 'Periksa model di Pengaturan' : 'Coba lagi nanti')}`.trim(), { status: s, fatal });
  }
  const j = await res.json().catch(() => null), text = j?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new LlmError(UI.badResp);
  return { text, usage: j.usage || null };
}
/** Jalankan fn dengan retry dan backoff eksponensial. Galat fatal dan AbortError tidak diulang. */
export async function withRetry(fn, { tries = 3, base = 800, wait = sleep } = {}) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (e.name === 'AbortError' || e.fatal || i >= tries - 1) throw e; await wait(base * 2 ** i); }
  }
}
/** Parser JSON toleran: pagar kode ```json dan teks di sekitar array/objek. null bila gagal. */
export function parseJsonLoose(s) {
  const t = String(s).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* lanjut */ }
  for (const [a, b] of [['[', ']'], ['{', '}']]) {
    const i = t.indexOf(a), j = t.lastIndexOf(b);
    if (i >= 0 && j > i) try { return JSON.parse(t.slice(i, j + 1)); } catch { /* lanjut */ }
  }
  return null;
}
const toArray = (p) => Array.isArray(p) ? p : p && typeof p === 'object' ? Object.values(p).find(Array.isArray) || null : null;
/** Susun pesan untuk LLM. units: [{id, text, speaker?}], context: array string. */
export function buildMessages({ src, tgt, units, context = [] }) {
  const system = `You translate RPG game text from ${LANG[src]} to ${LANG[tgt]}.
Rules:
- Keep every ⟦n⟧ token exactly as given: same count, same form. Never translate, add, or remove them.
- Keep line breaks as line breaks and keep the same number of lines when possible.
- Translate as natural game dialogue. Keep names consistent. Keep short UI terms short.
- "context" holds earlier lines for reference only. Do not translate or return them.
- Reply with a JSON array only, no code fence, no commentary: [{"id":0,"text":"..."}]. One object per item, same ids.`;
  const user = JSON.stringify({ context, items: units.map((u) => ({ id: u.id, ...(u.speaker ? { speaker: u.speaker } : {}), text: u.text })) });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
/**
 * Terjemahkan satu batch. Respons tidak valid atau sebagian: unit yang kurang diulang (bisect).
 * @param {Array} units [{id, text, speaker?}]
 * @param {{chat:Function, src:string, tgt:string, context?:string[], check?:Function, onUsage?:Function, retry?:object}} o
 * @returns {Promise<{ok:Map<number,string>, fail:Map<number,string>}>} galat fatal dan abort dilempar
 */
export async function translateBatch(units, o, why = new Map()) {
  const ok = new Map(), fail = new Map(), ids = new Set(units.map((u) => u.id));
  let arr;
  try {
    const r = await withRetry(() => o.chat(buildMessages({ src: o.src, tgt: o.tgt, units, context: o.context })), o.retry);
    o.onUsage?.(r.usage); arr = toArray(parseJsonLoose(r.text));
  } catch (e) {
    if (e.fatal || e.name === 'AbortError') throw e;
    units.forEach((u) => fail.set(u.id, e.message)); return { ok, fail };
  }
  for (const r of arr || []) {
    const id = Number(r?.id);
    if (!ids.has(id) || typeof r.text !== 'string' || ok.has(id)) continue;
    const bad = o.check?.(id, r.text) || '';
    if (bad) why.set(id, bad); else ok.set(id, r.text);
  }
  const missing = units.filter((u) => !ok.has(u.id));
  if (!missing.length) return { ok, fail };
  if (units.length === 1) { fail.set(units[0].id, why.get(units[0].id) || UI.badJson); return { ok, fail }; }
  const h2 = units.length >> 1;
  const parts = missing.length < units.length ? [missing] : [units.slice(0, h2), units.slice(h2)];
  for (const p of parts) {
    const r = await translateBatch(p, o, why);
    r.ok.forEach((v, k) => ok.set(k, v)); r.fail.forEach((v, k) => fail.set(k, v));
  }
  return { ok, fail };
}
/** Bagi unit menjadi batch menurut jumlah dan total karakter. */
export function makeBatches(units, size = 20, maxChars = 3000) {
  const out = []; let cur = [], n = 0;
  for (const u of units) {
    if (cur.length && (cur.length >= size || n + u.text.length > maxChars)) { out.push(cur); cur = []; n = 0; }
    cur.push(u); n += u.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Jalankan worker pada tiap batch dengan konkurensi terbatas dan jeda. Berhenti di galat pertama atau abort. */
export async function runPool(batches, conc, delay, signal, worker) {
  let i = 0, err = null;
  const w = async () => {
    while (!err && !signal?.aborted && i < batches.length) {
      try { await worker(batches[i++]); } catch (e) { err ||= e; }
      if (!err && delay && i < batches.length) await sleep(delay);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, conc) }, w));
  if (err) throw err;
}
/** Perkiraan kasar token dan biaya untuk entri yang belum selesai (belum menghitung cache). */
export function estimateCost(entries, cfg, src = 'ja') {
  const seen = new Set(); let chars = 0;
  for (const e of entries) {
    if (!TODO.has(e.status) || seen.has(e.original)) continue;
    seen.add(e.original); chars += maskText(e.original).text.length;
  }
  const items = seen.size, batches = items ? Math.max(Math.ceil(items / cfg.batchSize), Math.ceil(chars / cfg.maxChars)) : 0;
  const body = chars * (src === 'ja' ? 1 : 0.3);
  const inTok = Math.round(body + items * 15 + batches * 400), outTok = Math.round(body * (src === 'ja' ? 1 : 1.2) + items * 12);
  const cost = cfg.priceIn || cfg.priceOut ? (inTok * cfg.priceIn + outTok * cfg.priceOut) / 1e6 : null;
  return { items, batches, inTok, outTok, cost };
}
/**
 * Terjemahkan semua entri proyek yang pending/error. Aman dilanjutkan: hasil tiap batch langsung disimpan.
 * @param {object} project proyek (id, src, tgt)
 * @param {object} cfg pengaturan
 * @param {{signal?:AbortSignal, onProgress?:Function, chat?:Function}} o chat(messages, signal) bisa diganti untuk tes
 * @returns {Promise<{done:number, error:number, cached:number, tokensIn:number, tokensOut:number, stopped:boolean}>}
 */
export async function runTranslation(project, cfg, o = {}) {
  const { signal, onProgress = () => {} } = o, chat = o.chat || ((m, s) => llmChat(cfg, m, s));
  const all = (await dbQuery('entries', 'projectId', project.id)).sort((a, b) => a.id - b.id);
  const pos = new Map(all.map((e, i) => [e.id, i])), todo = all.filter((e) => TODO.has(e.status));
  const stat = { done: 0, error: 0, cached: 0, tokensIn: 0, tokensOut: 0, stopped: false };
  let n = 0; const tick = (t) => onProgress(n, todo.length, t);
  const groups = new Map();
  for (const e of todo) { if (!groups.has(e.original)) groups.set(e.original, []); groups.get(e.original).push(e); }
  const units = [], hits = []; let uid = 0;
  for (const [original, entries] of groups) {
    const key = await sha256(`${project.src}|${project.tgt}|${cfg.model}|${original}`), c = await dbGet('cache', key);
    if (c) { entries.forEach((e) => hits.push({ ...e, translation: c.text, status: 'done', error: '' })); continue; }
    const m = maskText(original), e0 = entries[0], p = pos.get(e0.id);
    units.push({
      id: uid++, key, text: m.text, tokens: m.tokens, speaker: e0.meta?.speaker || '', entries,
      ctx: all.slice(Math.max(0, p - 3), p).filter((x) => x.file === e0.file).map((x) => maskText(x.original).text.slice(0, 200)),
    });
  }
  if (hits.length) { await dbPutMany('entries', hits); n += hits.length; stat.done = stat.cached = hits.length; }
  tick(`${n} dari ${todo.length} teks`);
  const byId = new Map(units.map((u) => [u.id, u])); let streak = 0;
  const work = async (batch) => {
    const r = await translateBatch(batch, {
      chat: (m) => chat(m, signal), src: project.src, tgt: project.tgt, context: batch[0].ctx,
      check: (id, t) => (t.trim() ? (unmaskText(t, byId.get(id).tokens).ok ? '' : UI.tokenBad) : UI.emptyTr),
      onUsage: (u) => { stat.tokensIn += u?.prompt_tokens || 0; stat.tokensOut += u?.completion_tokens || 0; },
    });
    const upd = [], cache = [];
    r.ok.forEach((t, id) => {
      const u = byId.get(id), text = unmaskText(t, u.tokens).text;
      cache.push({ key: u.key, text, at: Date.now() });
      u.entries.forEach((e) => upd.push({ ...e, translation: text, status: 'done', error: '' })); stat.done += u.entries.length;
    });
    r.fail.forEach((msg, id) => { byId.get(id).entries.forEach((e) => upd.push({ ...e, status: 'error', error: msg })); stat.error += byId.get(id).entries.length; });
    await dbPutMany('cache', cache); await dbPutMany('entries', upd);
    n += upd.length; tick(`${n} dari ${todo.length} teks`);
    streak = r.ok.size ? 0 : streak + 1;
    if (streak >= 3) throw new LlmError(UI.tooMany, { fatal: true });
  };
  try { await runPool(makeBatches(units, cfg.batchSize, cfg.maxChars), cfg.concurrency, cfg.delay, signal, work); }
  catch (e) { if (e.name !== 'AbortError') throw e; }
  stat.stopped = !!signal?.aborted;
  return stat;
}

/**
 * Terjemahkan ulang satu entry (melewati cache, lalu memperbarui cache). Bila gagal, entry tidak diubah dan galat dilempar.
 * @returns {Promise<object>} entry baru
 */
export async function retranslateEntry(project, cfg, e, chat) {
  const m = maskText(e.original), call = chat || ((msgs) => llmChat(cfg, msgs));
  const r = await translateBatch([{ id: 0, text: m.text, speaker: e.meta?.speaker || '' }], {
    chat: call, src: project.src, tgt: project.tgt, context: [],
    check: (id, t) => (t.trim() ? (unmaskText(t, m.tokens).ok ? '' : UI.tokenBad) : UI.emptyTr),
  });
  if (!r.ok.size) throw new LlmError(r.fail.get(0) || UI.badJson);
  const text = unmaskText(r.ok.get(0), m.tokens).text, u = { ...e, translation: text, status: 'done', error: '' };
  await dbPut('entries', u);
  await dbPut('cache', { key: await sha256(`${project.src}|${project.tgt}|${cfg.model}|${e.original}`), text, at: Date.now() });
  return u;
}

// ===== 6. VIEWS (proyek/import, translate, review, ekspor, pengaturan) =====
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v);
  kids.flat().forEach((c) => e.append(c));
  return e;
};
const card = (...k) => h('div', { class: 'card' }, ...k);
async function currentProject() {
  const cur = await dbGet('settings', 'current');
  return cur ? dbGet('projects', cur.value) : null;
}
async function viewProyek() {
  const msg = h('p', { class: 'mut' });
  let src = 'ja';
  const run = async (ev) => {
    const files = [...ev.target.files]; if (!files.length) return;
    msg.className = 'mut'; msg.textContent = 'Mengimpor…';
    try { await importProject(files, src); await render(); }
    catch (e) { msg.className = 'err'; msg.textContent = e.message; }
  };
  const sel = h('select', { onchange: (e) => { src = e.target.value; } },
    h('option', { value: 'ja' }, 'Jepang'), h('option', { value: 'en' }, 'Inggris'));
  const pick = (label, attrs) => h('label', { class: 'file' }, label, h('input', { type: 'file', onchange: run, ...attrs }));
  const out = [card(h('h2', {}, 'Impor game'), h('label', {}, 'Bahasa sumber'), sel,
    pick('Pilih folder data', { webkitdirectory: '', multiple: '' }), pick('Pilih zip game', { accept: '.zip' }), msg)];
  const p = await currentProject();
  if (p) out.push(card(h('h2', {}, 'Ringkasan'),
    h('p', { class: 'mut' }, `Engine: ${p.engine}\nFile JSON: ${p.files}${p.broken.length ? ` (rusak: ${p.broken.length})` : ''}\nTotal teks: ${p.total}`),
    Object.entries(p.counts).map(([k, v]) => h('span', { class: 'badge' }, `${k} ${v}`)),
    h('button', { onclick: async () => { if (confirm('Hapus proyek ini beserta semua terjemahannya?')) { await deleteProject(p.id); await render(); } } }, 'Hapus proyek')));
  return out;
}
const job = { running: false, ctl: null, value: 0, max: 1, text: '', err: false, ui: null };
const paintJob = (force) => {
  const u = job.ui; if (!u || !(force || u.bar.isConnected)) return;
  u.bar.max = job.max; u.bar.value = job.value; u.txt.textContent = job.text; u.txt.className = job.err ? 'err' : 'mut';
  u.start.disabled = job.running; u.stop.disabled = !job.running;
};
async function startJob() {
  if (job.running) return;
  const cfg = await loadConfig(), p = await currentProject();
  job.err = false;
  if (!cfg.apiKey) { job.err = true; job.text = UI.noKey; return paintJob(); }
  job.running = true; job.ctl = new AbortController(); job.value = 0; job.text = 'Memulai…'; paintJob();
  try {
    const r = await runTranslation(p, cfg, { signal: job.ctl.signal, onProgress: (d, t, txt) => { job.value = d; job.max = t || 1; job.text = txt; paintJob(); } });
    job.text = `${r.stopped ? 'Dihentikan' : 'Selesai'}. ${r.done} berhasil (${r.cached} dari cache), ${r.error} error`;
  } catch (e) { job.err = true; job.text = e.message; }
  job.running = false; paintJob();
  if (/^#\/translate/.test(location.hash)) render();
}
async function viewTranslate() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const cfg = await loadConfig(), all = await dbQuery('entries', 'projectId', p.id);
  const cnt = (s) => all.filter((e) => e.status === s).length, est = estimateCost(all, cfg, p.src);
  const tgt = h('select', { onchange: async (e) => { p.tgt = e.target.value; await dbPut('projects', { ...p, updatedAt: Date.now() }); await render(); } },
    h('option', { value: 'id', ...(p.tgt === 'id' ? { selected: '' } : {}) }, 'Indonesia'),
    h('option', { value: 'en', ...(p.tgt === 'en' ? { selected: '' } : {}) }, 'Inggris'));
  const bar = h('progress', { value: '0', max: '1' }), txt = h('p', { class: 'mut' });
  const start = h('button', { class: 'pri', onclick: startJob }, cnt('done') || cnt('error') ? 'Lanjutkan' : 'Mulai translate');
  const stop = h('button', { onclick: () => job.ctl?.abort() }, 'Hentikan');
  job.ui = { bar, txt, start, stop };
  const money = est.cost === null ? 'isi harga token di Pengaturan' : `sekitar ${est.cost.toFixed(4)} (satuan mengikuti harga di Pengaturan)`;
  const out = [
    card(h('h2', {}, 'Bahasa'), h('label', {}, 'Sumber'), h('p', { class: 'mut' }, p.src === 'ja' ? 'Jepang' : 'Inggris'), h('label', {}, 'Target'), tgt),
    card(h('h2', {}, 'Status'), ['pending', 'translating', 'done', 'edited', 'error', 'skipped'].filter(cnt).map((s) => h('span', { class: 'badge' }, `${s} ${cnt(s)}`)),
      h('p', { class: 'mut' }, `Perkiraan kasar: ${est.items} teks unik, ${est.batches} batch\nToken masuk ${est.inTok}, keluar ${est.outTok}\nBiaya: ${money}\nBelum menghitung cache.`)),
    card(h('p', { class: 'mut' }, `Teks dikirim ke provider yang dipilih (${cfg.baseUrl}) dengan model ${cfg.model}.`), bar, txt, h('div', { class: 'row' }, start, stop)),
  ];
  paintJob(true);
  return out;
}
const FIELDS = [
  ['baseUrl', 'Base URL', 'url'], ['apiKey', 'API key', 'password'], ['model', 'Model', 'text'], ['temperature', 'Temperature (0 sampai 2)', 'number'],
  ['batchSize', 'Ukuran batch (teks)', 'number'], ['maxChars', 'Batas karakter per batch', 'number'], ['concurrency', 'Konkurensi (1 sampai 5)', 'number'],
  ['delay', 'Jeda antar request (ms)', 'number'], ['priceIn', 'Harga token masuk per 1 juta', 'number'], ['priceOut', 'Harga token keluar per 1 juta', 'number'],
];
async function viewSettings() {
  const c = await loadConfig(), msg = h('p', { class: 'mut' }), inp = {};
  const form = FIELDS.flatMap(([k, label, type]) => {
    inp[k] = h('input', { type, value: String(c[k]), autocomplete: 'off', ...(type === 'number' ? { step: 'any', inputmode: 'decimal' } : {}) });
    return [h('label', {}, label), inp[k]];
  });
  const remember = h('input', { type: 'checkbox', ...(c.remember ? { checked: '' } : {}) });
  const num = (k, lo, hi) => Math.min(hi, Math.max(lo, Number(inp[k].value) || lo));
  const gather = () => ({
    baseUrl: inp.baseUrl.value.trim(), apiKey: inp.apiKey.value.trim(), remember: remember.checked, model: inp.model.value.trim() || DEFAULT_CONFIG.model,
    temperature: num('temperature', 0, 2), batchSize: Math.round(num('batchSize', 1, 100)), maxChars: Math.round(num('maxChars', 500, 12000)),
    concurrency: Math.round(num('concurrency', 1, 5)), delay: Math.round(num('delay', 0, 10000)), priceIn: num('priceIn', 0, 1e6), priceOut: num('priceOut', 0, 1e6),
  });
  const wipeBtn = h('button', { disabled: '', onclick: async () => { try { await resetAll((m) => say(m, true)); location.hash = '#/proyek'; location.reload(); } catch (e) { say(e.message, true); } } }, 'Hapus semua data');
  const wipe = h('input', { type: 'text', placeholder: 'HAPUS', autocomplete: 'off', oninput: (e) => { wipeBtn.disabled = e.target.value !== 'HAPUS'; } });
  const say = (t, bad) => { msg.className = bad ? 'err' : 'mut'; msg.textContent = t; };
  const save = async () => {
    const n = gather(); if (!urlOk(n.baseUrl)) return say(UI.urlBad, true) || null;
    await saveConfig(n); say(n.apiKey && !n.remember ? 'Tersimpan. Key hanya diingat sampai tab ditutup' : 'Tersimpan'); return n;
  };
  const test = async () => {
    const n = await save(); if (!n) return;
    say('Menguji koneksi…');
    try {
      const r = await llmChat(n, buildMessages({ src: 'ja', tgt: 'id', units: [{ id: 0, text: 'こんにちは' }], context: [] }));
      const t = toArray(parseJsonLoose(r.text))?.[0]?.text;
      say(t ? `Terhubung. Contoh hasil: ${t}` : 'Terhubung, tetapi format respons tidak sesuai. Coba model lain', !t);
    } catch (e) { say(e.message, true); }
  };
  return [card(h('h2', {}, 'Pengaturan LLM'), ...form,
    h('label', { class: 'chk' }, remember, 'Ingat key di perangkat ini'),
    h('p', { class: 'mut' }, 'Key hanya dikirim ke base URL di atas. Jangan aktifkan di perangkat bersama.'),
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: save }, 'Simpan'), h('button', { onclick: test }, 'Tes koneksi')), msg),
  card(h('h2', {}, 'Hapus semua data'), h('p', { class: 'mut' }, 'Menghapus semua proyek, terjemahan, cache, dan pengaturan aplikasi ini. Data lain di situs ini tidak disentuh. Ketik HAPUS untuk lanjut.'), wipe, wipeBtn)];
}
const FILTERS = [['all', 'Semua'], ['pending', 'Pending'], ['error', 'Error'], ['edited', 'Diedit']];
const longLine = (t) => t.split('\n').some((l) => stripEscapes(l).length > LINE_WARN);
async function viewReview() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const rows = (await dbQuery('entries', 'projectId', p.id)).sort((a, b) => a.id - b.id);
  let filter = 'all', q = '', page = 0;
  const box = h('div'), info = h('p', { class: 'mut' });
  const rowCard = (e) => {
    const st = h('span', { class: 'badge' }, e.status), warn = h('span', { class: 'badge warn' }, 'baris panjang'), msg = h('p', { class: 'err' }, e.error);
    warn.hidden = !longLine(e.translation);
    const ta = h('textarea', { rows: String(Math.max(2, e.original.split('\n').length + 1)) }, e.translation);
    const sync = () => { st.textContent = e.status; warn.hidden = !longLine(e.translation); msg.textContent = e.error; };
    ta.addEventListener('change', async () => {
      const u = { ...e, translation: ta.value, status: ta.value.trim() ? 'edited' : 'pending', error: '' };
      await dbPut('entries', u); Object.assign(e, u); sync();
    });
    const rt = h('button', { onclick: async () => {
      rt.disabled = true; msg.className = 'mut'; msg.textContent = 'Menerjemahkan…';
      try {
        const cfg = await loadConfig(); if (!cfg.apiKey) throw new Error(UI.noKey);
        Object.assign(e, await retranslateEntry(p, cfg, e)); ta.value = e.translation; msg.textContent = '';
      } catch (x) { msg.className = 'err'; msg.textContent = x.message; }
      rt.disabled = false; sync();
    } }, 'Terjemah ulang');
    return card(h('span', { class: 'badge' }, e.category), st, warn, h('p', { class: 'mut' }, e.original), ta, msg, rt);
  };
  const fill = () => {
    const list = rows.filter((e) => (filter === 'all' || e.status === filter) && (!q || e.original.toLowerCase().includes(q) || e.translation.toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); page = Math.min(page, pages - 1);
    info.textContent = `${list.length} teks`;
    const go = (n) => () => { page = n; fill(); scrollTo(0, 0); };
    box.replaceChildren(...list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(rowCard),
      h('div', { class: 'row' }, h('button', { onclick: go(page - 1), ...(page ? {} : { disabled: '' }) }, 'Sebelumnya'),
        h('button', { onclick: go(page + 1), ...(page < pages - 1 ? {} : { disabled: '' }) }, `Berikutnya (${page + 1}/${pages})`)));
  };
  const sel = h('select', { onchange: (e) => { filter = e.target.value; page = 0; fill(); } }, FILTERS.map(([v, t]) => h('option', { value: v }, t)));
  const find = h('input', { type: 'search', placeholder: 'Cari teks', onchange: (e) => { q = e.target.value.trim().toLowerCase(); page = 0; fill(); } });
  fill();
  return [card(sel, find, info), box];
}
let exportUrl = '';
async function viewEkspor() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const cfg = await loadConfig(), rows = await dbQuery('entries', 'projectId', p.id);
  const n = (f) => rows.filter(f).length, out = h('div');
  const ready = n((e) => (e.status === 'done' || e.status === 'edited') && e.translation.trim()), pend = n((e) => e.status === 'pending' || e.status === 'translating'), err = n((e) => e.status === 'error');
  const btn = h('button', { class: 'pri', onclick: async () => {
    btn.disabled = true; out.replaceChildren(h('p', { class: 'mut' }, 'Memeriksa dengan diff guard…'));
    try {
      const r = await exportProject(p, cfg.model);
      if (!r.ok) out.replaceChildren(card(h('h2', {}, 'Ekspor dibatalkan'),
        h('p', { class: 'err' }, r.empty ? UI.exportEmpty : 'Diff guard menolak hasil. Tidak ada file dibuat. Perbaiki lalu coba lagi'), r.problems.map((x) => h('p', { class: 'mut' }, x))));
      else {
        if (exportUrl) URL.revokeObjectURL(exportUrl);
        exportUrl = URL.createObjectURL(r.blob);
        out.replaceChildren(card(h('h2', {}, 'Patch siap'), h('p', { class: 'mut' }, r.report),
          h('a', { class: 'file', href: exportUrl, download: `rpgtl-patch-${p.id}.zip` }, 'Unduh zip'),
          h('p', { class: 'mut' }, 'Backup folder data dulu, lalu timpa isinya dengan file di dalam zip.')));
      }
    } catch (e) { out.replaceChildren(card(h('p', { class: 'err' }, e.message))); }
    btn.disabled = false;
  } }, 'Buat patch');
  return [card(h('h2', {}, 'Ekspor'), h('p', { class: 'mut' }, `Siap diekspor: ${ready}\nBelum diterjemahkan (tetap asli): ${pend}\nError (tetap asli): ${err}`), btn), out];
}

// ===== 7. BOOTSTRAP (router hash, state, mulai aplikasi) =====
const app = () => document.getElementById('app');
const routes = {
  proyek: viewProyek, review: viewReview, ekspor: viewEkspor,
  translate: viewTranslate, pengaturan: viewSettings,
};
async function render() {
  const name = (location.hash.match(/^#\/(\w+)/) || [, 'proyek'])[1];
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.hash === '#/' + name));
  try { app().replaceChildren(...await (routes[name] || viewProyek)()); }
  catch (e) { app().replaceChildren(card(h('p', { class: 'err' }, e.message))); }
}
if (!globalThis.__RPGTL_TEST__) {
  addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
