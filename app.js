// ===== 1. CONFIG & STRING UI =====
// Mode tes memakai DB terpisah agar data asli di origin yang sama tidak ikut terhapus.
export const DB_NAME = globalThis.__RPGTL_TEST__ ? 'rpgtl-db-test' : 'rpgtl-db';
export const PAGE_SIZE = 50;
export const LINE_WARN = 48;
export const UI = {
  noData: 'Folder data tidak ditemukan. Pilih folder data atau zip game',
  rgssBad: 'Arsip .rgss3a tidak bisa dibaca. Pastikan itu Game.rgss3a dari VX Ace (bukan .rgss2a atau .rgssad)',
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
  timeout: 'Provider terlalu lama menjawab. Coba lagi atau naikkan batas waktu di Pengaturan',
  tooMany: 'Tiga batch gagal berturut-turut. Periksa Pengaturan atau koneksi, lalu lanjutkan',
  exportEmpty: 'Belum ada terjemahan yang bisa diekspor. Terjemahkan dulu di tab Translate',
  urlBad: 'Base URL harus memakai https. Untuk lokal pakai localhost',
  nothing: 'Tidak ada teks yang perlu diterjemahkan. Semua sudah selesai, atau impor tidak menemukan teks',
  emptyImp: 'Impor selesai tapi tidak ada teks yang ditemukan. Sumber Jepang hanya mengambil teks berhuruf Jepang. Bila game berbahasa Inggris, hapus proyek ini lalu impor ulang dengan sumber Inggris',
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
/** Menghapus banyak nilai (berdasarkan key) dalam satu transaksi. */
export async function dbDeleteMany(store, keys) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite'), o = t.objectStore(store);
    keys.forEach((k) => o.delete(k));
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
    const t = db.transaction(['projects', 'entries', 'origFiles', 'settings'], 'readwrite'), es = t.objectStore('entries');
    t.objectStore('projects').delete(id);
    t.objectStore('origFiles').delete(IDBKeyRange.bound(id + ':', id + ':\uffff'));
    if (cur?.value === id) t.objectStore('settings').delete('current');
    // cepat: kalau semua entries milik proyek ini, kosongkan sekaligus; kalau tidak, hapus per key tanpa kursor
    const all = es.count(), mine = es.index('projectId').getAllKeys(IDBKeyRange.only(id));
    mine.onsuccess = () => { if (all.result === mine.result.length) es.clear(); else mine.result.forEach((k) => es.delete(k)); };
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaksi dibatalkan'));
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
/** Semua kategori yang bisa dihasilkan extractor (dipakai menu Pulihkan, karena proyek hasil impor game yang sudah diubah mungkin belum punya kategori itu). */
export const ALL_CATS = ['dialog', 'scroll', 'choice', 'speaker', 'actorname', 'system', 'map', 'plugin', ...Object.keys(DB_FIELDS).map((k) => k.toLowerCase()), 'comment', 'comment-teks', 'comment-label', 'note-tag', 'script-teks'];
/** Tag di field note database yang isinya teks tampil (hanya isi tag yang diterjemahkan, nama tag dan tanda <> tetap). */
export const NOTE_TAGS = ['図鑑特徴'];
const noteTagRe = (tag) => new RegExp('<' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:：]([\\s\\S]*?)>', 'g');
/** String berkutip di kode Ruby (perintah Script): "..." atau '...'. Grup 1 = isi kutip ganda, grup 2 = isi kutip tunggal. */
const rbLit = () => /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
// Kode escape (\C[2], \!, ...) dan tag plugin ASCII seperti <br>, <WordWrap>, <left>. Tag berisi huruf Jepang tidak ikut.
// Selain kode escape pesan, ikut dimasker: pemanggilan fungsi berindeks (if(s[12]), en(s[3]), f(\v[5])), s[n]/v[n], $gameXxx, dan placeholder %1.
const ESC = /\\(?:[A-Za-z]+\[(?:\d+|#[0-9A-Fa-f]{3,8})\]|[A-Za-z]|[{}.|!^$<>\\])|<\/?[A-Za-z][ -;=?-~]{0,40}>|\b[A-Za-z_]\w*\((?=[^)\n]*(?:\[\d+\]|\\[A-Za-z]+\[))(?:[^()\n]|\([^()\n]*\))*\)|\b[sv]\[\d+\]|\$game[A-Za-z]+(?:\.\w+|\[[^\]\n]*\])*|%\d/g;
// Plugin message yang punya word-wrap sendiri. Bila aktif, pemecahan baris manual dimatikan.
const MSG_PLUGIN = /^(YEP_MessageCore|VisuMZ_1_MessageCore)$|word.?wrap|line.?wrap|auto.?wrap|text.?wrap|message.?wrap/i;
/** Daftar nama plugin message aktif dari isi js/plugins.js. */
export function detectMessagePlugins(text) {
  const out = [];
  for (const m of String(text).matchAll(/"name"\s*:\s*"([^"]*)"\s*,\s*"status"\s*:\s*(true|false)/g)) if (m[2] === 'true' && MSG_PLUGIN.test(m[1])) out.push(m[1]);
  return out;
}
/** Config efektif: bila proyek memakai plugin message, batas baris manual dimatikan. */
export const effCfg = (project, cfg) => (project?.msgPlugins?.length ? { ...cfg, wrapWidth: 0, wrapFace: 0 } : cfg);
const JA = /[\u3040-\u30ff\u3400-\u9fff]/;
const ID_W = new Set('yang dan di ke dari untuk dengan tidak ini itu ada saya aku kamu kau kita kami mereka akan sudah belum bisa dapat pada adalah atau juga tapi tetapi karena jika kalau apa siapa bagaimana mengapa kenapa sebuah para oleh lagi saja hanya sangat sekali harus mau ingin punya anda dia ia lebih semua setiap masih telah dalam tentang seperti setelah sebelum ketika saat sini situ sana bukan jangan tolong terima kasih maaf selamat ya dong deh kok'.split(' '));
const EN_W = new Set("the and to of a is are was were you i it that this in on for with not be have has had will would can could my your we he she they them his her but if so what who how why do don't did no yes at as from by an me us just all there here now then when up out about i'm it's you're".split(' '));
/** Tebak bahasa satu teks (kode escape sudah dibuang): 'ja' | 'en' | 'id' | null (tanpa huruf, mis. angka/simbol). */
const srcLabel = (s) => ({ auto: 'Otomatis (Jepang/Inggris)', all: 'Semua teks (bahasa apa pun)', ja: 'Jepang', en: 'Inggris' }[s] || s);
export function detectLang(t) {
  if (JA.test(t)) return 'ja';
  const w = t.toLowerCase().match(/[a-z']+/g);
  if (!w) return null;
  let id = 0, en = 0;
  for (const x of w) {
    if (ID_W.has(x)) id++;
    else if (/^(ber|ter|meng|peng)[a-z]{4,}$|^[a-z]{3,}(kan|nya)$/.test(x)) id += 0.5;
    if (EN_W.has(x)) en++;
  }
  return id > en ? 'id' : 'en';
}
/** Ganti kode escape dengan token ⟦n⟧. Kode di awal dan akhir teks tidak dikirim ke AI (sering dihapus model); dipasang lagi saat unmask. */
const ESC_LEAD = new RegExp('^(?:\\s*(?:' + ESC.source + '))+\\s*'), ESC_TRAIL = new RegExp('(?:\\s*(?:' + ESC.source + '))+\\s*$');
export function maskText(text) {
  let lead = '', trail = '', core = text;
  const a = ESC_LEAD.exec(core); if (a) { lead = a[0]; core = core.slice(lead.length); }
  const b = ESC_TRAIL.exec(core); if (b) { trail = b[0]; core = core.slice(0, core.length - trail.length); }
  if (!core.trim()) { lead = ''; trail = ''; core = text; } // teks hanya berisi kode: perlakukan seperti biasa
  const tokens = [];
  tokens.lead = lead; tokens.trail = trail;
  return { text: core.replace(ESC, (m) => { tokens.push(m); return `⟦${tokens.length - 1}⟧`; }), tokens };
}
/** Kembalikan kode escape. ok=false bila token hilang, duplikat, atau asing. */
export function unmaskText(text, tokens) {
  const seen = new Array(tokens.length).fill(0); let ok = true;
  const out = text.replace(/⟦(\d+)⟧/g, (m, n) => { if (tokens[n] === undefined) { ok = false; return m; } seen[n]++; return tokens[n]; });
  return { ok: ok && seen.every((c) => c === 1), text: (tokens.lead || '') + out + (tokens.trail || '') };
}
/** Teks tanpa kode escape (untuk mengukur panjang baris yang terlihat). */
export const stripEscapes = (s) => s.replace(ESC, '');
/** Lebar tampil satu baris: huruf CJK dihitung 2, \\N/\\V/\\P kira-kira 4, \\I kira-kira 2, kode lain 0. */
export function visWidth(line) {
  let w = 0;
  for (const ch of line.replace(ESC, (m) => (/^\\[NnVvPp]\[/.test(m) ? '0000' : /^\\[Ii]\[/.test(m) ? '00' : ''))) w += ch.charCodeAt(0) >= 0x2e80 ? 2 : 1;
  return w;
}
/** Pecah teks dialog agar tiap baris <= width. Bila semua baris sudah muat, teks tidak diubah (null). */
export function wrapLines(text, width) {
  const lines = text.replace(/^\n+|\n+$/g, '').split('\n');
  if (!width || lines.every((l) => visWidth(l) <= width)) return null;
  const out = []; let cur = '';
  for (const w of lines.join(' ').split(/\s+(?![^<>]*>)/).filter(Boolean)) {
    if (cur && visWidth(cur) + 1 + visWidth(w) > width) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}
const WRAP_KEYS = /^(description|profile)$/;
/** Batas tampil untuk satu entry: {line: maks karakter per baris, lines: maks baris} atau null. */
export function limitFor(e, cfg) {
  let key = ''; try { key = String(JSON.parse(e.path).at(-1)); } catch { /* path tidak ada */ }
  cfg ||= {};
  let line = 0, lines = 0;
  if (e.kind === 'block' && e.category === 'dialog') { line = e.meta?.face ? cfg.wrapFace : cfg.wrapWidth; lines = 4; }
  else if (e.kind === 'field' && e.category !== 'plugin' && WRAP_KEYS.test(key)) { line = cfg.wrapWidth; lines = 2; }
  else if (e.kind === 'field' && e.category !== 'plugin' && /^message\d$/.test(key)) { line = cfg.wrapWidth; lines = 1; }
  return line ? { line, lines } : null;
}
/** Apakah string layak diterjemahkan (bukan kosong/hanya escape; sumber ja harus ada kana/kanji). */
export function isTranslatable(s, src = 'ja') {
  if (typeof s !== 'string') return false;
  const t = s.replace(ESC, '').trim();
  if (src === 'all') return !!t; // semua bahasa: asal tidak kosong/hanya kode escape
  if (src === 'auto') { const l = detectLang(t); return l === 'ja' || l === 'en'; }
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
// ===== 4c. RUBY MARSHAL <-> JSON VIEW (RPG Maker VX Ace .rvdata2) =====
const B64 = {
  enc: (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};
const isAscii = (b) => { for (let i = 0; i < b.length; i++) if (b[i] > 127) return false; return true; };
/**
 * Baca Ruby Marshal 4.8 (.rvdata2) menjadi JSON "view" tanpa kehilangan data:
 * objek -> {__c:Kelas, field:...} (ivar tanpa @), String UTF-8 -> string JS, Hash -> {__h:'i'|'s', ...}, tipe lain -> {__x:...}.
 */
export function marshalToView(u8) {
  if (u8[0] !== 4 || u8[1] !== 8) throw new Error('bukan data Marshal 4.8');
  let p = 2;
  const syms = [], objs = [], utf = new TextDecoder('utf-8'), strict = new TextDecoder('utf-8', { fatal: true });
  const byte = () => { if (p >= u8.length) throw new Error('data terpotong'); return u8[p++]; };
  const long = () => {
    const c = (byte() << 24) >> 24;
    if (c === 0) return 0;
    if (c > 4) return c - 5;
    if (c < -4) return c + 5;
    const n = Math.abs(c); let v = 0;
    for (let i = 0; i < n; i++) v += byte() * 2 ** (8 * i);
    return c > 0 ? v : v - 2 ** (8 * n);
  };
  const raw = (n) => { if (n < 0 || p + n > u8.length) throw new Error('data terpotong'); const b = u8.subarray(p, p + n); p += n; return b; };
  const bytes = () => raw(long());
  const symName = () => {
    let t = byte(), iv = false;
    if (t === 0x49) { iv = true; t = byte(); }
    if (t === 0x3b) { const s = syms[long()]; if (s === undefined) throw new Error('simbol tidak dikenal'); return s; }
    if (t !== 0x3a) throw new Error('simbol tidak valid');
    const name = utf.decode(bytes()); syms.push(name);
    if (iv) for (let n = long(); n-- > 0;) { symName(); r(); }
    return name;
  };
  const strView = (b, iv) => {
    if (iv.length === 1 && iv[0][0] === 'E') {
      if (iv[0][1] === true) { try { return strict.decode(b); } catch { /* bukan UTF-8 valid */ } }
      else if (iv[0][1] === false && isAscii(b)) return { __a: String.fromCharCode(...b) };
    }
    const v = { __s: B64.enc(b) }; if (iv.length) v.__iv = iv; return v;
  };
  const hashView = (pairs, def, withDef) => {
    let v;
    if (pairs.every(([k]) => typeof k === 'number')) { v = { __h: 'i' }; pairs.forEach(([k, x]) => { v[k] = x; }); }
    else if (pairs.every(([k]) => typeof k === 'string' && !k.startsWith('__'))) { v = { __h: 's' }; pairs.forEach(([k, x]) => { v[k] = x; }); }
    else v = { __hp: pairs };
    if (v.__h) {
      const want = pairs.map(([k]) => String(k)), got = Object.keys(v).filter((k) => !k.startsWith('__'));
      if (want.length !== got.length || want.some((k, i) => k !== got[i])) v.__ord = want;
    }
    if (withDef) v.__hd = def;
    return v;
  };
  function body(t, ivp) {
    switch (t) {
      case 0x22: { const b = bytes(); if (ivp) return { str: b, idx: objs.push(null) - 1 }; const v = { __s: B64.enc(b) }; objs.push(v); return v; }
      case 0x66: { const v = { __f: utf.decode(bytes()) }; objs.push(v); return v; }
      case 0x6c: {
        const sign = byte(), n = long() * 2, b = raw(n); let x = 0n;
        for (let i = n - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[i]);
        const v = { __big: (sign === 0x2d ? '-' : '') + x.toString() }; objs.push(v); return v;
      }
      case 0x5b: { const a = []; objs.push(a); for (let n = long(); n-- > 0;) a.push(r()); return a; }
      case 0x7b: case 0x7d: {
        const idx = objs.push(null) - 1, n = long(), pairs = [];
        for (let i = 0; i < n; i++) { const k = r(); pairs.push([k, r()]); }
        const def = t === 0x7d ? r() : null, v = hashView(pairs, def, t === 0x7d); objs[idx] = v; return v;
      }
      case 0x6f: {
        const o = { __c: symName() }; objs.push(o);
        for (let n = long(); n-- > 0;) { const k = symName(); o[k.startsWith('@') ? k.slice(1) : '~' + k] = r(); }
        return o;
      }
      case 0x75: { const cls = symName(), b = bytes(); if (ivp) return { u: cls, b }; const v = { __u: cls, b64: B64.enc(b) }; objs.push(v); return v; }
      case 0x55: { const o = { __U: symName() }; objs.push(o); o.v = r(); return o; }
      case 0x63: case 0x6d: case 0x4d: { const v = { __k: String.fromCharCode(t), n: utf.decode(bytes()) }; objs.push(v); return v; }
      case 0x2f: { const src = bytes(), o = byte(); if (ivp) return { re: src, o }; const v = { __re: B64.enc(src), o }; objs.push(v); return v; }
      default: throw new Error(`tipe Marshal belum didukung: ${String.fromCharCode(t)}`);
    }
  }
  function finish(inner, iv) {
    if (inner && inner.str) { const v = strView(inner.str, iv); objs[inner.idx] = v; return v; }
    if (inner && inner.u) { const v = { __u: inner.u, b64: B64.enc(inner.b) }; if (iv.length) v.__iv = iv; objs.push(v); return v; }
    if (inner && inner.re) { const v = { __re: B64.enc(inner.re), o: inner.o }; if (iv.length) v.__iv = iv; objs.push(v); return v; }
    if (iv.length) { if (inner && typeof inner === 'object' && !Array.isArray(inner)) inner.__iv = iv; else throw new Error('ivar pada tipe ini belum didukung'); }
    return inner;
  }
  function r() {
    const t = byte();
    switch (t) {
      case 0x30: return null;
      case 0x54: return true;
      case 0x46: return false;
      case 0x69: return long();
      case 0x3a: case 0x3b: p--; return { __y: symName() };
      case 0x40: { const i = long(); if (!(i in objs) || objs[i] === null) throw new Error('tautan objek tidak valid'); return objs[i]; }
      case 0x49: {
        if (u8[p] === 0x3a) { p--; return { __y: symName() }; }
        const inner = body(byte(), true), iv = [];
        for (let n = long(); n-- > 0;) { const k = symName(); iv.push([k, r()]); }
        return finish(inner, iv);
      }
      default: return body(t, false);
    }
  }
  return r();
}
const FLO = new DataView(new ArrayBuffer(8));
const isFlonum = (text) => {
  const x = Number(text);
  if (!Number.isFinite(x) || /inf|nan/i.test(text)) return false;
  FLO.setFloat64(0, x); const hi = FLO.getUint32(0), lo = FLO.getUint32(4);
  if (hi === 0 && lo === 0) return true;
  const t = (hi >>> 28) & 7;
  return (t === 3 || t === 4) && !(hi === 0x30000000 && lo === 0);
};
/** Kebalikan marshalToView. Objek tanpa __c yang berbentuk {code,indent,parameters} dianggap RPG::EventCommand. */
export function viewToMarshal(root) {
  let buf = new Uint8Array(1 << 16), n = 0, nObj = 0;
  const symTab = new Map(), floatIdx = new Map(), enc = new TextEncoder();
  const need = (k) => { if (n + k > buf.length) { const nb = new Uint8Array(Math.max(buf.length * 2, n + k)); nb.set(buf.subarray(0, n)); buf = nb; } };
  const w8 = (b) => { need(1); buf[n++] = b; };
  const wRaw = (u) => { need(u.length); buf.set(u, n); n += u.length; };
  const wLong = (x) => {
    if (x === 0) return w8(0);
    if (x > 0 && x < 123) return w8(x + 5);
    if (x < 0 && x > -124) return w8((x - 5) & 255);
    const tmp = []; let v = x;
    for (let i = 1; i <= 4; i++) {
      tmp.push(((v % 256) + 256) % 256); v = Math.floor(v / 256);
      if (v === 0) { w8(i); break; }
      if (v === -1) { w8((-i) & 255); break; }
    }
    tmp.forEach(w8);
  };
  const wSym = (name) => {
    if (symTab.has(name)) { w8(0x3b); return wLong(symTab.get(name)); }
    const b = enc.encode(name), ascii = isAscii(b);
    if (!ascii) w8(0x49);
    w8(0x3a); wLong(b.length); wRaw(b); symTab.set(name, symTab.size);
    if (!ascii) { wLong(1); wSym('E'); w8(0x54); }
  };
  const wStr = (b, iv) => {
    if (iv.length) w8(0x49);
    w8(0x22); wLong(b.length); wRaw(b); nObj++;
    if (iv.length) { wLong(iv.length); for (const [k, x] of iv) { wSym(k); w(x); } }
  };
  const CMD_KEYS = 'code,indent,parameters';
  function wObj(v) {
    if ('__y' in v) return wSym(v.__y);
    if ('__f' in v) {
      const flo = isFlonum(v.__f);
      if (flo && floatIdx.has(v.__f)) { w8(0x40); return wLong(floatIdx.get(v.__f)); }
      if (flo) floatIdx.set(v.__f, nObj);
      nObj++; const b = enc.encode(v.__f); w8(0x66); wLong(b.length); return wRaw(b);
    }
    if ('__big' in v) {
      let x = BigInt(v.__big); const neg = x < 0n, bs = []; if (neg) x = -x;
      while (x > 0n) { bs.push(Number(x & 255n)); x >>= 8n; }
      if (bs.length % 2) bs.push(0);
      nObj++; w8(0x6c); w8(neg ? 0x2d : 0x2b); wLong(bs.length / 2); return bs.forEach(w8);
    }
    if ('__s' in v) return wStr(B64.dec(v.__s), v.__iv || []);
    if ('__a' in v) return wStr(Uint8Array.from(v.__a, (c) => c.charCodeAt(0)), [['E', false]]);
    if ('__u' in v || '__re' in v) {
      const u = '__u' in v, b = B64.dec(u ? v.b64 : v.__re), iv = v.__iv || [];
      if (iv.length) w8(0x49);
      if (u) { w8(0x75); wSym(v.__u); } else w8(0x2f);
      wLong(b.length); wRaw(b); if (!u) w8(v.o);
      if (iv.length) { wLong(iv.length); for (const [k, x] of iv) { wSym(k); w(x); } }
      nObj++; return undefined;
    }
    if ('__U' in v) { w8(0x55); wSym(v.__U); nObj++; return w(v.v); }
    if ('__k' in v) { const b = enc.encode(v.n); nObj++; w8(v.__k.charCodeAt(0)); wLong(b.length); return wRaw(b); }
    if ('__h' in v || '__hp' in v) {
      const def = '__hd' in v; nObj++; w8(def ? 0x7d : 0x7b);
      if (v.__hp) { wLong(v.__hp.length); for (const [k, x] of v.__hp) { w(k); w(x); } }
      else {
        const keys = v.__ord || Object.keys(v).filter((k) => !k.startsWith('__'));
        wLong(keys.length); for (const k of keys) { w(v.__h === 'i' ? Number(k) : k); w(v[k]); }
      }
      return def ? w(v.__hd) : undefined;
    }
    let cls = v.__c; const keys = Object.keys(v).filter((k) => k !== '__c');
    if (!cls && [...keys].sort().join() === CMD_KEYS) cls = 'RPG::EventCommand';
    if (!cls) throw new Error('objek tanpa kelas (__c)');
    if (v.__iv) throw new Error('ivar pada objek belum didukung');
    nObj++; w8(0x6f); wSym(cls); wLong(keys.length);
    for (const k of keys) { wSym(k.startsWith('~') ? k.slice(1) : '@' + k); w(v[k]); }
    return undefined;
  }
  function w(v) {
    if (v === null || v === undefined) return w8(0x30);
    if (v === true) return w8(0x54);
    if (v === false) return w8(0x46);
    if (typeof v === 'number') {
      if (!Number.isInteger(v)) throw new Error('angka desimal harus berbentuk {__f}');
      if (v >= -(2 ** 30) && v < 2 ** 30) { w8(0x69); return wLong(v); }
      return wObj({ __big: String(v) });
    }
    if (typeof v === 'string') return wStr(enc.encode(v), [['E', true]]);
    if (Array.isArray(v)) { nObj++; w8(0x5b); wLong(v.length); return v.forEach(w); }
    return wObj(v);
  }
  w8(4); w8(8); w(root);
  return buf.slice(0, n);
}

/** Path file -> 'data/X.json' atau 'www/data/X.json'; null bila bukan JSON langsung di folder data. */
const ACE_FILES = /^(System|Map\d+|CommonEvents|Troops|Actors|Classes|Skills|Items|Weapons|Armors|Enemies|States)\.rvdata2$/i;
export function normalizeDataPath(p) {
  const a = p.replace(/\\/g, '/').split('/');
  if (a.length >= 2 && /^data$/i.test(a.at(-2)) && ACE_FILES.test(a.at(-1))) return 'Data/' + a.at(-1);
  const i = a.lastIndexOf('data');
  if (i < 0 || i !== a.length - 2 || !/\.json$/i.test(a[i + 1])) return null;
  return (a[i - 1] === 'www' ? 'www/' : '') + 'data/' + a[i + 1];
}
/** Baca tabel arsip RGSS3A (VX Ace). Memakai File.slice agar hemat memori. */
const rgssWord = (v, k) => (v ^ k) >>> 0;
async function parseRgss3a(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12 || String.fromCharCode(...head.slice(0, 6)) !== 'RGSSAD' || head[7] !== 3) throw new Error(UI.rgssBad);
  const key = (Math.imul(new DataView(head.buffer).getUint32(8, true), 9) + 3) >>> 0;
  let size = Math.min(file.size, 1 << 20), ents;
  for (;;) {
    const buf = new Uint8Array(await file.slice(12, 12 + size).arrayBuffer()), dv = new DataView(buf.buffer); let pos = 0, ok = true; ents = [];
    for (;;) {
      if (pos + 4 > buf.length) { ok = false; break; }
      const offset = rgssWord(dv.getUint32(pos, true), key);
      if (offset === 0) break;
      if (pos + 16 > buf.length) { ok = false; break; }
      const len = rgssWord(dv.getUint32(pos + 4, true), key), fk = rgssWord(dv.getUint32(pos + 8, true), key), nl = rgssWord(dv.getUint32(pos + 12, true), key);
      if (nl > 1024 || pos + 16 + nl > buf.length) { ok = false; break; }
      const nb = buf.slice(pos + 16, pos + 16 + nl);
      for (let i = 0; i < nl; i++) nb[i] ^= (key >>> (8 * (i % 4))) & 255;
      ents.push({ nameRaw: nb, name: new TextDecoder().decode(nb).replace(/\\/g, '/'), offset, len, fk });
      pos += 16 + nl;
    }
    if (ok) break;
    if (12 + size >= file.size) throw new Error(UI.rgssBad);
    size = Math.min(file.size - 12, size * 4);
  }
  if (ents.some((e) => e.offset + e.len > file.size)) throw new Error(UI.rgssBad);
  return { head, key, ents };
}
/** XOR data RGSS3A (simetris: dipakai untuk dekripsi dan enkripsi). */
function rgssXor(u8, k) {
  const out = new Uint8Array(u8.length), a = new DataView(u8.buffer, u8.byteOffset, u8.length), o = new DataView(out.buffer); let i = 0;
  for (; i + 4 <= u8.length; i += 4) { o.setUint32(i, (a.getUint32(i, true) ^ k) >>> 0, true); k = (Math.imul(k, 7) + 3) >>> 0; }
  for (let j = 0; i < u8.length; i++, j += 8) out[i] = u8[i] ^ ((k >>> j) & 255);
  return out;
}
/** Ambil hanya Data/*.rvdata2 dari arsip. */
async function readRgss3a(file) {
  const { ents } = await parseRgss3a(file);
  return ents.filter((e) => /^data\/[^/]+\.rvdata2$/i.test(e.name)).map((e) => {
    const readBin = async () => rgssXor(new Uint8Array(await file.slice(e.offset, e.offset + e.len).arrayBuffer()), e.fk);
    return { path: e.name, read: async () => new TextDecoder().decode(await readBin()), readBin };
  });
}
/**
 * Buat ulang arsip: semua isi disalin apa adanya (tetap terenkripsi, tidak dimuat ke memori),
 * kecuali file di `repl` ({name, data}) yang diganti. Hasilnya Blob.
 */
async function rebuildRgss3a(file, repl) {
  const { head, key, ents } = await parseRgss3a(file);
  const map = new Map(repl.map((r) => [r.name.replace(/\\/g, '/').toLowerCase(), r.data])), used = new Set();
  const items = ents.map((e) => {
    const k = e.name.toLowerCase(), nd = map.get(k);
    if (nd) used.add(k);
    return { e, nd };
  });
  const tblLen = items.reduce((s, x) => s + 16 + x.e.nameRaw.length, 0) + 4, tbl = new Uint8Array(tblLen), dv = new DataView(tbl.buffer), parts = [];
  let pos = 0, off = 12 + tblLen, run = null;
  const flush = () => { if (run) { parts.push(file.slice(run[0], run[1])); run = null; } };
  for (const { e, nd } of items) {
    const len = nd ? nd.length : e.len;
    dv.setUint32(pos, rgssWord(off, key), true); dv.setUint32(pos + 4, rgssWord(len, key), true);
    dv.setUint32(pos + 8, rgssWord(e.fk, key), true); dv.setUint32(pos + 12, rgssWord(e.nameRaw.length, key), true);
    for (let i = 0; i < e.nameRaw.length; i++) tbl[pos + 16 + i] = e.nameRaw[i] ^ ((key >>> (8 * (i % 4))) & 255);
    pos += 16 + e.nameRaw.length; off += len;
    if (nd) { flush(); parts.push(rgssXor(nd, e.fk)); }
    else if (run && run[1] === e.offset) run[1] = e.offset + e.len; // gabung data berurutan jadi satu irisan besar (jauh lebih cepat diunduh)
    else { flush(); run = [e.offset, e.offset + e.len]; }
  }
  flush();
  dv.setUint32(pos, key, true); // penanda akhir: 0 xor key
  const missing = [...map.keys()].filter((k) => !used.has(k));
  return { blob: new Blob([head, tbl, ...parts], { type: 'application/octet-stream' }), replaced: used.size, missing };
}
async function collectSources(files) {
  const list = [];
  for (const f of files) if (/\.rgss3a$/i.test(f.name)) list.push(...await readRgss3a(f));
  files = files.filter((f) => !/\.rgss3a$/i.test(f.name));
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const z = await readZip(files[0]);
    z.entries.forEach((e) => list.push({ path: e.name, read: async () => new TextDecoder().decode(await z.read(e)), readBin: () => z.read(e) }));
  } else for (const f of files) list.push({ path: f.webkitRelativePath || f.name, read: () => f.text(), readBin: async () => new Uint8Array(await f.arrayBuffer()) });
  const has = (re) => list.some((i) => re.test(i.path));
  const data = new Map();
  for (const i of list) { const k = normalizeDataPath(i.path); if (k) data.set(k, i); }
  const engine = has(/(^|\/)js\/rmmz_core\.js$/) ? 'MZ' : has(/(^|\/)js\/rpg_core\.js$/) ? 'MV' : [...data.keys()].some((k) => /\.rvdata2$/i.test(k)) ? 'VX Ace' : null;
  return { engine, data, plugins: list.find((i) => /(^|\/)js\/plugins\.js$/.test(i.path)) || null, scripts: list.find((i) => /(^|\/)data\/scripts\.rvdata2$/i.test(i.path.replace(/\\/g, '/'))) || null };
}
/**
 * Ekstrak unit teks dari satu file JSON sesuai whitelist.
 * @returns {Array} entry tanpa id/projectId/hash
 */
/**
 * Daftar aman plugin (opsional, satu entri per baris):
 *   mz Plugin.command.arg  -> argumen perintah plugin MZ (kode 357)
 *   mv Command             -> teks setelah nama perintah plugin MV (kode 356), dianggap satu string
 *   param Plugin.key       -> parameter plugin di js/plugins.js (hanya string biasa)
 */
export function parseAllow(text = '') {
  const o = { mz: [], mv: [], param: [] };
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^(mz|mv|param)\s+(\S.*)$/i);
    if (m) o[m[1].toLowerCase()].push(m[2].trim());
  }
  return o;
}
const allowSets = (a) => ({ mz: new Set(a?.mz), mv: new Set(a?.mv), param: new Set(a?.param) });
const looksStruct = (v) => /^\s*[\[{]/.test(v);
/** Pecah js/plugins.js menjadi {pre, arr, post}; null bila bukan array JSON murni. */
export function parsePluginsJs(text) {
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b < a) return null;
  try { const arr = JSON.parse(text.slice(a, b + 1)); return Array.isArray(arr) ? { pre: text.slice(0, a), post: text.slice(b + 1), arr } : null; } catch { return null; }
}
export const buildPluginsJs = (pj, arr) => pj.pre + '[\n' + arr.map((x) => JSON.stringify(x)).join(',\n') + '\n]' + pj.post;
const normPluginsPath = (p) => ((p.replace(/\\/g, '/').match(/(?:^|\/)(www\/)?js\/plugins\.js$/) || [])[1] || '') + 'js/plugins.js';
// Event: 320 ganti nama, 324 ganti nickname, 325 ganti profil aktor (parameters[1] = teks).
const NAME_CODES = new Set([320, 324, 325]);
// System: daftar tipe berupa array string.
/**
 * Diagnostik (hanya baca): buka Scripts.rvdata2 (daftar [id, nama, kode zlib]), dekompres tiap script,
 * lalu cari string di dalam tanda kutip yang mirip kalimat. Komentar (#, =begin/=end) dilewati.
 * @returns {{total:number, found:Array}} found = [[namaScript, jumlah, contoh[]]] terbanyak dulu
 */
export async function scanScripts(u8) {
  const root = marshalToView(u8);
  if (!Array.isArray(root)) throw new Error('format Scripts.rvdata2 tidak dikenal');
  const dec = new TextDecoder('utf-8'), strOf = (v) => (typeof v === 'string' ? v : v?.__a ?? (v?.__s ? dec.decode(B64.dec(v.__s)) : ''));
  const sentence = (x) => { const t = x.replace(ESC, '').trim(); return !!t && !/[=$@{}]|\w_\w/.test(t) && (JA.test(t) || (t.match(/[A-Za-z']+/g) || []).length >= 3) && detectLang(t) !== 'id'; };
  const found = [];
  for (const e of root) {
    if (!Array.isArray(e) || !e[2]?.__s) continue;
    let code;
    try { code = dec.decode(await new Response(new Blob([B64.dec(e[2].__s)]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); } catch { continue; }
    let n = 0, inBlock = false; const samples = [];
    for (const line of code.split(/\r?\n/)) {
      if (/^=begin/.test(line)) { inBlock = true; continue; }
      if (/^=end/.test(line)) { inBlock = false; continue; }
      if (inBlock || /^\s*#/.test(line)) continue;
      for (const m of line.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
        const t = (m[1] ?? m[2]).trim();
        if (t && sentence(t)) { n++; if (samples.length < 2) samples.push(t.slice(0, 50)); }
      }
    }
    if (n) found.push([strOf(e[1]) || `#${e[0]}`, n, samples]);
  }
  return { total: root.length, found: found.sort((a, b) => b[1] - a[1]) };
}
/**
 * Diagnostik: cari string mirip kalimat yang TIDAK diambil extractor, dikelompokkan per jenis perintah event
 * (atau per field data). Hanya membaca. covered = kumpulan baris teks yang sudah diambil dari file ini.
 */
export function scanGaps(path, json, covered) {
  const base = path.split('/').pop().replace(/\.(json|rvdata2)$/i, ''), groups = new Map();
  const note = (label, t) => { const g = groups.get(label) || { n: 0, samples: [] }; g.n++; if (g.samples.length < 2) g.samples.push(t.replace(/\s+/g, ' ').slice(0, 50)); groups.set(label, g); };
  const sentence = (x) => { const t = x.replace(ESC, '').trim(); return !!t && !/[=$@{}]|\w_\w/.test(t) && (JA.test(t) || (t.match(/[A-Za-z']+/g) || []).length >= 3) && detectLang(t) !== 'id'; };
  const seen = (x) => covered.has(x.trim());
  const label = (c) => `kode ${c.code} (${CODE_NAME[c.code] || 'lainnya'})`;
  const walk = (v, key, cmd) => {
    if (typeof v === 'string') {
      if (seen(v)) return;
      if (cmd && (cmd.code === 355 || cmd.code === 655)) {
        for (const m of v.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) { const t = (m[1] ?? m[2]).trim(); if (t && sentence(t) && !seen(t)) note(label(cmd), t); }
        return;
      }
      if (!cmd && /^(variables|switches|name)$/.test(key)) return; // label internal editor, tidak tampil di game
      if (sentence(v)) note(cmd ? label(cmd) : `${base}.${key}`, v);
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, key, cmd)); return; }
    if (!v || typeof v !== 'object') return;
    const c = typeof v.code === 'number' && Array.isArray(v.parameters) ? v : cmd;
    for (const k of Object.keys(v)) if (!k.startsWith('__')) walk(v[k], /^\d+$/.test(k) ? key : k, c);
  };
  walk(json, '', null);
  return groups;
}
const SYS_LISTS = ['skillTypes', 'weaponTypes', 'armorTypes', 'equipTypes', 'elements'];
const SYS_LISTS_ACE = ['skill_types', 'weapon_types', 'armor_types', 'elements'];
/**
 * Klasifikasi baris Comment. false = lewati (kode/konfigurasi). 'comment' = kemungkinan teks tampil
 * berkode escape pesan seperti \\>. 'comment-teks' = kalimat panjang tanpa kode. 'comment-label' = label pendek, biasanya catatan developer. Dua yang terakhir lebih berisiko: bisa jadi konfigurasi script.
 */
export function isCommentText(s, src = 'ja') {
  if (!isTranslatable(s, src)) return false;
  const t = s.replace(ESC, '').trim();
  if (/[=$@{}]|\w_\w/.test(t)) return false;
  const words = (t.match(/[A-Za-z']+/g) || []).length, ja = JA.test(t), esc = s.replace(ESC, '') !== s;
  const nonLatin = src === 'all' && /[^\x00-\x7f]/.test(t);
  if (!ja && !nonLatin && words < 3) return false;
  const long = ja ? t.length >= 10 || /[。！？…」』]$/.test(t) : words >= 4;
  return esc ? 'comment' : long ? 'comment-teks' : 'comment-label';
}
/** Apakah string di dalam script mirip kalimat untuk pemain (bukan kunci/kode). */
const scriptSentence = (x, src = 'ja') => {
  const t = x.replace(ESC, '').trim();
  if (!t || /[=$@{}]|\w_\w/.test(t)) return false;
  if (src === 'all') return /[^\x00-\x7f]/.test(t) || (t.match(/[A-Za-z']+/g) || []).length >= 2;
  return (JA.test(t) || (t.match(/[A-Za-z']+/g) || []).length >= 3) && detectLang(t) !== 'id';
};
export function extractFile(path, json, { src = 'ja', allow = null } = {}) {
  const A = allowSets(allow);
  const base = path.split('/').pop().replace(/\.(json|rvdata2)$/i, ''), ace = /\.rvdata2$/i.test(path), out = [];
  const add = (p, kind, category, original, meta = {}, lineCount = 1) => {
    if (!isTranslatable(original, src)) return;
    out.push({ file: path, path: JSON.stringify(p), kind, category, original, translation: '', status: 'pending', order: out.length, lineCount, meta, source: src === 'auto' ? detectLang(original.replace(ESC, '').trim()) : src === 'all' ? (JA.test(original) ? 'ja' : detectLang(original.replace(ESC, '').trim()) || 'all') : src, error: '' });
  };
  // Kalimat di dalam string berkutip pada perintah Script (355/655) dan Control Variables bertipe script (122).
  // path = [..., 'parameters', k, '#s', urutan literal]; yang diganti hanya isi literal ke-urutan.
  const scriptLits = (str, p) => {
    let n = 0;
    for (const m of str.matchAll(rbLit())) {
      const raw = m[1] ?? m[2];
      if (scriptSentence(raw, src)) add([...p, '#s', n], 'field', 'script-teks', raw.trim(), { lead: raw.slice(0, raw.length - raw.trimStart().length), trail: raw.slice(raw.trimEnd().length) });
      n++;
    }
  };
  const scanList = (list, p) => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length; i++) {
      const c = list[i], P = c.parameters || [];
      if (c.code === 101 || c.code === 105) {
        const body = c.code === 101 ? 401 : 405, lines = []; let j = i + 1;
        if (c.code === 101 && typeof P[4] === 'string') add([...p, i, 'parameters', 4], 'speaker', 'speaker', P[4]);
        while (list[j]?.code === body) { lines.push(list[j].parameters[0]); j++; }
        if (lines.length) add([...p, i], 'block', body === 401 ? 'dialog' : 'scroll', lines.join('\n'), { speaker: P[4] || '', face: !!P[0] }, lines.length);
        i = j - 1;
      } else if (c.code === 102 && Array.isArray(P[0])) P[0].forEach((t, k) => add([...p, i, 'parameters', 0, k], 'choice', 'choice', t));
      else if ((c.code === 108 || c.code === 408) && typeof P[0] === 'string' && isCommentText(P[0], src)) add([...p, i, 'parameters', 0], 'field', isCommentText(P[0], src), P[0]);
      else if (NAME_CODES.has(c.code) && typeof P[1] === 'string') add([...p, i, 'parameters', 1], 'field', 'actorname', P[1]);
      else if (c.code === 357 && A.mz.size && P[3] && typeof P[3] === 'object') {
        for (const k of Object.keys(P[3])) if (typeof P[3][k] === 'string' && !looksStruct(P[3][k]) && A.mz.has(`${P[0]}.${P[1]}.${k}`)) add([...p, i, 'parameters', 3, k], 'field', 'plugin', P[3][k]);
      } else if (c.code === 356 && A.mv.size && typeof P[0] === 'string') {
        const m = P[0].match(/^(\S+)\s+(\S[\s\S]*)$/);
        if (m && A.mv.has(m[1])) add([...p, i, 'parameters', 0], 'field', 'plugin', m[2], { prefix: P[0].slice(0, P[0].length - m[2].length) });
      } else if ((c.code === 355 || c.code === 655) && typeof P[0] === 'string') scriptLits(P[0], [...p, i, 'parameters', 0]);
      else if (c.code === 122 && P[3] === 4 && typeof P[4] === 'string') scriptLits(P[4], [...p, i, 'parameters', 4]);
    }
  };
  const walk = (v, p) => {
    if (typeof v === 'string') add(p, 'field', 'system', v);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...p, i]));
    else if (v && typeof v === 'object') Object.keys(v).filter((k) => !k.startsWith('__')).forEach((k) => walk(v[k], [...p, k]));
  };
  const pages = (pg, p) => (pg || []).forEach((pa, pi) => scanList(pa?.list, [...p, 'pages', pi, 'list']));
  if (base === 'System') {
    ['gameTitle', 'currencyUnit', 'game_title', 'currency_unit'].forEach((k) => add([k], 'field', 'system', json[k]));
    walk(json.terms, ['terms']);
    (ace ? SYS_LISTS_ACE : SYS_LISTS).forEach((k) => Array.isArray(json[k]) && walk(json[k], [k]));
  } else if (/^Map\d+$/.test(base)) {
    add([ace ? 'display_name' : 'displayName'], 'field', 'map', ace ? json.display_name : json.displayName);
    if (ace) Object.keys(json.events || {}).filter((k) => !k.startsWith('__')).forEach((k) => json.events[k] && pages(json.events[k].pages, ['events', k]));
    else (json.events || []).forEach((ev, ei) => ev && pages(ev.pages, ['events', ei]));
  } else if (base === 'CommonEvents') (json || []).forEach((ev, i) => ev && scanList(ev.list, [i, 'list']));
  else if (base === 'Troops') (json || []).forEach((t, i) => t && pages(t.pages, [i]));
  else if (base === 'plugins.js' && Array.isArray(json)) json.forEach((pl, i) => {
    if (!pl || pl.status === false || !pl.parameters) return;
    for (const k of Object.keys(pl.parameters)) if (typeof pl.parameters[k] === 'string' && !looksStruct(pl.parameters[k]) && A.param.has(`${pl.name}.${k}`)) add([i, 'parameters', k], 'field', 'plugin', pl.parameters[k]);
  });
  else if (DB_FIELDS[base]) (json || []).forEach((it, i) => {
    if (!it) return;
    DB_FIELDS[base].forEach((f) => add([i, f], 'field', base.toLowerCase(), it[f]));
    if (typeof it.note !== 'string') return;
    for (const tag of NOTE_TAGS) {
      let n = 0;
      for (const m of it.note.matchAll(noteTagRe(tag))) {
        const raw = m[1];
        add([i, 'note', tag, n], 'field', 'note-tag', raw.trim().replace(/\r\n/g, '\n'), { lead: raw.slice(0, raw.length - raw.trimStart().length), trail: raw.slice(raw.trimEnd().length), crlf: raw.includes('\r\n') });
        n++;
      }
    }
  });
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
    if (c.code === 402 && c.indent === n && c.parameters?.[0] === k && c.parameters?.[1] === oldText) c.parameters[1] = newText;
  }
}
/**
 * Terapkan terjemahan ke JSON (diubah di tempat). Blok dialog dari indeks terbesar ke terkecil dalam satu list.
 * @param {*} json hasil JSON.parse file asli
 * @param {Array} entries entri milik file ini (yang tidak done/edited dilewati)
 * @param {string[]} problems diisi bila path tidak cocok
 */
export function applyTranslations(json, entries, problems = [], opts = {}) {
  const blocks = new Map(), isObj = (v) => v !== null && typeof v === 'object', nz = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
  // Entri yang posisinya tidak cocok dengan file asli dicatat (opts.bad) dan dilewati, bukan menggagalkan seluruh patch.
  const fail = (e, msg) => { problems.push(`${e.file} ${e.path}: ${msg}`); opts.bad?.add(e); };
  for (const e of entries.filter(isApplicable)) { try {
    const p = JSON.parse(e.path);
    if (e.kind === 'block') { const k = JSON.stringify(p.slice(0, -1)); if (!blocks.has(k)) blocks.set(k, []); blocks.get(k).push({ p, e }); continue; }
    if (e.category === 'script-teks') {
      const holderP = p.slice(0, -2), nth = p.at(-1), holder = getAt(json, holderP.slice(0, -1)), hk = holderP.at(-1);
      if (!isObj(holder) || typeof holder[hk] !== 'string') { fail(e, 'script tidak cocok dengan file asli'); continue; }
      let idx = -1, hit = false;
      holder[hk] = holder[hk].replace(rbLit(), (all, d) => {
        idx++; if (idx !== nth) return all;
        hit = true;
        const dq = d !== undefined;
        let t = e.translation.replace(/\s*\n\s*/g, ' ').trim();
        t = dq ? t.replace(/"/g, "'") : t.replace(/'/g, '’');
        t = t.replace(/#(?=[{$@])/g, '').replace(/\\+$/, '');
        const q = dq ? '"' : "'";
        return q + (e.meta?.lead || '') + t + (e.meta?.trail || '') + q;
      });
      if (!hit) fail(e, `string ke-${nth} tidak ditemukan di file asli`);
      continue;
    }
    if (e.category === 'note-tag') {
      // path = [..., indeks, 'note', namaTag, urutan]; hanya isi tag ke-urutan yang diganti
      const noteP = p.slice(0, -2), tag = p.at(-2), nth = p.at(-1), holder = getAt(json, noteP.slice(0, -1)), nk = noteP.at(-1);
      if (!isObj(holder) || typeof holder[nk] !== 'string') { fail(e, 'note tidak cocok dengan file asli'); continue; }
      let idx = -1, hit = false;
      holder[nk] = holder[nk].replace(noteTagRe(tag), (all, raw) => {
        idx++; if (idx !== nth) return all;
        hit = true;
        let t = e.translation.replace(/[<>]/g, '').trim();
        if (e.meta?.crlf) t = t.replace(/\r?\n/g, '\r\n');
        return all.slice(0, all.length - raw.length - 1) + (e.meta?.lead || '') + t + (e.meta?.trail || '') + '>';
      });
      if (!hit) fail(e, `tag ${tag} ke-${nth} tidak ditemukan di file asli`);
      continue;
    }
    const parent = getAt(json, p.slice(0, -1)), key = p.at(-1);
    // parent harus objek/array: kalau berupa string, parent[0] adalah huruf pertamanya (bertipe string) dan penugasan akan error
    if (!isObj(parent) || typeof parent[key] !== 'string') { fail(e, 'path tidak cocok dengan file asli'); continue; }
    const old = parent[key];
    // Pengaman: pilihan di posisi ini harus sama dengan teks asli entri, supaya terjemahan tidak masuk ke pilihan lain
    if (e.kind === 'choice' && nz(old) !== nz(e.original)) { fail(e, 'teks asli di posisi ini berbeda (posisi bergeser)'); continue; }
    parent[key] = e.kind === 'choice' || /^comment/.test(e.category) ? e.translation.replace(/\s*\n\s*/g, ' ') : e.category === 'plugin' ? (e.meta?.prefix || '') + e.translation.replace(/\s*\n\s*/g, ' ').trim() : e.translation;
    if (e.kind === 'field' && e.category !== 'plugin' && opts.wrap && WRAP_KEYS.test(String(key))) {
      const w = wrapLines(parent[key], opts.wrap.width);
      if (w) { parent[key] = w.join('\n'); if (opts.stats) opts.stats.wrapped++; }
      if (opts.stats && parent[key].split('\n').length > 2) opts.stats.long++;
    }
    if (e.kind === 'choice') sync402(getAt(json, p.slice(0, -4)), p.at(-4), p.at(-1), old, parent[key]);
  } catch (x) { fail(e, x.message || String(x)); } }
  for (const [k, arr] of blocks) {
    const list = getAt(json, JSON.parse(k));
    arr.sort((a, b) => b.p.at(-1) - a.p.at(-1));
    for (const { p, e } of arr) { try {
      const i = p.at(-1), head = Array.isArray(list) ? list[i] : null, body = head?.code === 101 ? 401 : head?.code === 105 ? 405 : 0;
      if (!body) { fail(e, 'header blok tidak cocok dengan file asli'); continue; }
      let j = i + 1; while (list[j]?.code === body) j++;
      // Pengaman: isi blok di posisi ini harus sama dengan teks asli entri, supaya dialog tidak tertimpa ke blok lain
      if (nz(list.slice(i + 1, j).map((c) => c.parameters?.[0]).join('\n')) !== nz(e.original)) { fail(e, 'teks asli di posisi ini berbeda (posisi bergeser)'); continue; }
      let lines = e.translation.replace(/^\n+|\n+$/g, '').split('\n');
      if (body === 401 && opts.wrap) {
        const face = typeof head.parameters?.[0] === 'string' && head.parameters[0] !== '';
        const w = wrapLines(e.translation, face ? opts.wrap.face : opts.wrap.width);
        if (w) { lines = w; if (opts.stats) opts.stats.wrapped++; }
      }
      list.splice(i + 1, j - i - 1, ...lines.map((t) => ({ code: body, indent: head.indent, parameters: [t] })));
    } catch (x) { fail(e, x.message || String(x)); } }
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
export function diffGuard(orig, next, file = 'data/X.json', allow = null) {
  const probs = [], allowS = new Set(), allowB = new Set(), allowN = new Set(), allowL = new Set();
  // Proyek lama menyimpan indeks array System.terms sebagai string; samakan jadi angka.
  const norm = (path) => JSON.stringify(JSON.parse(path).map((k) => (typeof k === 'string' && /^\d+$/.test(k) ? Number(k) : k)));
  for (const e of extractFile(file, orig, { src: 'en', allow })) {
    // note-tag: yang boleh berubah hanya isi tag di dalam string note; path note-nya didaftarkan terpisah
    if (e.category === 'script-teks') allowL.add(norm(JSON.stringify(JSON.parse(e.path).slice(0, -2))));
    else if (e.category === 'note-tag') allowN.add(norm(JSON.stringify(JSON.parse(e.path).slice(0, -2))));
    else (e.kind === 'block' ? allowB : allowS).add(norm(e.path));
  }
  const maskLit = (x) => x.replace(rbLit(), (all, d) => (d !== undefined ? '""' : "''"));
  const maskNote = (x) => NOTE_TAGS.reduce((acc, tag) => acc.replace(noteTagRe(tag), (all, raw) => all.slice(0, all.length - raw.length - 1) + '>'), x);
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
    if (t === 'string') {
      if (a === b || allowS.has(JSON.stringify(p))) return;
      if (allowL.has(JSON.stringify(p))) { if (maskLit(a) !== maskLit(b)) bad(p, 'bagian script di luar isi string berubah'); return; }
      if (allowN.has(JSON.stringify(p))) { if (maskNote(a) !== maskNote(b)) bad(p, 'bagian note di luar isi tag berubah'); return; }
      bad(p, 'teks di luar whitelist berubah'); return;
    }
    if (t === 'array') {
      if (key === 'list' && a.every(isCmd) && b.every(isCmd)) return cmpList(a, b, p);
      if (a.length !== b.length) return bad(p, 'panjang array berubah');
      return a.forEach((x, i) => cmp(x, b[i], [...p, i]));
    }
    if (t === 'object') {
      const ka = Object.keys(a).sort();
      if (!sameDeep(ka, Object.keys(b).sort())) return bad(p, 'key berubah');
      if (a.code === 402 && typeof a.parameters?.[1] === 'string') allowS.add(JSON.stringify([...p, 'parameters', 1]));
      return ka.forEach((k) => cmp(a[k], b[k], [...p, /^\d+$/.test(k) ? Number(k) : k], k));
    }
    if (a !== b) bad(p, 'nilai berubah');
  };
  cmp(orig, next, []);
  return probs;
}
/** Perintah event baru (baris 401/405 hasil pemecahan) diberi kelas RPG::EventCommand agar bisa ditulis ke rvdata2. */
function fixAceCmds(v) {
  if (Array.isArray(v)) { v.forEach((x, i) => { if (isCmd(x) && !x.__c && Object.keys(x).length === 3) v[i] = { __c: 'RPG::EventCommand', ...x }; fixAceCmds(v[i]); }); }
  else if (v && typeof v === 'object') Object.values(v).forEach(fixAceCmds);
}
/**
 * Bangun patch dari JSON asli dan entries (tanpa IndexedDB). Entry pending/error dilewati.
 * @param {{path:string,text:string}[]} files origFiles
 * @returns {{ok:boolean, empty?:boolean, problems:string[], files:{name:string,data:Uint8Array}[], report:string, stat:object}}
 */
export function buildPatch(files, entries, { model = '', date = new Date(), wrap = null, notes = [], allow = null } = {}) {
  const byFile = new Map(), out = [], problems = [], warnings = [], badAll = [], stat = { files: 0, applied: 0, pending: 0, error: 0, skipped: 0, wrapped: 0, long: 0, mismatch: 0 };
  for (const e of entries) {
    if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e);
    if (e.status === 'pending' || e.status === 'translating') stat.pending++; else if (e.status === 'error') stat.error++; else if (e.status === 'skipped') stat.skipped++;
  }
  for (const f of files) {
    const es = (byFile.get(f.path) || []).filter(isApplicable);
    if (!es.length) continue;
    const isPl = /(^|\/)js\/plugins\.js$/.test(f.path); let orig, work, pj = null;
    try {
      if (isPl) { pj = parsePluginsJs(f.text); if (!pj) throw new Error('x'); orig = pj.arr; work = JSON.parse(JSON.stringify(pj.arr)); }
      else { orig = JSON.parse(f.text); work = JSON.parse(f.text); }
    } catch { problems.push(`${f.path}: file asli tidak bisa dibaca`); continue; }
    const fresh = () => (isPl ? JSON.parse(JSON.stringify(pj.arr)) : JSON.parse(f.text));
    let pr = [], bad = new Set(), st = { wrapped: 0, long: 0 }, use = es;
    applyTranslations(work, use, pr, { wrap, stats: st, bad });
    if (bad.size) { // buang entri yang posisinya tak cocok, terapkan sisanya ke salinan bersih
      warnings.push(...pr); badAll.push(...bad); stat.mismatch += bad.size;
      use = es.filter((x) => !bad.has(x)); work = fresh(); pr = []; st = { wrapped: 0, long: 0 };
      applyTranslations(work, use, pr, { wrap, stats: st, bad: new Set() });
    }
    stat.wrapped += st.wrapped; stat.long += st.long;
    if (!use.length) continue;
    const text = isPl ? buildPluginsJs(pj, work) : JSON.stringify(work); let re = null;
    try { re = isPl ? parsePluginsJs(text)?.arr : JSON.parse(text); if (!re) throw new Error('x'); } catch { pr.push(`${f.path}: hasil tidak bisa dibaca ulang`); }
    if (!pr.length) pr.push(...diffGuard(orig, re, f.path, allow));
    let data = null;
    if (!pr.length && /\.rvdata2$/i.test(f.path)) {
      try {
        const w2 = JSON.parse(text); fixAceCmds(w2); data = viewToMarshal(w2);
        if (JSON.stringify(marshalToView(data)) !== JSON.stringify(w2)) pr.push(`${f.path}: hasil rvdata2 tidak sama dengan data yang diterjemahkan`);
      } catch (e) { pr.push(`${f.path}: gagal menulis rvdata2 (${e.message})`); }
    }
    if (pr.length) { problems.push(...pr); continue; }
    out.push({ name: f.path, data: data || new TextEncoder().encode(text) }); stat.files++; stat.applied += use.length;
  }
  const report = ['RPG Maker Translator - patch-report', `Tanggal: ${date.toISOString()}`, `Model: ${model}`, ...notes, `File diubah: ${stat.files}`, `Teks diterapkan: ${stat.applied}`, `Teks dipecah ulang agar muat: ${stat.wrapped}`, `Deskripsi/profil lebih dari 2 baris (mungkin terpotong di game): ${stat.long}`,
    `Belum diterjemahkan (tetap asli): ${stat.pending}`, `Error (tetap asli): ${stat.error}`, `Dilewati: ${stat.skipped}`, `Posisi tidak cocok dengan file asli (tetap asli): ${stat.mismatch}`, ...(warnings.length ? ['', ...warnings.slice(0, 50), ...(warnings.length > 50 ? [`...dan ${warnings.length - 50} lainnya`] : [])] : []), '', ...out.map((x) => x.name)].join('\n');
  return { ok: !problems.length && out.length > 0, empty: !problems.length && !out.length, problems, warnings, bad: badAll, files: out, report, stat };
}
/** Ekspor proyek: JSON asli + terjemahan, lolos diff guard, lalu zip. Bila gagal, tidak ada zip. */
export async function exportProject(project, model = '', wrap = null) {
  const plug = project.msgPlugins?.length ? project.msgPlugins : null;
  if (plug) wrap = null;
  const files = await dbPrefix('origFiles', project.id + ':'), entries = await dbQuery('entries', 'projectId', project.id);
  const r = buildPatch(files, entries, { model, wrap, allow: project.allow, notes: plug ? [`Plugin message terdeteksi (${plug.join(', ')}): pemecahan baris otomatis dimatikan. Cek hasil di game.`] : [] });
  if (!r.ok) return r;
  return { ...r, blob: await writeZip([...r.files, { name: 'patch-report.txt', data: new TextEncoder().encode(r.report) }]) };
}
/** Impor folder/zip: simpan JSON asli dan entries ke IndexedDB. */
const engine_isAce = (e) => e === 'VX Ace';
export async function importProject(files, src = 'ja', onProgress = () => {}, { allow: allowText = '' } = {}) {
  const allow = parseAllow(allowText);
  onProgress('Membaca daftar file…', 0, 0);
  const { engine: eng, data, plugins, scripts } = await collectSources(files);
  if (!data.size) throw new Error(UI.noData);
  const id = 'p' + Date.now().toString(36), orig = [], entries = [], broken = [], counts = {};
  const gaps = new Map();
  let sys = null, i = 0, msgPlugins = [], pluginsSeen = false, pluginsText = '';
  if (plugins) try { pluginsText = await plugins.read(); msgPlugins = detectMessagePlugins(pluginsText); pluginsSeen = true; } catch { /* plugins.js tidak terbaca */ }
  const ingest = async (path, json, text) => {
    orig.push({ key: `${id}:${path}`, projectId: id, path, text });
    const covered = new Set();
    for (const e of extractFile(path, json, { src, allow })) {
      e.projectId = id; e.hash = await sha256(e.original); entries.push(e);
      counts[e.category] = (counts[e.category] || 0) + 1;
      e.original.split('\n').forEach((l) => covered.add(l.trim())); if (e.meta?.speaker) covered.add(e.meta.speaker.trim());
    }
    if (json && typeof json === 'object') for (const [k, g] of scanGaps(path, json, covered)) {
      const t = gaps.get(k) || { n: 0, samples: [] }; t.n += g.n; if (t.samples.length < 2) t.samples.push(...g.samples.slice(0, 2 - t.samples.length)); gaps.set(k, t);
    }
  };
  for (const [path, item] of data) {
    onProgress(`Membaca ${path.split('/').pop()} (${i + 1} dari ${data.size})`, i, data.size);
    if (i++ % 10 === 0) await new Promise((r) => setTimeout(r));
    let text, json;
    try {
      if (/\.rvdata2$/i.test(path)) { json = marshalToView(await item.readBin()); text = JSON.stringify(json); }
      else { text = await item.read(); json = JSON.parse(text); }
    } catch { broken.push(path); continue; }
    if (path.endsWith('System.json')) sys = json;
    await ingest(path, json, text);
  }
  let scriptsDiag = null;
  if (engine_isAce(eng) && scripts) {
    onProgress('Memeriksa Scripts.rvdata2…', data.size, data.size);
    try { const r = await scanScripts(await scripts.readBin()); scriptsDiag = { total: r.total, found: r.found.slice(0, 8), hits: r.found.reduce((a, x) => a + x[1], 0) }; }
    catch (e) { scriptsDiag = { error: e?.message || String(e) }; }
  } else if (engine_isAce(eng)) scriptsDiag = { missing: true };
  let paramNote = '';
  if (allow.param.length) {
    const pj = pluginsText ? parsePluginsJs(pluginsText) : null;
    if (pj) await ingest(normPluginsPath(plugins.path), pj.arr, pluginsText);
    else paramNote = pluginsText ? 'js/plugins.js tidak bisa dibaca (bukan array JSON murni), parameter plugin dilewati' : 'js/plugins.js tidak ikut dipilih, parameter plugin dilewati';
  }
  const engine = eng || (sys && (sys.advanced || sys.itemCategories) ? 'MZ' : 'MV');
  const project = { id, engine, src, tgt: 'id', scriptsDiag, gaps: [...gaps].sort((a, b) => b[1].n - a[1].n).slice(0, 10), msgPlugins, pluginsSeen, allow, paramNote, files: orig.length, broken, counts, total: entries.length, updatedAt: Date.now() };
  onProgress(`Menyimpan ${entries.length} teks…`, data.size, data.size);
  await dbPutMany('origFiles', orig);
  await dbPutMany('entries', entries);
  await dbPut('projects', project);
  await dbPut('settings', { key: 'current', value: id });
  return project;
}

const normTxt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escSig = (s) => (String(s ?? '').match(ESC) || []).sort().join('\u0001');
const bigrams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
const prep = (x) => { const n = normTxt(x.original); return { x, n, len: n.length, sig: escSig(x.original), g: null }; };
const diceP = (p, q) => {
  if (p.n === q.n) return 1; if (p.len < 2 || q.len < 2) return 0;
  const A = (p.g ||= bigrams(p.n)), B = (q.g ||= bigrams(q.n)), [S, L] = A.size <= B.size ? [A, B] : [B, A]; let hit = 0;
  for (const [g, n] of S) hit += Math.min(n, L.get(g) || 0);
  return (2 * hit) / (p.len + q.len - 2);
};
/** Kemiripan Dice 0..1 antara dua teks (spasi diabaikan). */
export const similarity = (a, b) => diceP(prep({ original: a }), prep({ original: b }));
/**
 * Cocokkan entri yatim (terjemahan masih ada, tapi posisinya hilang) ke teks baru dari game asli.
 * Urutan: teks sama persis (spasi diabaikan), lalu mirip >= minSim dengan kode escape yang sama.
 * Dipercepat dengan indeks, bigram dihitung sekali, dan batas panjang; tick dipanggil berkala agar UI tidak macet.
 * @returns {Promise<{o:object,c:object,exact:boolean}[]>} pasangan yang cocok; yang tidak cocok tidak muncul
 */
export async function matchOrphans(orphans, cands, minSim = 0.8, tick = null) {
  const used = new Set(), out = [], exactIdx = new Map(), bucket = new Map();
  for (const c of cands) {
    const p = prep(c), k = `${c.category}\n${p.n}`; (exactIdx.get(k) || exactIdx.set(k, []).get(k)).push(p);
    const bk = `${c.category}\n${p.sig}`; (bucket.get(bk) || bucket.set(bk, []).get(bk)).push(p);
  }
  const rest = []; let n = 0;
  for (const o of orphans) {
    const p = prep(o), hit = (exactIdx.get(`${o.category}\n${p.n}`) || []).find((q) => !used.has(q));
    if (hit) { used.add(hit); out.push({ o, c: hit.x, exact: true }); } else rest.push(p);
    if (tick && ++n % 200 === 0) await tick(n, orphans.length * 2);
  }
  n = 0;
  for (const p of rest) {
    let best = null, bs = minSim;
    for (const q of bucket.get(`${p.x.category}\n${p.sig}`) || []) {
      if (used.has(q)) continue;
      const m = Math.max(p.len, q.len); if (!m || 2 * Math.min(p.len, q.len) / (p.len + q.len) < bs) continue;
      const sc = diceP(p, q); if (sc >= bs) { bs = sc; best = q; if (sc === 1) break; }
    }
    if (best) { used.add(best); out.push({ o: p.x, c: best.x, exact: false }); }
    if (tick && ++n % 20 === 0) await tick(orphans.length + n, orphans.length * 2);
  }
  return out;
}
/**
 * Selamatkan entri bertanda "Tidak ada di game asli": terjemahannya masih tersimpan, hanya posisinya yang tidak cocok.
 * Teks dicocokkan ulang ke file asli proyek yang sekarang (hasil Pulihkan), tanpa perlu memilih game asli lagi.
 */
export async function rescueSkipped(project, onProgress = () => {}) {
  const stored = await dbPrefix('origFiles', project.id + ':'), ents = await dbQuery('entries', 'projectId', project.id);
  const res = { orphans: 0, exact: 0, fuzzy: 0, left: 0, bad: 0 }, toPut = [], byFile = new Map(), live = new Map();
  for (const e of ents) {
    if (e.status !== 'skipped') { if (!live.has(e.file)) live.set(e.file, new Set()); live.get(e.file).add(`${e.category}\n${e.path}`); continue; }
    if (e.error !== 'Tidak ada di game asli' || typeof e.translation !== 'string' || !e.translation.trim()) continue;
    if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); res.orphans++;
  }
  let i = 0;
  for (const f of stored) {
    const orphans = byFile.get(f.path); if (!orphans) continue;
    const name = f.path.split('/').pop(), head = `Mencocokkan ${name} (${++i} dari ${byFile.size}, ${orphans.length} teks)`;
    onProgress(head); await new Promise((r) => setTimeout(r));
    let json; try { json = /(^|\/)js\/plugins\.js$/.test(f.path) ? parsePluginsJs(f.text)?.arr : JSON.parse(f.text); if (!json) throw new Error('x'); } catch { res.bad += orphans.length; continue; }
    const lv = live.get(f.path) || new Set();
    const cands = extractFile(f.path, json, { src: project.src, allow: project.allow }).filter((c) => !lv.has(`${c.category}\n${c.path}`));
    const ms = await matchOrphans(orphans, cands, 0.8, async (d, t) => { onProgress(`${head}: ${d}/${t}`); await new Promise((r) => setTimeout(r)); });
    for (const { o, c, exact } of ms) {
      toPut.push({ ...o, path: c.path, kind: c.kind, meta: c.meta, lineCount: c.lineCount, order: c.order, original: c.original, hash: await sha256(c.original), status: 'edited', error: '' });
      exact ? res.exact++ : res.fuzzy++;
    }
    res.left += orphans.length - ms.length;
  }
  if (toPut.length) await dbPutMany('entries', toPut);
  const all = await dbQuery('entries', 'projectId', project.id);
  project.updatedAt = Date.now(); project.total = all.length; await dbPut('projects', project);
  return res;
}
/**
 * Cocokkan urutan kunci O ke L sebagai subsekuens. Hasilnya indeks di L untuk tiap elemen O,
 * tetapi hanya bila caranya TUNGGAL; bila ada lebih dari satu cara (ambigu) atau tidak ada, hasilnya null.
 */
export function alignUnique(O, L) {
  const n = O.length, m = L.length; if (!n || n > m) return null;
  const w = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let j = 0; j <= m; j++) w[0][j] = 1;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) w[i][j] = Math.min(2, w[i][j - 1] + (O[i - 1] === L[j - 1] ? w[i - 1][j - 1] : 0));
  if (w[n][m] !== 1) return null;
  const idx = new Array(n); let i = n, j = m;
  while (i > 0) { if (w[i][j - 1] > 0) j--; else { idx[i - 1] = j - 1; i--; j--; } }
  return idx;
}
/**
 * Selamatkan PILIHAN (choice) bertanda "Tidak ada di game asli" lewat posisi, bukan teks.
 * Dipakai saat teks di game yang sudah diedit/diterjemahkan beda dengan game asli (mis. beda bahasa), sehingga pencocokan teks gagal.
 * Pilihan dikelompokkan per daftar perintah (file + letak list), diurutkan, lalu dipasangkan lewat nomor opsi dan kode escape.
 * Hanya dipasangkan bila pasangannya tunggal; selebihnya dibiarkan skipped. Terjemahan dipindah ke entri di posisi game asli.
 */
export async function rescueByPosition(project, onProgress = () => {}) {
  const ents = await dbQuery('entries', 'projectId', project.id);
  const res = { orphans: 0, moved: 0, left: 0, ambiguous: 0 }, groups = new Map(), toPut = [], toDel = [];
  for (const e of ents) {
    if (e.kind !== 'choice') continue;
    let p; try { p = JSON.parse(e.path); } catch { continue; }
    if (!Array.isArray(p) || p.length < 5) continue;
    const orphan = e.status === 'skipped' && e.error === 'Tidak ada di game asli' && typeof e.translation === 'string' && e.translation.trim() !== '';
    const free = e.status !== 'skipped' && (String(e.translation ?? '').trim() === '' || e.translation === e.original);
    if (!orphan && !free) continue;
    const gk = `${e.file}\n${JSON.stringify(p.slice(0, -4))}`;
    if (!groups.has(gk)) groups.set(gk, { o: [], l: [] });
    (orphan ? groups.get(gk).o : groups.get(gk).l).push({ e, i: p.at(-4), k: p.at(-1), key: `${p.at(-1)}|${escSig(e.original)}` });
    if (orphan) res.orphans++;
  }
  let n = 0;
  for (const g of groups.values()) {
    if (!g.o.length) continue;
    if (++n % 50 === 0) { onProgress(`Mencocokkan pilihan (${n} kelompok)`); await new Promise((r) => setTimeout(r)); }
    const by = (a, b) => a.i - b.i || a.k - b.k; g.o.sort(by); g.l.sort(by);
    const al = alignUnique(g.o.map((x) => x.key), g.l.map((x) => x.key));
    if (!al) { res.left += g.o.length; res.ambiguous++; continue; }
    g.o.forEach((o, t) => { toPut.push({ ...g.l[al[t]].e, translation: o.e.translation, status: 'edited', error: '' }); toDel.push(o.e.id); res.moved++; });
  }
  if (toPut.length) await dbPutMany('entries', toPut);
  if (toDel.length) await dbDeleteMany('entries', toDel);
  const all = await dbQuery('entries', 'projectId', project.id);
  project.updatedAt = Date.now(); project.total = all.length; await dbPut('projects', project);
  return res;
}
/**
 * Pulihkan teks dari game asli (yang belum diubah) ke proyek, per kategori terpilih. Semua jenis teks ikut:
 * field, dialog/scroll (blok), pilihan, dan nama pembicara.
 * Cara kerja per file yang ada di game asli:
 *  1. File asli proyek (origFiles) diganti utuh dengan file game asli, jadi struktur dan posisi baris kembali seperti semula.
 *  2. Teks diekstrak ulang dari file asli. Kategori terpilih: entri lama (path sama) direset dan kolom terjemahan diisi teks asli
 *     (fill) atau dikosongkan (pending); bila belum ada, dibuat baru dari file asli.
 *  3. Kategori yang tidak dipilih: terjemahan dipertahankan (dicocokkan lewat path, atau lewat teks asli bila posisinya bergeser).
 *     Yang tidak ada lagi di game asli ditandai skipped, terjemahannya tidak dihapus.
 *  4. Entri kategori terpilih yang tidak ada lagi di game asli dihapus.
 * File yang ada di game asli tapi belum ada di proyek ikut ditambahkan.
 */
export async function restoreFromPristine(project, files, cats, onProgress = () => {}, fill = false) {
  const { data, plugins } = await collectSources(files), base = (x) => x.split('/').pop().toLowerCase();
  const isPl = (x) => /(^|\/)js\/plugins\.js$/.test(x.replace(/\\/g, '/'));
  const byBase = new Map([...data].map(([k, v]) => [base(k), [k, v]]));
  const stored = await dbPrefix('origFiles', project.id + ':'), ents = await dbQuery('entries', 'projectId', project.id);
  const byFile = new Map();
  for (const e of ents) { if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); }
  const have = new Set(stored.map((f) => base(f.path)));
  const extra = [...byBase].filter(([b]) => !have.has(b));
  const res = { matched: 0, restored: 0, created: 0, removed: 0, kept: 0, moved: 0, orphan: 0, newFiles: 0, nofile: 0, bad: 0, badNames: [] };
  const newOrig = [], toPut = [], toDel = [];
  const load = async (path, item) => {
    if (isPl(path)) { const text = await item.read(), pj = parsePluginsJs(text); if (!pj) throw new Error('plugins.js'); return { json: pj.arr, text }; }
    if (/\.rvdata2$/i.test(path)) { const json = marshalToView(await item.readBin()); return { json, text: JSON.stringify(json) }; }
    const text = await item.read(); return { json: JSON.parse(text), text };
  };
  // Proses satu file; mengembalikan true bila file ini disentuh (ada kategori terpilih).
  const handle = async (path, json, oldEs) => {
    const ex = extractFile(path, json, { src: project.src, allow: project.allow });
    if (!ex.some((e) => cats.has(e.category)) && !oldEs.some((e) => cats.has(e.category))) return false;
    const byPath = new Map(oldEs.map((e) => [e.path, e])), claimed = new Set(), pool = new Map(), later = [];
    for (const o of oldEs) { const k = `${o.category}\n${normTxt(o.original)}`; if (!pool.has(k)) pool.set(k, []); pool.get(k).push(o); }
    for (const e of ex) {
      const o0 = byPath.get(e.path), old = o0 && o0.category === e.category && !claimed.has(o0.id) ? o0 : null;
      if (cats.has(e.category)) {
        if (old) { claimed.add(old.id); res.restored++; } else res.created++;
        toPut.push({ ...(old || {}), ...e, file: path, projectId: project.id, hash: await sha256(e.original), translation: fill ? e.original : '', status: fill ? 'done' : 'pending', error: '' });
      } else if (old && old.original === e.original) { claimed.add(old.id); res.kept++; }
      else later.push(e);
    }
    // kategori tidak dipilih yang posisinya bergeser: cari entri lama dengan teks asli yang sama
    for (const e of later) {
      const c = (pool.get(`${e.category}\n${normTxt(e.original)}`) || []).find((x) => !claimed.has(x.id)); if (!c) continue;
      claimed.add(c.id); res.moved++; toPut.push({ ...c, path: e.path, kind: e.kind, meta: e.meta, lineCount: e.lineCount, order: e.order });
    }
    for (const o of oldEs) {
      if (claimed.has(o.id)) continue;
      if (cats.has(o.category)) { toDel.push(o.id); res.removed++; }
      else { toPut.push({ ...o, status: 'skipped', error: 'Tidak ada di game asli' }); res.orphan++; }
    }
    return true;
  };
  let i = 0; const total = stored.length + extra.length;
  for (const f of stored) {
    onProgress(`Memeriksa ${base(f.path)} (${++i} dari ${total})`, i, total);
    if (i % 10 === 0) await new Promise((r) => setTimeout(r));
    const hit = isPl(f.path) ? (plugins ? [f.path, plugins] : null) : byBase.get(base(f.path));
    if (!hit) { res.nofile++; continue; }
    let p; try { p = await load(f.path, hit[1]); } catch { res.bad++; if (res.badNames.length < 5) res.badNames.push(base(f.path)); continue; }
    res.matched++;
    if (await handle(f.path, p.json, byFile.get(f.path) || [])) newOrig.push({ ...f, text: p.text });
  }
  for (const [b, [k, item]] of extra) {
    onProgress(`Memeriksa ${b} (${++i} dari ${total})`, i, total);
    if (i % 10 === 0) await new Promise((r) => setTimeout(r));
    let p; try { p = await load(k, item); } catch { res.bad++; if (res.badNames.length < 5) res.badNames.push(b); continue; }
    if (await handle(k, p.json, [])) { newOrig.push({ key: `${project.id}:${k}`, projectId: project.id, path: k, text: p.text }); res.newFiles++; }
  }
  if (newOrig.length) await dbPutMany('origFiles', newOrig);
  if (toDel.length) await dbDeleteMany('entries', toDel);
  if (toPut.length) await dbPutMany('entries', toPut);
  // perbarui ringkasan proyek (lencana kategori dan total) dari data terbaru
  const all = await dbQuery('entries', 'projectId', project.id), counts = {};
  for (const e of all) counts[e.category] = (counts[e.category] || 0) + 1;
  project.counts = counts; project.total = all.length; project.files = (project.files || 0) + res.newFiles; project.updatedAt = Date.now();
  await dbPut('projects', project);
  return res;
}
// ===== 4b. GLOSARIUM & EDIT MANUAL (CSV/JSON) =====
/** Glosarium: satu baris "sumber = terjemahan". Baris berawalan # diabaikan. Diurut dari istilah terpanjang. */
export function parseGlossary(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i < 1) continue;
    const a = t.slice(0, i).trim(), b = t.slice(i + 1).trim(); if (a && b) out.push([a, b]);
  }
  return out.sort((x, y) => y[0].length - x[0].length);
}
/** Istilah glosarium yang muncul di teks. */
export const termsFor = (gl, text) => gl.filter(([a]) => text.includes(a));
/** Catatan karakter: satu baris "nama pembicara: catatan gaya bicara". */
export function parseNotes(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    const m = line.trim().match(/^([^:=#][^:=]*)[:=]\s*(\S.*)$/);
    if (m) out.push([m[1].trim(), m[2].trim()]);
  }
  return out;
}
/** Catatan untuk pembicara ini (nama pembicara memuat nama di catatan). */
export const notesFor = (notes, speaker) => (speaker ? notes.filter(([n]) => speaker.includes(n)) : []);
export const DEFAULT_STYLE = 'Indonesia santai ala dialog game atau subtitle anime (aku/kamu, nggak). Karakter formal (bangsawan, pelayan, narator, sistem) boleh baku. Ikuti register sumber: bila kasar, vulgar, atau mesum, terjemahkan setara; jangan dihaluskan, disensor, atau dikomentari. Teks UI ringkas dan netral.';
const cacheKey = (project, cfg, original, terms = [], notes = []) => sha256(`${project.src}|${project.tgt}|${cfg.model}|${original}${terms.length ? `|g:${terms.map((t) => t.join('=')).join(';')}` : ''}${notes.length ? `|n:${notes.map((t) => t.join('=')).join(';')}` : ''}`);
export const CSV_COLS = ['id', 'file', 'category', 'speaker', 'status', 'original', 'translation'];
export const entriesToRows = (entries) => entries.map((e) => ({ id: e.id, file: e.file, category: e.category, speaker: e.meta?.speaker || '', status: e.status, original: e.original, translation: e.translation || '' }));
/** CSV UTF-8 dengan BOM (agar Excel membaca huruf Jepang). Semua field dikutip. */
export const toCsv = (rows) => '\uFEFF' + [CSV_COLS.join(','), ...rows.map((r) => CSV_COLS.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n') + '\r\n';
/** Baca CSV (kutip ganda, baris baru di dalam kutip, pemisah koma atau titik koma ala Excel regional). */
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0], d = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows; if (!head) return [];
  return body.filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(head.map((k, j) => [k.trim(), r[j] ?? ''])));
}
/**
 * Terapkan hasil edit manual. Baris dicocokkan lewat id dan harus punya teks asli yang sama dengan proyek ini.
 * Baris ditolak bila id asing, teks asli beda, atau kode escape/tag tidak sama dengan aslinya.
 * @returns {{updates:object[], same:number, empty:number, unknown:any[], mismatch:any[], badEsc:any[]}}
 */
export function applyImport(entries, rows) {
  const byId = new Map(entries.map((e) => [String(e.id), e])), nl = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();
  const sig = (s) => (s.match(ESC) || []).sort().join('\u0001');
  const out = { updates: [], same: 0, empty: 0, unknown: [], mismatch: [], badEsc: [] };
  for (const r of Array.isArray(rows) ? rows : []) {
    const e = byId.get(String(r?.id ?? '').trim());
    if (!e) { out.unknown.push(r?.id); continue; }
    if (nl(r.original) !== nl(e.original)) { out.mismatch.push(e.id); continue; }
    const t = String(r.translation ?? '').replace(/\r\n/g, '\n');
    if (!t.trim()) { out.empty++; continue; }
    if (t === e.translation) { out.same++; continue; }
    if (sig(t) !== sig(e.original)) { out.badEsc.push(e.id); continue; }
    out.updates.push({ ...e, translation: t, status: 'edited', error: '' });
  }
  return out;
}
/**
 * Isi kolom translation yang kosong di baris utama dengan nilai dari file pembanding.
 * Pencocokan lewat id (string, di-trim). Baris utama yang sudah punya terjemahan tidak diubah.
 * Baris pembanding dengan translation kosong juga tidak dipakai.
 * @param {object[]} primary baris hasil impor (boleh ada translation kosong)
 * @param {object[]} secondary baris pembanding (sumber nilai pengisi)
 * @returns {object[]} baris baru (primary dengan translation yang sudah diisi)
 */
export function mergeRows(primary, secondary) {
  const byId = new Map();
  for (const r of Array.isArray(secondary) ? secondary : []) {
    const id = String(r?.id ?? '').trim();
    if (id !== '' && !byId.has(id)) byId.set(id, r);
  }
  const empty = (v) => String(v ?? '').trim() === '';
  return (Array.isArray(primary) ? primary : []).map((r) => {
    if (!r || typeof r !== 'object') return r;
    if (!empty(r.translation)) return r;
    const s = byId.get(String(r.id ?? '').trim());
    const t = s?.translation;
    if (empty(t)) return r;
    return { ...r, translation: t };
  });
}

// ===== 4c. TERJEMAH LEWAT CHAT AI =====
const NL = '⏎', LANG_NAME = { all: 'bahasa apa pun (tiap baris bisa Jepang, Inggris, Indonesia, Korea, dll; baris yang sudah berbahasa Indonesia salin apa adanya)', ja: 'Jepang', en: 'Inggris', id: 'Indonesia', auto: 'Jepang atau Inggris (tiap baris bisa salah satunya; baris yang sudah berbahasa Indonesia salin apa adanya)' };
const plainName = (t) => String(t || '').replace(ESC, '').replace(/[\[\]|\n]/g, ' ').trim();
/**
 * Pecah teks yang belum selesai menjadi bagian-bagian untuk ditempel ke aplikasi AI.
 * Satu baris per teks unik: "[id] teks" (kode game dimasker, baris baru ditulis ⏎), diawali instruksi, gaya, catatan karakter, dan glosarium.
 */
export function buildChatParts(project, entries, cfg, perPart = 150, maxChars = 6000) {
  const groups = new Map();
  for (const e of entries.filter((x) => TODO.has(x.status)).sort((a, b) => a.id - b.id)) { if (!groups.has(e.original)) groups.set(e.original, e); }
  const gl = parseGlossary(cfg.glossary), cn = parseNotes(cfg.charNotes);
  const units = [...groups].map(([original, e0]) => ({ id: e0.id, original, speaker: e0.meta?.speaker || '', text: maskText(original).text.replace(/\r?\n/g, NL) }));
  const batches = makeBatches(units, Math.max(10, perPart), maxChars);
  return batches.map((us, i) => {
    const terms = new Map(), notes = new Map();
    us.forEach((u) => { termsFor(gl, `${u.original}\n${u.speaker}`).forEach(([a, b]) => terms.set(a, b)); notesFor(cn, u.speaker).forEach(([a, b]) => notes.set(a, b)); });
    const lines = us.map((u) => { const sp = plainName(u.speaker); return `[${u.id}${sp ? '|' + sp : ''}] ${u.text}`; });
    const head = [
      `# TUGAS`,
      `Terjemahkan teks game RPG dari bahasa ${LANG_NAME[project.src] || project.src} ke bahasa ${LANG_NAME[project.tgt] || project.tgt}. Ini bagian ${i + 1} dari ${batches.length}, berisi ${us.length} baris.`,
      ``, `# ATURAN FORMAT (WAJIB)`,
      `1. Balas HANYA dengan baris terjemahan, satu baris untuk tiap baris sumber, dengan format: [id] terjemahan`,
      `2. Salin nomor id persis. Jangan melewatkan, menggabung, mengurutkan ulang, atau menambah baris. Jumlah baris balasan harus ${us.length}.`,
      `3. Token seperti ⟦0⟧ dan ⟦1⟧ adalah kode game. Salin persis, jangan diterjemahkan atau dihapus. Posisinya boleh dipindah mengikuti tata bahasa, tapi tiap token harus muncul tepat satu kali.`,
      `3b. Jangan terjemahkan atau ubah apa pun yang berupa kode: nama fungsi/kata kunci (if, en, else, true, false, nil), nama variabel (s[12], v[3], $gameVariables), nama file, atau teks berformat kunci seperti key=value. "if" tidak boleh menjadi "jika". Salin apa adanya. Label seperti "bait:⟦0⟧" hanya kata labelnya yang diterjemahkan ("umpan:⟦0⟧"), tokennya tetap.`,
      `4. Tanda ${NL} berarti pindah baris di dalam satu teks. Pertahankan tanda itu (jangan diganti baris baru sungguhan) dan taruh di tempat yang wajar.`,
      `5. Bagian "|nama" setelah id hanyalah konteks pembicara. Jangan ikut ditulis di balasan dan jangan diterjemahkan sebagai teks.`,
      `6. Tanpa komentar, pembuka, penutup, atau blok kode.`,
      ...((cfg.style || '').trim() ? [``, `# GAYA BAHASA`, cfg.style.trim().replace(/\s+/g, ' ')] : []),
      ...(notes.size ? [``, `# CATATAN KARAKTER (nama pembicara: gaya bicara)`, ...[...notes].map(([a, b]) => `${a}: ${b}`)] : []),
      ...(terms.size ? [``, `# GLOSARIUM (pakai terjemahan ini persis)`, ...[...terms].map(([a, b]) => `${a} = ${b}`)] : []),
      ``, `# TEKS`,
    ];
    const foot = [``, `# AKHIR. Balas sekarang dengan ${us.length} baris berformat [id] terjemahan, tanpa teks lain.`];
    return { index: i + 1, total: batches.length, count: us.length, ids: us.map((u) => u.id), text: [...head, ...lines, ...foot].join('\n') + '\n' };
  });
}
/** Baca balasan AI. Baris tanpa nomor di antara dua baris bernomor dianggap lanjutan baris sebelumnya; yang di awal atau akhir dibuang. */
export function parseChatReply(text, ids = null) {
  const rows = []; let pending = [], ignored = 0, src = String(text).replace(/\r\n/g, '\n');
  // Bila baris baru hilang saat disalin (semua baris tergabung jadi satu), pecah di setiap penanda [id] yang id-nya dikenal.
  if (ids && (src.match(/^\s*(?:(?:[-*•]|\d+[.)])\s*)?\[\d+(?:\|[^\]]*)?\]/gm) || []).length <= 1) {
    src = src.replace(/(\S)[ \t]*(\[(\d+)(?:\|[^\]]*)?\])/g, (m, pre, mark, id) => (ids.has(Number(id)) ? `${pre}\n${mark}` : m));
  }
  for (const raw of src.split('\n')) {
    const line = raw.trim(); if (!line || /^```/.test(line)) continue;
    const m = line.match(/^(?:(?:[-*•]|\d+[.)])\s*)?\[(\d+)(?:\|[^\]]*)?\]\s*(.*)$/);
    if (m) { if (pending.length) { if (rows.length) rows[rows.length - 1].text += NL + pending.join(NL); else ignored += pending.length; pending = []; } rows.push({ id: Number(m[1]), text: m[2] }); }
    else pending.push(line);
  }
  ignored += pending.length;
  return { rows, ignored };
}
/** Terapkan balasan ke entry. Satu terjemahan berlaku untuk semua entry dengan teks asli yang sama. Entry hasil edit manual tidak ditimpa. */
export function applyChatRows(entries, rows) {
  const byId = new Map(entries.map((e) => [e.id, e])), byOrig = new Map();
  for (const e of entries) { if (!byOrig.has(e.original)) byOrig.set(e.original, []); byOrig.get(e.original).push(e); }
  const out = { updates: [], texts: 0, empty: [], badToken: [], unknown: [], dup: 0 }, seen = new Set();
  for (const r of rows) {
    const e0 = byId.get(r.id); if (!e0) { out.unknown.push(r.id); continue; }
    if (seen.has(e0.original)) { out.dup++; continue; }
    const t = String(r.text).replace(new RegExp(`\\s*${NL}\\s*`, 'g'), '\n').trim();
    const lead = (e0.original.match(/^\s*/) || [''])[0].replace(/\r/g, ''), trail = (e0.original.match(/\s*$/) || [''])[0].replace(/\r/g, '');
    if (!t) { out.empty.push(r.id); continue; }
    const u = unmaskText(t, maskText(e0.original).tokens);
    if (!u.ok) { out.badToken.push(r.id); continue; }
    seen.add(e0.original); out.texts++;
    for (const e of byOrig.get(e0.original)) if (TODO.has(e.status)) out.updates.push({ ...e, translation: lead + u.text + trail, status: 'done', error: '' });
  }
  return out;
}

// ===== 5. TRANSLATE (batch, cache, retry, resume, klien LLM, biaya) =====
export const DEFAULT_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', remember: false, model: 'google/gemini-2.5-flash',
  temperature: 0.3, batchSize: 30, maxChars: 4000, concurrency: 4, delay: 100, priceIn: 0, priceOut: 0,
  fast: false, wrapWidth: 48, wrapFace: 38, pluginAllow: '', glossary: '', style: DEFAULT_STYLE, charNotes: '', timeout: 120, extraBody: '', auto: true,
};
const LANG = { ja: 'Japanese', en: 'English', id: 'Indonesian', all: 'any language (each item may be Japanese, English, Indonesian, Korean, etc.; if an item is already Indonesian, return it unchanged)', auto: 'Japanese or English (each item may be in either language; if an item is already Indonesian, return it unchanged)' };
/** Hasil terjemahan yang masih memuat huruf Jepang/Mandarin, Cyrillic, Arab, atau Hangul: tanda terjemahan setengah jalan atau ngaco. */
export const stray = (t) => JA.test(t) || /[\u0400-\u04FF\u0600-\u06FF\uAC00-\uD7AF]/.test(t);
const STRAY_MSG = 'Hasil masih bercampur huruf Jepang/asing, bukan bahasa target';
const TODO = new Set(['pending', 'error', 'translating']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const abortErr = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
/** Tidur yang langsung berhenti bila signal dibatalkan (tombol Berhenti tidak menunggu jeda). */
const sleepSig = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) return rej(abortErr());
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortErr()); }, { once: true });
});
let memKey = '';

/** Galat dari klien LLM. fatal=true berarti retry tidak berguna. */
export class LlmError extends Error {
  constructor(msg, { status = 0, fatal = false, retryAfter = null, split = false, noRetry = false } = {}) { super(msg); this.name = 'LlmError'; this.status = status; this.fatal = fatal; this.retryAfter = retryAfter; this.split = split; this.noRetry = noRetry; }
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
/** Header Retry-After (detik atau tanggal HTTP) menjadi milidetik, atau null. */
export function parseRetryAfter(v) {
  if (v == null || v === '') return null;
  const n = Number(v); if (Number.isFinite(n)) return Math.max(0, n * 1000);
  const t = Date.parse(v); return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null;
}
export async function llmChat(cfg, messages, signal, fetchFn = fetch) {
  if (!cfg.apiKey) throw new LlmError(UI.noKey, { fatal: true });
  if (!urlOk(cfg.baseUrl)) throw new LlmError(UI.urlBad, { fatal: true });
  let extra = {};
  if (String(cfg.extraBody || '').trim()) {
    try { extra = JSON.parse(cfg.extraBody); if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('x'); }
    catch { throw new LlmError('Body tambahan di Pengaturan bukan objek JSON yang valid', { fatal: true }); }
    delete extra.model; delete extra.messages;
  }
  // Batas waktu per request; pembatalan dari pengguna tetap diteruskan.
  const ctl = new AbortController(); let timedOut = false;
  const onAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, Math.max(10, Number(cfg.timeout) || 120) * 1000);
  try {
    let res;
    try {
      res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, temperature: cfg.temperature, messages, ...(cfg.fast && /(^|\.)openrouter\.ai$/.test(new URL(cfg.baseUrl).hostname) ? { reasoning: { enabled: false } } : {}), ...extra }),
      });
    } catch (e) {
      if (e.name === 'AbortError') { if (timedOut) throw new LlmError(UI.timeout); throw e; }
      throw new LlmError(UI.net);
    }
    if (!res.ok) {
      const s = res.status, retryAfter = parseRetryAfter(res.headers?.get?.('retry-after'));
      if (s === 401 || s === 403) throw new LlmError(UI.keyBad, { status: s, fatal: true });
      if (s === 402) throw new LlmError(UI.credit, { status: s, fatal: true });
      let d = ''; try { d = (await res.json())?.error?.message || ''; } catch { /* abaikan */ }
      // 400/413/422: biasanya satu teks bermasalah (filter konten, terlalu panjang). Batch dipecah untuk mencari yang bermasalah.
      // Pesan soal model/key/kuota tetap fatal agar tidak memboroskan request.
      const split = [400, 413, 422].includes(s) && !/model|api.?key|auth|credit|quota|billing|permission/i.test(d);
      const fatal = s !== 429 && s < 500 && !split;
      throw new LlmError(`Provider menolak permintaan (${s}). ${d || (fatal ? 'Periksa model di Pengaturan' : 'Coba lagi nanti')}`.trim(), { status: s, fatal, retryAfter, split, noRetry: split });
    }
    const j = await res.json().catch((e) => { if (timedOut) throw new LlmError(UI.timeout); return null; }), text = j?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new LlmError(UI.badResp);
    return { text, usage: j.usage || null };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
export async function withRetry(fn, { tries = 4, base = 1000, cap = 60000, signal, wait = (ms) => sleepSig(ms, signal) } = {}) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (e.name === 'AbortError' || e.fatal || e.noRetry || i >= tries - 1) throw e;
      // Hormati Retry-After dari provider; bila tidak ada, backoff eksponensial dengan jitter.
      await wait(Math.min(cap, e.retryAfter != null ? e.retryAfter : base * 2 ** i * (0.75 + Math.random() * 0.5)));
    }
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
// Terima array [{id,text}] (format lama) atau objek ringkas {"id":"teks"} (format baru, output lebih pendek).
const toArray = (p) => {
  if (Array.isArray(p)) return p;
  if (!p || typeof p !== 'object') return null;
  const arr = Object.values(p).find(Array.isArray);
  if (arr) return arr;
  const m = Object.entries(p).filter(([k, v]) => /^\d+$/.test(k) && typeof v === 'string').map(([k, v]) => ({ id: Number(k), text: v }));
  return m.length ? m : null;
};
/** Susun pesan untuk LLM. units: [{id, text, speaker?}], context: array string. */
export function buildMessages({ src, tgt, units, context = [], style = '' }) {
  const system = `You translate RPG game text from ${LANG[src]} to ${LANG[tgt]}.
Rules:
- Keep every ⟦n⟧ token exactly as given: same count, same form. Never translate, add, or remove them.
- Never translate or alter anything that looks like code: function names and keywords (if, en, else, true, false, nil), variable names (s[12], v[3], $gameVariables), file names, or key=value strings. "if" must never become "jika"/"if"-equivalents. Copy them verbatim. For labels like "bait:⟦0⟧", translate only the label word and keep the token.
- Keep line breaks as line breaks and keep the same number of lines when possible.
- Translate every word into ${LANG[tgt]}. Never leave Japanese, Chinese, or Korean characters in the translation and never mix source-language words into the sentence; romanize a name if you must keep it. Reply only in ${LANG[tgt]}.\n- Translate as natural game dialogue. Keep names consistent. Keep short UI terms short.
- If "glossary" is given, translate those terms exactly as listed (from -> to).${style.trim() ? `\n- Style guide for all text: ${style.trim().replace(/\s+/g, ' ')}` : ''}
- If "character_notes" is given, follow each note for lines spoken by that speaker; it overrides the general style guide.
- If an item has max_chars_per_line and max_lines, the translation must fit: break lines with \\n, never exceed max_chars_per_line characters per line (not counting ⟦n⟧ tokens) or max_lines lines. Indonesian and English run longer than Japanese, so shorten the wording when needed and keep the meaning.
- "context" holds earlier lines for reference only. Do not translate or return them.
- Reply with one JSON object only, no code fence, no commentary: {"0":"translation","1":"translation"}. One key per item, using the item's id.`;
  const gls = new Map(); units.forEach((u) => (u.terms || []).forEach(([a, b]) => gls.set(a, b)));
  const cns = new Map(); units.forEach((u) => (u.notes || []).forEach(([a, b]) => cns.set(a, b)));
  const user = JSON.stringify({ context, ...(cns.size ? { character_notes: [...cns].map(([name, note]) => ({ name, note })) } : {}), ...(gls.size ? { glossary: [...gls].map(([from, to]) => ({ from, to })) } : {}), items: units.map((u) => ({ id: u.id, ...(u.speaker ? { speaker: u.speaker } : {}), ...(u.limit ? { max_chars_per_line: u.limit.line, max_lines: u.limit.lines } : {}), text: u.text })) });
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
    const r = await withRetry(() => o.chat(buildMessages({ src: o.src, tgt: o.tgt, units, context: o.context, style: o.style })), o.retry);
    o.onUsage?.(r.usage); arr = toArray(parseJsonLoose(r.text));
  } catch (e) {
    if (e.fatal || e.name === 'AbortError') throw e;
    // Error karena isi batch (400/413/422): pecah dua untuk mengisolasi teks bermasalah, dengan batas jumlah pecahan per batch.
    if (e.split && units.length > 1 && (o.budget ??= { left: 12 }).left-- > 0) {
      const h2 = units.length >> 1;
      for (const p of [units.slice(0, h2), units.slice(h2)]) {
        const r = await translateBatch(p, o, why);
        r.ok.forEach((v, k) => ok.set(k, v)); r.fail.forEach((v, k) => fail.set(k, v));
      }
      return { ok, fail };
    }
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
/**
 * Mode otomatis: ukuran batch menyesuaikan panjang rata-rata teks (target sekitar 2400 karakter per batch, 10 sampai 60 teks).
 * concurrency di sini adalah batas atas; jumlah yang berjalan menyesuaikan saat proses (lihat runTranslation).
 */
export function autoTune(todo, cfg) {
  const seen = new Set(); let chars = 0;
  for (const e of todo) { if (seen.has(e.original)) continue; seen.add(e.original); chars += maskText(e.original).text.length; }
  const avg = seen.size ? chars / seen.size : 50;
  return { ...cfg, batchSize: Math.max(10, Math.min(80, Math.floor(3000 / (avg + 15)))), maxChars: 5000, concurrency: Math.min(12, Math.max(5, Number(cfg.concurrency) || 5)), delay: 0 };
}
/** Perkiraan kasar token dan biaya untuk entri yang belum selesai (belum menghitung cache). */
export function estimateCost(entries, cfg0, src = 'ja') {
  const cfg = cfg0.auto !== false ? autoTune(entries.filter((e) => TODO.has(e.status)), cfg0) : cfg0;
  const seen = new Set(); let chars = 0, ja = 0;
  for (const e of entries) {
    if (!TODO.has(e.status) || seen.has(e.original)) continue;
    seen.add(e.original); const n = maskText(e.original).text.length; chars += n;
    if (src === 'ja' || ((src === 'auto' || src === 'all') && e.source === 'ja')) ja += n;
  }
  const items = seen.size, batches = items ? Math.max(Math.ceil(items / cfg.batchSize), Math.ceil(chars / cfg.maxChars)) : 0;
  const body = ja + (chars - ja) * 0.3;
  const inTok = Math.round(body + items * 15 + batches * (400 + Math.ceil((cfg.style || '').length / 3.5))), outTok = Math.round(ja + (chars - ja) * 0.36 + items * 5);
  const cost = cfg.priceIn || cfg.priceOut ? (inTok * cfg.priceIn + outTok * cfg.priceOut) / 1e6 : null;
  return { items, batches, inTok, outTok, cost, batchSize: cfg.batchSize, auto: cfg0.auto !== false };
}
/**
 * Terjemahkan semua entri proyek yang pending/error. Aman dilanjutkan: hasil tiap batch langsung disimpan.
 * @param {object} project proyek (id, src, tgt)
 * @param {object} cfg pengaturan
 * @param {{signal?:AbortSignal, onProgress?:Function, chat?:Function}} o chat(messages, signal) bisa diganti untuk tes
 * @returns {Promise<{done:number, error:number, cached:number, tokensIn:number, tokensOut:number, stopped:boolean}>}
 */
export async function runTranslation(project, cfg, o = {}) {
  const { signal, onProgress = () => {}, base = 0 } = o, chat = o.chat || ((m, s) => llmChat(cfg, m, s));
  const all = (await dbQuery('entries', 'projectId', project.id)).sort((a, b) => a.id - b.id);
  const cats = Array.isArray(o.cats) ? new Set(o.cats) : null; // null = semua kategori
  const pos = new Map(all.map((e, i) => [e.id, i])), todo = all.filter((e) => TODO.has(e.status) && (!cats || cats.has(e.category)));
  const stat = { done: 0, error: 0, cached: 0, tokensIn: 0, tokensOut: 0, stopped: false, expOut: 0, nb: 0 };
  const auto = cfg.auto !== false, eff = auto ? autoTune(todo, cfg) : cfg;
  // Jumlah batch yang berjalan bersamaan: mulai 6, turun saat provider membatasi, naik tiap 4 batch lancar (sampai batas konkurensi).
  const lim = { cur: auto ? Math.min(eff.concurrency, 6) : eff.concurrency, max: eff.concurrency, active: 0, okRun: 0 };
  let n = 0; const tick = (t) => onProgress(n + base, todo.length + base, (stat.tokensIn ? `${t} · token masuk ${stat.tokensIn}, keluar ${stat.tokensOut}` : t) + (stat.nb >= 3 && stat.tokensOut > stat.expOut * 2.5 ? ' · Token keluar jauh di atas wajar: model mungkin memakai mode berpikir (lihat Body tambahan di Pengaturan)' : ''));
  const groups = new Map();
  for (const e of todo) { if (!groups.has(e.original)) groups.set(e.original, []); groups.get(e.original).push(e); }
  const units = [], hits = [], gl = parseGlossary(cfg.glossary), cn = parseNotes(cfg.charNotes); let uid = 0;
  for (const [original, entries] of groups) {
    const exact = gl.find(([a]) => a === original.trim());
    if (exact) { entries.forEach((e) => hits.push({ ...e, translation: exact[1], status: 'done', error: '' })); continue; }
    const terms = termsFor(gl, `${original}\n${entries[0].meta?.speaker || ''}`);
    const notes = notesFor(cn, entries[0].meta?.speaker || '');
    const key = await cacheKey(project, cfg, original, terms, notes), c = await dbGet('cache', key);
    if (c && !stray(c.text)) { entries.forEach((e) => hits.push({ ...e, translation: c.text, status: 'done', error: '' })); continue; }
    const m = maskText(original), e0 = entries[0], p = pos.get(e0.id);
    units.push({
      id: uid++, key, text: m.text, tokens: m.tokens, speaker: e0.meta?.speaker || '', entries, terms, notes,
      limit: entries.map((x) => limitFor(x, effCfg(project, cfg))).filter(Boolean).reduce((a, b) => (a ? { line: Math.min(a.line, b.line), lines: Math.min(a.lines, b.lines) } : b), null),
      ctx: all.slice(Math.max(0, p - 3), p).filter((x) => x.file === e0.file).map((x) => maskText(x.original).text.slice(0, 200)),
    });
  }
  if (hits.length) { await dbPutMany('entries', hits); n += hits.length; stat.done = stat.cached = hits.length; }
  tick(`${n + base} dari ${todo.length + base} teks`);
  const byId = new Map(units.map((u) => [u.id, u])); let streak = 0;
  // Gerbang bersama: bila provider membatasi (429/5xx), semua worker menunggu dan lajunya diperlambat bertahap, lalu pulih saat sukses.
  const gate = { until: 0, pace: 0 };
  const guarded = async (m) => {
    const w = Math.max(gate.until - Date.now(), gate.pace);
    if (w > 1500) tick(`Menunggu limit provider (${Math.round(w / 1000)} dtk) · ${n + base} dari ${todo.length + base} teks`);
    if (w > 0) await sleepSig(w, signal);
    try { const r = await chat(m, signal); gate.pace = gate.pace < 200 ? 0 : gate.pace / 2; if (auto && ++lim.okRun >= 4 && lim.cur < lim.max) { lim.cur++; lim.okRun = 0; } return r; }
    catch (e) {
      if (e.status === 429 || e.status >= 500) { if (auto) { lim.cur = Math.max(1, lim.cur - 1); lim.okRun = 0; } gate.until = Math.max(gate.until, Date.now() + Math.min(60000, e.retryAfter ?? 2000)); gate.pace = Math.min(5000, gate.pace ? gate.pace * 2 : 500); }
      throw e;
    }
  };
  const run = async (batch) => {
    const r = await translateBatch(batch, {
      chat: guarded, retry: { signal }, src: project.src, tgt: project.tgt, context: batch[0].ctx, style: cfg.style,
      check: (id, t) => (!t.trim() ? UI.emptyTr : !unmaskText(t, byId.get(id).tokens).ok ? UI.tokenBad : stray(t) ? STRAY_MSG : ''),
      onUsage: (u) => { stat.tokensIn += u?.prompt_tokens || 0; stat.tokensOut += u?.completion_tokens || 0; },
    });
    stat.expOut += batch.reduce((a, u) => a + u.text.length + 5, 0); stat.nb++;
    const upd = [], cache = [];
    r.ok.forEach((t, id) => {
      const u = byId.get(id), text = unmaskText(t, u.tokens).text;
      cache.push({ key: u.key, text, at: Date.now() });
      u.entries.forEach((e) => upd.push({ ...e, translation: text, status: 'done', error: '' })); stat.done += u.entries.length;
    });
    r.fail.forEach((msg, id) => { byId.get(id).entries.forEach((e) => upd.push({ ...e, status: 'error', error: msg })); stat.error += byId.get(id).entries.length; });
    await dbPutMany('cache', cache); await dbPutMany('entries', upd);
    n += upd.length; tick(`${n + base} dari ${todo.length + base} teks`);
    streak = r.ok.size ? 0 : streak + 1;
    if (streak >= 3) throw new LlmError(UI.tooMany, { fatal: true });
  };
  const work = async (batch) => {
    while (lim.active >= lim.cur) await sleepSig(150, signal);
    lim.active++;
    try { await run(batch); } finally { lim.active--; }
  };
  try { await runPool(makeBatches(units, eff.batchSize, eff.maxChars), eff.concurrency, eff.delay, signal, work); }
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
  const terms = termsFor(parseGlossary(cfg.glossary), `${e.original}\n${e.meta?.speaker || ''}`), notes = notesFor(parseNotes(cfg.charNotes), e.meta?.speaker || '');
  const r = await translateBatch([{ id: 0, text: m.text, speaker: e.meta?.speaker || '', limit: limitFor(e, effCfg(project, cfg)), terms, notes }], {
    chat: call, src: project.src, tgt: project.tgt, context: [], style: cfg.style,
    check: (id, t) => (t.trim() ? (unmaskText(t, m.tokens).ok ? '' : UI.tokenBad) : UI.emptyTr),
  });
  if (!r.ok.size) throw new LlmError(r.fail.get(0) || UI.badJson);
  const text = unmaskText(r.ok.get(0), m.tokens).text, u = { ...e, translation: text, status: 'done', error: '' };
  await dbPut('entries', u);
  await dbPut('cache', { key: await cacheKey(project, cfg, e.original, terms, notes), text, at: Date.now() });
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
let importNote = null;
const CODE_NAME = { 101: 'Show Text', 401: 'baris Show Text', 102: 'Show Choices', 402: 'cabang pilihan', 105: 'Scroll Text', 405: 'baris Scroll Text', 108: 'Comment', 408: 'lanjutan Comment', 355: 'Script', 655: 'lanjutan Script', 356: 'Plugin Command', 357: 'Plugin Command MZ' };
/** Normalisasi untuk pencarian: buang kode escape, spasi, tanda baca; samakan lebar huruf. */
const searchNorm = (t) => String(t).normalize('NFKC').replace(ESC, '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
/** Hitung bigram karakter (multiset) sebagai Map gram -> jumlah. */
const searchGrams = (n) => {
  const m = new Map();
  if (n.length < 2) { m.set(n, 1); return m; }
  for (let i = 0; i < n.length - 1; i++) { const g = n.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
};
/**
 * Cari teks di semua data asli proyek dan laporkan lokasinya (file, jenis perintah, path). Hanya membaca.
 * Cocok persis (potongan teks) = 100%. Kalau tidak persis, dihitung kemiripan (bigram karakter) dan hasil
 * dengan skor >= minScore ditampilkan, terurut dari yang paling mirip. Baris Show Text/Scroll/Comment/Script
 * yang berurutan juga digabung sebagai satu kandidat, supaya kalimat panjang yang dipecah per baris tetap ketemu.
 * Query yang terlalu pendek (< 6 karakter setelah normalisasi) hanya dicocokkan persis.
 * @returns {Promise<Array<{file:string, code:(number|undefined), path:string, text:string, score:number, lines:number}>>}
 */
export async function searchOrig(projectId, needle, max = 30, minScore = 60, onProgress = () => {}) {
  const qn = searchNorm(needle), res = [];
  if (!qn) return res;
  const fuzzy = qn.length >= 6, qg = searchGrams(qn);
  let qTotal = 0; for (const c of qg.values()) qTotal += c;
  const consider = (raw, file, path, cmd, lines) => {
    const n = searchNorm(raw);
    if (n.length < 2) return;
    let score;
    if (n.includes(qn)) score = 100;
    else {
      if (!fuzzy || n.length < qn.length * 0.4 || n.length > qn.length * 8) return;
      const g = searchGrams(n); let gTotal = 0, inter = 0;
      for (const c of g.values()) gTotal += c;
      for (const [k, c] of qg) { const d = g.get(k); if (d) inter += Math.min(c, d); }
      const dice = (2 * inter) / (qTotal + gTotal), cover = n.length > qn.length ? (inter / qTotal) * 0.85 : 0;
      score = Math.round(100 * Math.max(dice, cover));
    }
    if (score < minScore) return;
    res.push({ file, code: cmd?.code, path: path.join('/'), text: String(raw).replace(/\s+/g, ' ').slice(0, 100), score, lines });
    if (res.length > max * 4) { res.sort((x, y) => y.score - x.score); res.length = max * 2; }
  };
  const LINE = new Set([401, 405, 408, 655]);
  const files = await dbPrefix('origFiles', projectId + ':');
  let i = 0;
  for (const f of files) {
    if (++i % 6 === 0) { onProgress(i, files.length); await new Promise((r) => setTimeout(r, 0)); }
    let json; try { json = JSON.parse(f.text); } catch { continue; }
    const file = f.path.split('/').pop();
    const walk = (v, path, cmd) => {
      if (typeof v === 'string') { consider(v, file, path, cmd, 1); return; }
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) {
        // gabungkan baris berurutan dengan kode sama (mis. 401 untuk satu pesan)
        let run = [], first = null, start = -1;
        const flush = () => { if (run.length > 1) consider(run.join(' '), file, [...path, start, 'parameters', 0], first, run.length); run = []; first = null; };
        v.forEach((x, k) => {
          const isLine = x && typeof x === 'object' && !Array.isArray(x) && LINE.has(x.code) && typeof x.parameters?.[0] === 'string';
          if (isLine && first && first.code !== x.code) flush();
          if (isLine) { if (!first) { first = x; start = k; } run.push(x.parameters[0]); } else flush();
        });
        flush();
        v.forEach((x, k) => walk(x, [...path, k], cmd));
        return;
      }
      const c = typeof v.code === 'number' ? v : cmd;
      for (const k of Object.keys(v)) if (!k.startsWith('__')) walk(v[k], [...path, k], c);
    };
    walk(json, [], null);
  }
  res.sort((x, y) => y.score - x.score);
  return res.slice(0, max);
}
async function viewProyek() {
  const msg = h('p', { class: 'mut' }), bar = h('progress', { value: '0', max: '1', hidden: '' });
  const box = card(h('h2', {}, 'Impor game'));
  let src = 'auto', busy = false;
  if (importNote) { msg.className = importNote.bad ? 'err' : 'mut'; msg.textContent = importNote.text; importNote = null; }
  const lock = (on) => { busy = on; box.classList.toggle('busy', on); bar.hidden = !on; };
  const run = async (ev) => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length || busy) return;
    lock(true); bar.removeAttribute('value'); msg.className = 'mut'; msg.textContent = 'Mengimpor…';
    try {
      const p = await importProject(files, src, (t, d, n) => { msg.textContent = t; if (n) { bar.max = n; bar.value = d; } else bar.removeAttribute('value'); }, { allow: (await loadConfig()).pluginAllow });
      importNote = p.total
        ? { text: `Impor selesai. ${p.total} teks dari ${p.files} file${p.broken.length ? `, ${p.broken.length} file rusak dilewati` : ''}. Lanjut ke tab Translate` }
        : { bad: true, text: UI.emptyImp };
      await render();
    } catch (e) { lock(false); msg.className = 'err'; msg.textContent = e.message; }
  };
  const sel = h('select', { onchange: (e) => { src = e.target.value; } },
    h('option', { value: 'auto' }, 'Otomatis (Jepang/Inggris campur)'), h('option', { value: 'all' }, 'Semua teks (bahasa apa pun, impor penuh)'), h('option', { value: 'ja' }, 'Jepang'), h('option', { value: 'en' }, 'Inggris'));
  const pick = (label, attrs) => h('label', { class: 'file' }, label, h('input', { type: 'file', onchange: run, ...attrs }));
  box.append(h('label', {}, 'Bahasa sumber'), sel,
    pick('Pilih folder data', { webkitdirectory: '', multiple: '' }), pick('Pilih zip game', { accept: '.zip' }), pick('Pilih Game.rgss3a', {}), bar, msg);
  const out = [box];
  const p = await currentProject();
  if (p) out.push(card(h('h2', {}, 'Ringkasan'),
    h('p', { class: 'mut' }, `Engine: ${p.engine}\nSumber: ${srcLabel(p.src)}\nFile data: ${p.files}${p.broken.length ? ` (rusak: ${p.broken.length})` : ''}\nTotal teks: ${p.total}\nPlugin message: ${p.msgPlugins?.length ? `${p.msgPlugins.join(', ')} (pemecahan baris manual dimatikan)` : p.pluginsSeen ? 'tidak ada (pemecahan baris manual aktif)' : 'tidak diketahui (js/plugins.js tidak ikut dipilih)'}`),
    p.paramNote ? h('p', { class: 'err' }, p.paramNote) : '',
    p.engine === 'VX Ace' ? (() => {
      const d = p.scriptsDiag;
      if (!d) return h('p', { class: 'mut' }, 'Diagnostik Scripts.rvdata2: impor ulang proyek ini untuk memeriksa.');
      if (d.missing) return h('p', { class: 'mut' }, 'Scripts.rvdata2 tidak ikut dipilih (pilih seluruh folder Data atau Game.rgss3a).');
      if (d.error) return h('p', { class: 'err' }, `Scripts.rvdata2 gagal dibaca: ${d.error}`);
      return h('p', { class: d.hits ? 'err' : 'mut' }, `Scripts.rvdata2: ${d.total} script, ${d.hits} kalimat Inggris/Jepang di dalam tanda kutip.` + (d.hits ? `\n${d.found.map(([k, n, sm]) => `${k}: ${n} | ${sm.map((x) => `"${x}"`).join(' / ')}`).join('\n')}` : ''));
    })() : '',
    (() => {
      if (!p.gaps) return h('p', { class: 'mut' }, 'Diagnostik teks yang belum terbaca: impor ulang proyek ini untuk menghitung.');
      if (!p.gaps.length) return h('p', { class: 'mut' }, 'Diagnostik: tidak ada kalimat lain yang terlewat di file data.');
      return h('p', { class: 'err' }, `Kalimat yang belum terbaca (cek jenisnya):\n${p.gaps.map(([k, g]) => `${k}: ${g.n} | ${g.samples.map((x) => `"${x}"`).join(' / ')}`).join('\n')}`);
    })(),
    p.total ? '' : h('p', { class: 'err' }, UI.emptyImp),
    Object.entries(p.counts).map(([k, v]) => h('span', { class: 'badge' }, `${k} ${v}`)),
    (() => {
      const st = h('p', { class: 'mut' }); let armed = false, tm = 0;
      const b = h('button', { onclick: async () => {
        // konfirmasi dua ketukan (confirm() sering diblokir browser HP)
        if (!armed) { armed = true; b.textContent = 'Yakin? Ketuk lagi untuk menghapus'; tm = setTimeout(() => { armed = false; b.textContent = 'Hapus proyek'; }, 5000); return; }
        clearTimeout(tm); b.disabled = true; st.className = 'mut'; st.textContent = 'Menghapus… (proyek besar bisa butuh beberapa detik)';
        try { await deleteProject(p.id); await render(); }
        catch (e) { st.className = 'err'; st.textContent = `Gagal menghapus: ${e?.message || e}`; b.disabled = false; armed = false; b.textContent = 'Hapus proyek'; }
      } }, 'Hapus proyek');
      return h('div', {}, b, st);
    })()));
  if (p) {
    const q = h('textarea', { rows: '3', autocomplete: 'off', spellcheck: 'false', placeholder: 'mis. taste setting, atau satu kalimat panjang' }), res = h('p', { class: 'mut' });
    const minIn = h('input', { type: 'number', min: '30', max: '100', value: '60', inputmode: 'numeric' });
    out.push(card(h('h2', {}, 'Cari teks di data game'), h('p', { class: 'mut' }, 'Ketik potongan teks atau kalimat yang belum berubah di game (bahasa aslinya). Cocok persis tampil 100%; selain itu dicari yang mirip dan ditampilkan dengan persentase kemiripan. Kalimat yang dipecah per baris di game juga ikut dicocokkan. Query kurang dari 6 karakter hanya dicari persis.'), q,
      h('label', { class: 'mut' }, 'Minimal mirip (%): '), minIn,
      h('button', { onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true; res.className = 'mut'; res.textContent = 'Mencari…';
        try {
          const minScore = Math.min(100, Math.max(30, Number(minIn.value) || 60));
          const r = await searchOrig(p.id, q.value, 30, minScore, (d, n) => { res.textContent = `Mencari… ${d}/${n} file`; });
          res.textContent = r.length ? r.map((x) => `${x.score}% | ${x.file} | ${x.code === undefined ? 'field data' : `kode ${x.code} (${CODE_NAME[x.code] || 'lainnya'})`}${x.lines > 1 ? ` | gabungan ${x.lines} baris` : ''}\n${x.path}\n"${x.text}"`).join('\n\n') : `Tidak ada yang mirip minimal ${minScore}% di file data yang diimpor. Coba turunkan persentasenya.`;
        } catch (e) { res.className = 'err'; res.textContent = e?.message || String(e); }
        b.disabled = false;
      } }, 'Cari'), res));
    // Pulihkan dari game asli: semua jenis teks (field, dialog, pilihan, pembicara) per kategori.
    const cats = [...new Set([...ALL_CATS, ...Object.keys(p.counts || {})])], pickC = new Set(cats);
    const fillOpt = { on: true }, boxes = [];
    const rsrc = h('select', { onchange: (e) => { p.src = e.target.value; } },
      ...[['auto', 'Otomatis (Jepang/Inggris campur)'], ['all', 'Semua teks (bahasa apa pun, impor penuh)'], ['ja', 'Jepang'], ['en', 'Inggris']].map(([v, t]) => h('option', { value: v, ...(p.src === v ? { selected: '' } : {}) }, t)));
    const rmsg = h('p', { class: 'mut' }), rbar = h('progress', { value: '0', max: '1', hidden: '' });
    const doRestore = async (ev) => {
      const fs = [...ev.target.files]; ev.target.value = ''; if (!fs.length) return;
      if (!pickC.size) { rmsg.className = 'err'; rmsg.textContent = 'Centang minimal satu kategori'; return; }
      rbar.hidden = false; rmsg.className = 'mut'; rmsg.textContent = 'Membaca game asli…';
      try {
        const r = await restoreFromPristine(p, fs, pickC, (t, d, n) => { rmsg.textContent = t; rbar.max = n; rbar.value = d; }, fillOpt.on);
        rmsg.textContent = `Selesai. File cocok: ${r.matched} (tidak ada di game asli: ${r.nofile}, gagal dibaca: ${r.bad})\nFile baru dari game asli: ${r.newFiles}\nDipulihkan: ${r.restored}, dibuat baru: ${r.created}, dihapus (tidak ada di game asli): ${r.removed}\nKategori tidak dipilih: tetap ${r.kept}, dipindah posisi ${r.moved}, ditandai skipped ${r.orphan}\nContoh file gagal: ${r.badNames.join(', ') || '-'}\nBuka tab Review untuk melihat hasilnya, lalu ekspor ulang dan timpa folder Data. ${fillOpt.on ? 'Kolom terjemahan diisi teks asli (status done), jadi ikut masuk patch.' : 'Teks yang dipulihkan berstatus pending.'}`;
      } catch (e) { rmsg.className = 'err'; rmsg.textContent = e?.message || String(e); }
      rbar.hidden = true;
    };
    const setAll = (on) => { pickC.clear(); if (on) cats.forEach((c) => pickC.add(c)); boxes.forEach((b) => { b.checked = on; }); };
    const pickR = (label, attrs) => h('label', { class: 'file' }, label, h('input', { type: 'file', onchange: doRestore, ...attrs }));
    out.push(card(h('h2', {}, 'Pulihkan dari game asli'),
      h('p', { class: 'mut' }, 'Untuk teks yang terlanjur diubah dan tidak punya backup. Pilih game asli yang belum diubah dan kategori yang mau dikembalikan. File asli proyek diganti dengan file dari game asli, lalu teks kategori terpilih diambil ulang dan otomatis mengisi kolom terjemahan di tab Review (dialog, pilihan, pembicara, field). Teks yang belum ada di proyek dibuat baru dari file asli, termasuk file yang hilang. Kategori yang tidak dicentang tetap, terjemahannya tidak disentuh.'),
      h('label', {}, 'Bahasa sumber (menentukan teks mana yang diambil)'), rsrc,
      h('div', { class: 'row' }, h('button', { onclick: () => setAll(true) }, 'Pilih semua'), h('button', { onclick: () => setAll(false) }, 'Kosongkan')),
      cats.map((c) => { const cb = h('input', { type: 'checkbox', ...(pickC.has(c) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? pickC.add(c) : pickC.delete(c); } }); boxes.push(cb); return h('label', { class: 'row' }, cb, ` ${c}`); }),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: '', onchange: (e) => { fillOpt.on = e.target.checked; } }), ' Isi kolom terjemahan dengan teks asli (status done) supaya semua file ikut di patch dan kembali seperti game asli. Matikan kalau mau hasilnya pending lalu diterjemahkan ulang'),
      pickR('Pilih folder data asli', { webkitdirectory: '', multiple: '' }), pickR('Pilih zip game asli', { accept: '.zip' }), pickR('Pilih Game.rgss3a asli', {}), rbar, rmsg));
    const smsg = h('p', { class: 'mut' });
    out.push(card(h('h2', {}, 'Selamatkan teks Tidak ada di game asli'),
      h('p', { class: 'mut' }, 'Dipakai setelah Pulihkan bila ada dialog bertanda skipped. Terjemahannya masih tersimpan; tombol ini mencocokkan ulang posisinya ke file asli proyek yang sekarang (spasi/baris baru diabaikan, lalu yang mirip >= 80% dengan kode escape sama). Yang cocok jadi berstatus edited dan ikut diekspor. Cek hasilnya di tab Review.'),
      h('button', { onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true; smsg.className = 'mut'; smsg.textContent = 'Mencocokkan…';
        try {
          const r = await rescueSkipped(p, (t) => { smsg.textContent = t; });
          smsg.textContent = `Selesai. Entri skipped: ${r.orphans}\nDiselamatkan (teks sama): ${r.exact}\nDiselamatkan (mirip, mohon dicek): ${r.fuzzy}\nMasih tidak cocok: ${r.left}${r.bad ? `\nFile gagal dibaca: ${r.bad}` : ''}`;
        } catch (e) { smsg.className = 'err'; smsg.textContent = e?.message || String(e); }
        b.disabled = false;
      } }, 'Selamatkan sekarang'),
      h('p', { class: 'mut' }, 'Kalau pilihan (choice) masih tidak cocok karena teks di game yang diedit beda dengan game asli (mis. beda bahasa), pakai tombol ini. Pilihan dicocokkan lewat posisi dan urutannya, bukan teksnya. Hanya yang pasangannya pasti yang dipindahkan.'),
      h('button', { onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true; smsg.className = 'mut'; smsg.textContent = 'Mencocokkan lewat urutan…';
        try {
          const r = await rescueByPosition(p, (t) => { smsg.textContent = t; });
          smsg.textContent = `Selesai. Pilihan skipped: ${r.orphans}\nDipindahkan ke posisi game asli: ${r.moved}\nMasih tidak cocok: ${r.left}${r.ambiguous ? ` (${r.ambiguous} kelompok ambigu, dibiarkan)` : ''}`;
        } catch (e) { smsg.className = 'err'; smsg.textContent = e?.message || String(e); }
        b.disabled = false;
      } }, 'Selamatkan pilihan lewat urutan'), smsg));
  }
  return out;
}
const job = { running: false, ctl: null, value: 0, max: 1, text: '', err: false, ui: null };
const paintJob = (force) => {
  const u = job.ui; if (!u || !(force || u.bar.isConnected)) return;
  u.bar.max = job.max; u.bar.value = job.value; u.txt.textContent = job.text; u.txt.className = job.err ? 'err' : 'mut';
  u.start.disabled = job.running; u.stop.disabled = !job.running;
};
// Kategori yang dipilih untuk diterjemahkan (tab Translate). Disimpan per proyek selama halaman terbuka.
const catSel = { pid: null, set: null };
async function startJob() {
  if (job.running) return;
  const cfg = await loadConfig(), p = await currentProject();
  job.err = false;
  if (!cfg.apiKey) { job.err = true; job.text = UI.noKey; return paintJob(); }
  const cats = catSel.pid === p.id && catSel.set ? [...catSel.set] : null;
  if (cats && !cats.length) { job.err = true; job.text = 'Pilih minimal satu kategori dulu'; return paintJob(); }
  const before = await dbQuery('entries', 'projectId', p.id), base = before.filter((e) => e.status === 'done' || e.status === 'edited').length;
  job.running = true; job.ctl = new AbortController(); job.value = base; job.max = base + before.filter((e) => TODO.has(e.status) && (!cats || cats.includes(e.category))).length || 1; job.text = 'Memulai…'; paintJob();
  let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch { /* layar tetap boleh mati */ }
  try {
    let t0 = Date.now(), d0 = null;
    const r = await runTranslation(p, cfg, { signal: job.ctl.signal, base, cats, onProgress: (d, t, txt) => {
      if (d0 === null) { d0 = d; t0 = Date.now(); }
      let eta = '';
      if (d > d0 && d < t) { const sec = ((t - d) * (Date.now() - t0)) / 1000 / (d - d0); eta = ` · sisa ±${sec >= 90 ? Math.round(sec / 60) + ' menit' : Math.round(sec) + ' detik'}`; }
      job.value = d; job.max = t || 1; job.text = txt + eta; paintJob();
    } });
    job.text = !r.done && !r.error && !r.stopped ? UI.nothing
      : `${r.stopped ? 'Dihentikan' : 'Selesai'}. ${r.done} berhasil (${r.cached} dari cache), ${r.error} error${r.error ? '. Lihat di tab Review, filter Error' : ''}`;
  } catch (e) { job.err = true; job.text = e.message; }
  try { await lock?.release(); } catch { /* abaikan */ }
  job.running = false; paintJob();
  if (/^#\/translate/.test(location.hash)) render();
}
async function viewTranslate() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const cfg = await loadConfig(), all = await dbQuery('entries', 'projectId', p.id);
  // Kategori yang masih punya teks belum diterjemahkan (pending/error). Default: semua terpilih.
  const todoBy = new Map(); all.filter((e) => TODO.has(e.status)).forEach((e) => todoBy.set(e.category, (todoBy.get(e.category) || 0) + 1));
  if (catSel.pid !== p.id || !catSel.set) { catSel.pid = p.id; catSel.set = new Set([...todoBy.keys()].filter((k) => k !== 'comment-label' && k !== 'comment-teks' && k !== 'script-teks')); }
  for (const k of [...catSel.set]) if (!todoBy.has(k)) catSel.set.delete(k);
  const pickedAll = [...todoBy.keys()].every((k) => catSel.set.has(k));
  const scoped = pickedAll ? all : all.filter((e) => !TODO.has(e.status) || catSel.set.has(e.category));
  const cnt = (s) => all.filter((e) => e.status === s).length, est = estimateCost(scoped, cfg, p.src);
  const tgt = h('select', { onchange: async (e) => { p.tgt = e.target.value; await dbPut('projects', { ...p, updatedAt: Date.now() }); await render(); } },
    h('option', { value: 'id', ...(p.tgt === 'id' ? { selected: '' } : {}) }, 'Indonesia'),
    h('option', { value: 'en', ...(p.tgt === 'en' ? { selected: '' } : {}) }, 'Inggris'));
  const bar = h('progress', { value: '0', max: '1' }), txt = h('p', { class: 'mut' });
  const start = h('button', { class: 'pri', onclick: startJob }, cnt('done') || cnt('error') ? 'Lanjutkan' : 'Mulai translate');
  const stop = h('button', { onclick: () => job.ctl?.abort() }, 'Hentikan');
  job.ui = { bar, txt, start, stop };
  if (!p.total) job.text = UI.emptyImp, job.err = true;
  else if (!job.running && !job.text) {
    const fin = cnt('done') + cnt('edited'), todoN = cnt('pending') + cnt('translating') + cnt('error');
    job.value = fin; job.max = fin + todoN || 1;
    job.text = fin ? `${fin} dari ${fin + todoN} teks sudah tersimpan${todoN ? '. Tekan Lanjutkan untuk meneruskan' : ''}` : '';
  }
  const money = est.cost === null ? 'isi harga token di Pengaturan' : `sekitar ${est.cost.toFixed(4)} (satuan mengikuti harga di Pengaturan)`;
  const out = [
    card(h('h2', {}, 'Bahasa'), h('label', {}, 'Sumber'), h('p', { class: 'mut' }, srcLabel(p.src)), h('label', {}, 'Target'), tgt),
    card(h('h2', {}, 'Status'), ['pending', 'translating', 'done', 'edited', 'error', 'skipped'].filter(cnt).map((s) => h('span', { class: 'badge' }, `${s} ${cnt(s)}`)),
      h('p', { class: 'mut' }, `${est.auto ? `Mode otomatis: ${est.batchSize} teks per batch, konkurensi menyesuaikan\n` : ''}Perkiraan kasar: ${est.items} teks unik, ${est.batches} batch\nToken masuk ${est.inTok}, keluar ${est.outTok}\nBiaya: ${money}\nBelum menghitung cache.`)),
    todoBy.size ? card(h('h2', {}, 'Kategori yang diterjemahkan'),
      h('p', { class: 'mut' }, 'Centang kategori yang mau diterjemahkan sekarang. Hanya teks yang belum diterjemahkan (pending/error) di kategori itu yang dikirim ke LLM di Pengaturan. Kategori lain tidak disentuh.'),
      [...todoBy].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', ...(catSel.set.has(k) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? catSel.set.add(k) : catSel.set.delete(k); render(); } }), ` ${k} (${n})`)),
      h('div', { class: 'row' },
        h('button', { onclick: () => { catSel.set = new Set(todoBy.keys()); render(); } }, 'Pilih semua'),
        h('button', { onclick: () => { catSel.set = new Set(); render(); } }, 'Kosongkan')),
      (() => {
        const back = all.filter((e) => catSel.set.has(e.category) && e.status !== 'pending');
        if (!back.length) return '';
        let armed = false, tm = 0; const msg = h('p', { class: 'mut' });
        const b = h('button', { onclick: async () => {
          if (!armed) { armed = true; b.textContent = `Yakin? Ketuk lagi: ${back.length} teks dikosongkan`; tm = setTimeout(() => { armed = false; b.textContent = 'Kembalikan ke teks asli'; }, 5000); return; }
          clearTimeout(tm); b.disabled = true;
          await dbPutMany('entries', back.map((e) => ({ ...e, translation: '', status: 'pending', error: '' })));
          await render();
        } }, 'Kembalikan ke teks asli');
        return h('div', {}, h('p', { class: 'mut' }, 'Batalkan terjemahan kategori yang dicentang: hasilnya dikosongkan dan saat ekspor teks itu kembali seperti data yang kamu impor.'), b, msg);
      })()) : '',
    cnt('done') ? (() => {
      const m = h('p', { class: 'mut' });
      return card(h('h2', {}, 'Periksa hasil'), h('p', { class: 'mut' }, 'Cari terjemahan yang masih bercampur huruf Jepang atau asing (setengah terjemah). Yang ketemu ditandai error supaya bisa diterjemahkan ulang lewat tombol Lanjutkan. Terjemahan yang kamu edit manual tidak disentuh.'),
        h('button', { onclick: async (ev) => {
          const b = ev.currentTarget; b.disabled = true;
          const bad = all.filter((e) => e.status === 'done' && stray(e.translation));
          if (bad.length) await dbPutMany('entries', bad.map((e) => ({ ...e, status: 'error', error: STRAY_MSG })));
          m.textContent = bad.length ? `${bad.length} teks ditandai error.` : 'Tidak ada hasil yang bercampur huruf asing.';
          b.disabled = false; if (bad.length) render();
        } }, 'Periksa hasil'), m);
    })() : '',
    card(h('p', { class: 'mut' }, `Teks dikirim ke provider yang dipilih (${cfg.baseUrl}) dengan model ${cfg.model}.`), bar, txt, h('div', { class: 'row' }, start, stop)),
  ];
  paintJob(true);
  return out;
}
const FIELDS = [
  ['baseUrl', 'Base URL', 'url'], ['apiKey', 'API key', 'password'], ['model', 'Model', 'text'], ['extraBody', 'Body tambahan JSON (opsional)', 'text'], ['temperature', 'Temperature (0 sampai 2)', 'number'],
  ['batchSize', 'Ukuran batch (teks)', 'number'], ['maxChars', 'Batas karakter per batch', 'number'], ['concurrency', 'Konkurensi maks (1 sampai 12)', 'number'],
  ['delay', 'Jeda antar request (ms)', 'number'], ['timeout', 'Batas waktu per request (detik)', 'number'], ['wrapWidth', 'Lebar baris maks tanpa face (0 = mati)', 'number'], ['wrapFace', 'Lebar baris maks dengan face', 'number'], ['priceIn', 'Harga token masuk per 1 juta', 'number'], ['priceOut', 'Harga token keluar per 1 juta', 'number'],
];
async function viewSettings() {
  const c = await loadConfig(), msg = h('p', { class: 'mut' }), inp = {};
  const form = FIELDS.flatMap(([k, label, type]) => {
    inp[k] = h('input', { type, value: String(c[k]), autocomplete: 'off', ...(type === 'number' ? { step: 'any', inputmode: 'decimal' } : {}) });
    return [h('label', {}, label), inp[k]];
  });
  const allowTa = h('textarea', { rows: '6', spellcheck: 'false', autocomplete: 'off', placeholder: 'mz NamaPlugin.namaPerintah.namaArgumen\nmv NamaPerintah\nparam NamaPlugin.namaParameter' }, c.pluginAllow || '');
  const styleTa = h('textarea', { rows: '8', spellcheck: 'false' }, c.style ?? DEFAULT_STYLE), notesTa = h('textarea', { rows: '5', spellcheck: 'false', autocomplete: 'off', placeholder: 'アリス: sopan, pakai saya/Anda\nバルト: preman, pakai gue/lo, kasar' }, c.charNotes || '');
  const glossTa = h('textarea', { rows: '6', spellcheck: 'false', autocomplete: 'off', placeholder: 'アリス = Alice\nポーション = Ramuan' }, c.glossary || '');
  const remember = h('input', { type: 'checkbox', ...(c.remember ? { checked: '' } : {}) });
  const autoCb = h('input', { type: 'checkbox', ...(c.auto !== false ? { checked: '' } : {}) });
  const fast = h('input', { type: 'checkbox', ...(c.fast ? { checked: '' } : {}) });
  const num = (k, lo, hi) => Math.min(hi, Math.max(lo, Number(inp[k].value) || lo));
  const gather = () => ({
    baseUrl: inp.baseUrl.value.trim(), apiKey: inp.apiKey.value.trim(), remember: remember.checked, model: inp.model.value.trim() || DEFAULT_CONFIG.model, extraBody: inp.extraBody.value.trim(),
    temperature: num('temperature', 0, 2), batchSize: Math.round(num('batchSize', 1, 100)), maxChars: Math.round(num('maxChars', 500, 12000)),
    concurrency: Math.round(num('concurrency', 1, 12)), delay: Math.round(num('delay', 0, 10000)), timeout: Math.round(num('timeout', 10, 600)), wrapWidth: Math.round(num('wrapWidth', 0, 200)), wrapFace: Math.round(num('wrapFace', 0, 200)), fast: fast.checked, auto: autoCb.checked, pluginAllow: allowTa.value, glossary: glossTa.value, style: styleTa.value, charNotes: notesTa.value, priceIn: num('priceIn', 0, 1e6), priceOut: num('priceOut', 0, 1e6),
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
      const t0 = Date.now(), r = await llmChat(n, buildMessages({ src: 'ja', tgt: 'id', units: [{ id: 0, text: 'こんにちは' }], context: [] }));
      const t = toArray(parseJsonLoose(r.text))?.[0]?.text, tok = r.usage?.completion_tokens;
      // Jawaban sependek ini wajarnya di bawah sekitar 40 token keluar; jauh di atas itu berarti model memakai mode berpikir.
      say(t ? `Terhubung. Contoh hasil: ${t}\nWaktu ${((Date.now() - t0) / 1000).toFixed(1)} dtk, token keluar ${tok ?? 'tidak dilaporkan'}${tok > 120 ? ' (tinggi: model kemungkinan memakai mode berpikir)' : ''}` : 'Terhubung, tetapi format respons tidak sesuai. Coba model lain', !t);
    } catch (e) { say(e.message, true); }
  };
  const saveStyle = async () => { const n = gather(); if (!urlOk(n.baseUrl)) return say(UI.urlBad, true); await saveConfig(n); say('Tersimpan'); };
  return [card(h('h2', {}, 'Gaya bahasa'), h('p', { class: 'mut' }, 'Dikirim ke model di setiap batch. Kosongkan untuk memakai gaya bawaan model. Berlaku untuk terjemahan berikutnya; teks yang sudah selesai tidak berubah.'), styleTa,
    h('label', {}, 'Catatan per karakter (nama pembicara: gaya bicara)'), notesTa,
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: saveStyle }, 'Simpan gaya'), h('button', { onclick: () => { styleTa.value = DEFAULT_STYLE; } }, 'Pulihkan bawaan'))),
  card(h('h2', {}, 'Glosarium (opsional)'), h('p', { class: 'mut' }, 'Satu baris per istilah: sumber = terjemahan. Istilah yang muncul di sebuah teks dikirim ke model sebagai acuan. Teks yang isinya persis satu istilah diterjemahkan langsung tanpa model. Berlaku untuk terjemahan berikutnya; teks yang sudah selesai tidak diubah.'), glossTa, h('button', { class: 'pri', onclick: async () => { const n = gather(); if (!urlOk(n.baseUrl)) return say(UI.urlBad, true); await saveConfig(n); say(`Tersimpan. ${parseGlossary(n.glossary).length} istilah`); } }, 'Simpan glosarium')),
  card(h('h2', {}, 'Daftar aman plugin (opsional)'), h('p', { class: 'mut' }, 'Kosong = perintah dan parameter plugin tidak disentuh. Isi hanya entri yang kamu yakin berisi teks tampil. Berlaku saat impor, jadi impor ulang proyek setelah mengubahnya.'), allowTa, h('button', { class: 'pri', onclick: async () => { const n = gather(); if (!urlOk(n.baseUrl)) return say(UI.urlBad, true); await saveConfig(n); say('Tersimpan'); } }, 'Simpan daftar')),
  card(h('h2', {}, 'Pengaturan LLM'),
    h('label', { class: 'chk' }, autoCb, 'Atur kecepatan otomatis (disarankan)'),
    h('p', { class: 'mut' }, 'Ukuran batch dan konkurensi diatur sendiri mengikuti panjang teks dan respons provider. Isian ukuran batch, batas karakter, konkurensi, dan jeda di bawah baru dipakai kalau ini dimatikan.'),
    ...form,
    h('label', { class: 'chk' }, fast, 'Matikan mode berpikir model (khusus OpenRouter, lebih cepat)'),
    h('label', { class: 'chk' }, remember, 'Ingat key di perangkat ini'),
    h('p', { class: 'mut' }, 'Key hanya dikirim ke base URL di atas. Jangan aktifkan di perangkat bersama.'),
    h('div', { class: 'row' }, h('button', { class: 'pri', onclick: save }, 'Simpan'), h('button', { onclick: test }, 'Tes koneksi')), msg),
  card(h('h2', {}, 'Hapus semua data'), h('p', { class: 'mut' }, 'Menghapus semua proyek, terjemahan, cache, dan pengaturan aplikasi ini. Data lain di situs ini tidak disentuh. Ketik HAPUS untuk lanjut.'), wipe, wipeBtn)];
}
const FILTERS = [['all', 'Semua status'], ['pending', 'Pending'], ['done', 'Done'], ['edited', 'Diedit'], ['error', 'Error'], ['skipped', 'Skipped']];
/** Filter khusus: cari teks asli yang memuat kode/fungsi tertentu. Dicocokkan ke teks asli (kode game ada di sana). */
const FUNC_FILTERS = [
  ['any', 'Semua jenis kode/fungsi', null],
  ['esc', 'Ada kode escape apa pun', () => new RegExp(ESC.source)],
  ['v', 'Variabel \\V[n] / v[n]', /\\v\[\d+\]|\bv\[\d+\]/i],
  ['s', 'Switch s[n]', /\bs\[\d+\]/i],
  ['n', 'Nama aktor \\N[n] / \\P[n]', /\\[np]\[\d+\]/i],
  ['c', 'Warna \\C[n]', /\\c\[(?:\d+|#[0-9a-f]{3,8})\]/i],
  ['i', 'Ikon \\I[n]', /\\i\[\d+\]/i],
  ['fn', 'Pemanggilan fungsi, mis. if(...)', /\b[A-Za-z_]\w*\([^)\n]*(?:\[\d+\]|\\[A-Za-z]+\[)/],
  ['kw', 'Kata kunci script (if, else, var, return...)', /\b(?:if|else|elsif|unless|while|for|var|let|const|return|function|def|end|true|false|nil|null)\b/],
  ['game', 'Objek $game...', /\$game[A-Za-z]+/],
  ['ctl', 'Kontrol \\{ \\} \\. \\| \\! \\^ \\> \\< \\$ \\G', /\\[{}.|!^><$gG]/],
  ['tag', 'Tag <...>', /<\/?[A-Za-z][^>\n]{0,40}>/],
  ['ph', 'Placeholder %1', /%\d/],
];
const longLine = (t) => t.split('\n').some((l) => stripEscapes(l).length > LINE_WARN);
/** Ganti kata di terjemahan. Kode escape tidak disentuh. Mengembalikan {text, count}. */
function replaceWord(text, find, rep, { whole = true, ignoreCase = true } = {}) {
  if (!find) return { text, count: 0 };
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), W = '[\\p{L}\\p{N}_]';
  const re = new RegExp(whole ? `(?<!${W})${esc}(?!${W})` : esc, ignoreCase ? 'giu' : 'gu');
  const fixCase = (m) => !ignoreCase || !rep ? rep : m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase() ? rep.toUpperCase() : m[0] !== m[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep;
  let count = 0;
  const parts = text.split(new RegExp('(' + ESC.source + ')')); // indeks ganjil = kode escape
  const out = parts.map((p, i) => (i % 2 ? p : p.replace(re, (m) => { count++; return fixCase(m); }))).join('');
  return { text: out, count };
}
async function viewReview() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const rows = (await dbQuery('entries', 'projectId', p.id)).sort((a, b) => a.id - b.id);
  let filter = 'all', cat = 'all', fn = 'any', mode = 'loose', q = '', qRaw = '', qRe = null, page = 0;
  const origNorm = new WeakMap(), normOf = (e) => { let v = origNorm.get(e); if (v === undefined) { v = searchNorm(e.original); origNorm.set(e, v); } return v; };
  const box = h('div'), info = h('p', { class: 'mut' });
  let qErr = '';
  const fnTest = (k) => { const f = FUNC_FILTERS.find((x) => x[0] === k); if (!f || !f[2]) return null; return typeof f[2] === 'function' ? f[2]() : f[2]; };
  // Cocokkan kata kunci ke teks asli + terjemahan. 'loose' = abaikan spasi/tanda baca/kode (lama); 'exact' = potongan literal apa adanya (cocok untuk \v[, (\v, if); 'regex' = ekspresi reguler.
  const matchText = (e) => {
    if (!qRaw) return true;
    const k = qRaw.toLowerCase(), lit = e.original.toLowerCase().includes(k) || (e.translation || '').toLowerCase().includes(k);
    if (mode === 'loose' && q) return lit || normOf(e).includes(q) || searchNorm(e.translation || '').includes(q);
    if (mode === 'regex') return qErr ? true : !!qRe && (qRe.test(e.original) || qRe.test(e.translation || ''));
    return lit;
  };
  const setQuery = (v) => {
    qRaw = v; q = searchNorm(v); qRe = null; qErr = '';
    // Kueri yang isinya cuma tanda baca/kode tidak punya bentuk 'loose'; otomatis dicari persis supaya tidak menampilkan semua teks.
    if (mode === 'regex' && v) { try { qRe = new RegExp(v, 'iu'); } catch (x) { qErr = `Regex tidak valid: ${x.message}`; } }
    page = 0; fill();
  };
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
    const fnRe = fnTest(fn);
    const list = rows.filter((e) => (filter === 'all' || e.status === filter) && (cat === 'all' || e.category === cat) && (!fnRe || fnRe.test(e.original)) && matchText(e));
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); page = Math.min(page, pages - 1);
    info.textContent = qErr ? qErr : `${list.length} teks`; info.className = qErr ? 'err' : 'mut';
    const go = (n) => () => { page = n; fill(); scrollTo(0, 0); };
    box.replaceChildren(...list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(rowCard),
      h('div', { class: 'row' }, h('button', { onclick: go(page - 1), ...(page ? {} : { disabled: '' }) }, 'Sebelumnya'),
        h('button', { onclick: go(page + 1), ...(page < pages - 1 ? {} : { disabled: '' }) }, `Berikutnya (${page + 1}/${pages})`)));
  };
  const sCnt = new Map(); rows.forEach((e) => sCnt.set(e.status, (sCnt.get(e.status) || 0) + 1));
  const sel = h('select', { 'aria-label': 'Filter status', onchange: (e) => { filter = e.target.value; page = 0; fill(); } }, FILTERS.map(([v, t]) => h('option', { value: v }, v === 'all' ? `${t} (${rows.length})` : `${t} (${sCnt.get(v) || 0})`)));
  const fnSel = h('select', { 'aria-label': 'Filter kode atau fungsi', onchange: (e) => { fn = e.target.value; page = 0; fill(); } }, FUNC_FILTERS.map(([v, t]) => { const re = fnTest(v); return h('option', { value: v }, re ? `${t} (${rows.filter((x) => re.test(x.original)).length})` : t); }));
  const modeSel = h('select', { 'aria-label': 'Mode pencarian', onchange: (e) => { mode = e.target.value; setQuery(qRaw); } },
    h('option', { value: 'loose' }, 'Cari longgar (abaikan spasi & tanda baca)'), h('option', { value: 'exact' }, 'Cari persis (kode & tanda baca, mis. \\v[ atau if)'), h('option', { value: 'regex' }, 'Regex'));
  const cats = new Map(); rows.forEach((e) => cats.set(e.category, (cats.get(e.category) || 0) + 1));
  const catSel = h('select', { onchange: (e) => { cat = e.target.value; page = 0; fill(); } },
    h('option', { value: 'all' }, `Semua kategori (${rows.length})`), [...cats].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => h('option', { value: c }, `${c} (${n})`)));
  let tmr = 0;
  const find = h('input', { type: 'search', placeholder: 'Cari teks, kode, atau fungsi', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
    oninput: (e) => { clearTimeout(tmr); const v = e.target.value; tmr = setTimeout(() => setQuery(v), 250); },
    onchange: (e) => { clearTimeout(tmr); setQuery(e.target.value); } });
  // Cari & ganti kata di semua terjemahan (mengikuti kategori yang dipilih)
  const rf = h('input', { type: 'text', placeholder: 'Kata yang dicari, mis. kau', autocapitalize: 'off' }), rr = h('input', { type: 'text', placeholder: 'Diganti dengan, mis. kamu', autocapitalize: 'off' });
  const wholeCb = h('input', { type: 'checkbox', checked: '' }), icCb = h('input', { type: 'checkbox', checked: '' }), rMsg = h('p', { class: 'mut' });
  const scan = () => {
    const opt = { whole: wholeCb.checked, ignoreCase: icCb.checked }, hits = [];
    let total = 0;
    for (const e of rows) {
      if (!e.translation || (cat !== 'all' && e.category !== cat)) continue;
      const r = replaceWord(e.translation, rf.value, rr.value, opt);
      if (r.count) { total += r.count; hits.push({ e, text: r.text }); }
    }
    return { hits, total };
  };
  const preview = () => {
    if (!rf.value) { rMsg.className = 'err'; rMsg.textContent = 'Isi kata yang dicari dulu'; return; }
    const { hits, total } = scan(); rMsg.className = 'mut';
    const ex = hits.slice(0, 3).map(({ e, text }) => { const l = text.split('\n').find((x) => x !== undefined && x.toLowerCase().includes(rr.value.toLowerCase())) || text; return `• ${l.slice(0, 80)}`; }).join('\n');
    rMsg.textContent = hits.length ? `${total} kata di ${hits.length} teks akan diganti.\n${rr.value ? `Contoh hasil:\n${ex}` : ''}` : 'Tidak ada yang cocok';
  };
  const apply = async () => {
    if (!rf.value) { rMsg.className = 'err'; rMsg.textContent = 'Isi kata yang dicari dulu'; return; }
    const { hits, total } = scan();
    if (!hits.length) { rMsg.className = 'mut'; rMsg.textContent = 'Tidak ada yang cocok'; return; }
    rMsg.className = 'mut'; rMsg.textContent = 'Mengganti…';
    try {
      const upd = hits.map(({ e, text }) => ({ ...e, translation: text, status: e.status === 'done' ? 'edited' : e.status, error: '' }));
      await dbPutMany('entries', upd);
      hits.forEach(({ e }, i) => Object.assign(e, upd[i]));
      rMsg.textContent = `Selesai: ${total} kata di ${hits.length} teks diganti`; fill();
    } catch (x) { rMsg.className = 'err'; rMsg.textContent = `Gagal: ${x.message || x}`; }
  };
  const replCard = card(h('h2', {}, 'Cari & ganti kata'),
    h('p', { class: 'mut' }, 'Mengganti kata di terjemahan saja (bukan teks asli), mengikuti kategori yang dipilih di atas. Kode game tidak disentuh.'),
    rf, rr, h('label', { class: 'chk' }, wholeCb, 'Kata utuh saja (kau tidak mengubah "kaum")'), h('label', { class: 'chk' }, icCb, 'Abaikan huruf besar/kecil (Kau menjadi Kamu)'),
    h('button', { onclick: preview }, 'Cek jumlah'), h('button', { class: 'pri', onclick: apply }, 'Ganti semua'), rMsg);
  fill();
  return [card(find, modeSel, sel, catSel, fnSel, info), replCard, box];
}
let exportUrl = '', editUrl = '', editUrlFilled = '', rgUrl = '';
async function viewEkspor() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const cfg = await loadConfig(), rows = await dbQuery('entries', 'projectId', p.id);
  const n = (f) => rows.filter(f).length, out = h('div');
  const ready = n((e) => (e.status === 'done' || e.status === 'edited') && e.translation.trim()), pend = n((e) => e.status === 'pending' || e.status === 'translating'), err = n((e) => e.status === 'error');
  const rgMsg = h('p', { class: 'mut' }), rgOut = h('div');
  // Entri yang posisinya tidak cocok: tampilkan, lalu tawarkan pencocokan ulang lewat teks asli (fitur Selamatkan)
  const warnCard = (r) => {
    if (!r.bad?.length) return '';
    const wm = h('p', { class: 'mut' }), wb = h('button', { onclick: async () => {
      wb.disabled = true; wm.className = 'mut'; wm.textContent = 'Mencocokkan ulang…';
      try {
        await dbPutMany('entries', r.bad.map((e) => ({ ...e, status: 'skipped', error: 'Tidak ada di game asli' })));
        const x = await rescueSkipped(p, (t) => { wm.textContent = t; });
        const y = await rescueByPosition(p, (t) => { wm.textContent = t; });
        wm.textContent = `Selesai. Cocok lewat teks: ${x.exact + x.fuzzy} dari ${x.orphans} (persis ${x.exact}, mirip ${x.fuzzy}). Pilihan cocok lewat urutan: ${y.moved}. Belum cocok: ${x.left - y.moved}${x.bad ? `, file gagal dibaca: ${x.bad}` : ''}.\nTekan Buat patch lagi.`;
      } catch (e) { wm.className = 'err'; wm.textContent = `Gagal: ${e.message || e}`; }
      wb.disabled = false;
    } }, 'Cocokkan ulang teks yang dilewati');
    return card(h('h2', {}, `${r.bad.length} teks dilewati`),
      h('p', { class: 'mut' }, 'Posisinya tidak cocok dengan file asli proyek sekarang, jadi teks ini tetap asli di patch. Teks lainnya tetap ikut diekspor. Tombol di bawah menandainya lalu mencocokkannya ulang lewat teks asli; terjemahannya tidak dihapus.'),
      r.warnings.slice(0, 10).map((x) => h('p', { class: 'mut' }, x)), r.warnings.length > 10 ? h('p', { class: 'mut' }, `…dan ${r.warnings.length - 10} lainnya (lengkap di patch-report.txt)`) : '', wb, wm);
  };
  const btn = h('button', { class: 'pri', onclick: async () => {
    btn.disabled = true; out.replaceChildren(h('p', { class: 'mut' }, 'Memeriksa dengan diff guard…'));
    try {
      const r = await exportProject(p, cfg.model, cfg.wrapWidth || cfg.wrapFace ? { width: cfg.wrapWidth, face: cfg.wrapFace } : null);
      if (!r.ok) out.replaceChildren(card(h('h2', {}, 'Ekspor dibatalkan'),
        h('p', { class: 'err' }, r.empty ? UI.exportEmpty : 'Diff guard menolak hasil. Tidak ada file dibuat. Perbaiki lalu coba lagi'), r.problems.map((x) => h('p', { class: 'mut' }, x))), warnCard(r));
      else {
        if (exportUrl) URL.revokeObjectURL(exportUrl);
        exportUrl = URL.createObjectURL(r.blob);
        out.replaceChildren(card(h('h2', {}, 'Patch siap'), h('p', { class: 'mut' }, r.report),
          h('a', { class: 'file', href: exportUrl, download: `rpgtl-patch-${p.id}.zip` }, 'Unduh zip'),
          h('p', { class: 'mut' }, 'Backup folder data dulu, lalu timpa isinya dengan file di dalam zip.'),
          r.files.some((f) => /\.rvdata2$/i.test(f.name)) ? h('div', {}, h('h2', {}, 'Game pakai Game.rgss3a?'),
            h('p', { class: 'mut' }, 'Pilih Game.rgss3a asli. App membuat Game.rgss3a baru berisi terjemahan, tanpa perlu ekstrak. Gambar dan audio disalin apa adanya. Backup arsip asli dulu, lalu timpa dengan hasilnya.'),
            h('label', { class: 'file' }, 'Pilih Game.rgss3a asli', h('input', { type: 'file', onchange: async (ev) => {
              const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
              rgMsg.className = 'mut'; rgMsg.textContent = 'Membuat arsip…'; rgOut.replaceChildren();
              try {
                const x = await rebuildRgss3a(f, r.files.filter((q) => /\.rvdata2$/i.test(q.name)));
                if (!x.replaced) throw new Error('Tidak ada file Data di arsip yang cocok dengan patch. Pastikan itu Game.rgss3a dari game yang sama');
                if (rgUrl) URL.revokeObjectURL(rgUrl); rgUrl = URL.createObjectURL(x.blob);
                rgMsg.textContent = `Selesai. ${x.replaced} file data diganti${x.missing.length ? `, ${x.missing.length} tidak ada di arsip dan dilewati` : ''}. Ukuran ${(x.blob.size / 1048576).toFixed(1)} MB`;
                rgOut.replaceChildren(h('a', { class: 'file', href: rgUrl, download: 'Game.rgss3a' }, 'Unduh Game.rgss3a'));
              } catch (e) { rgMsg.className = 'err'; rgMsg.textContent = e.message; }
            } })), rgMsg, rgOut) : ''), warnCard(r));
      }
    } catch (e) { out.replaceChildren(card(h('p', { class: 'err' }, e.message))); }
    btn.disabled = false;
  } }, 'Buat patch');
  const editOut = h('div'), editOutFilled = h('div'), editMsg = h('p', { class: 'mut' });
  const link = (name, mime, text, filled = false) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    if (filled) {
      if (editUrlFilled) URL.revokeObjectURL(editUrlFilled);
      editUrlFilled = url;
      editOutFilled.replaceChildren(h('a', { class: 'file', href: url, download: name }, `Unduh ${name}`));
    } else {
      if (editUrl) URL.revokeObjectURL(editUrl);
      editUrl = url;
      editOut.replaceChildren(h('a', { class: 'file', href: url, download: name }, `Unduh ${name}`));
    }
  };
  const isFilled = (e) => (e.status === 'done' || e.status === 'edited') && typeof e.translation === 'string' && e.translation.trim() !== '';
  const dump = async (kind, filled = false) => {
    const all = (await dbQuery('entries', 'projectId', p.id)).sort((a, b) => a.id - b.id);
    const src = filled ? all.filter(isFilled) : all;
    if (filled && !src.length) { editMsg.className = 'err'; editMsg.textContent = 'Belum ada teks yang sudah terisi.'; return; }
    const rws = entriesToRows(src), suffix = filled ? '-terisi' : '';
    if (kind === 'csv') link(`rpgtl-${p.id}${suffix}.csv`, 'text/csv', toCsv(rws), filled);
    else link(`rpgtl-${p.id}${suffix}.json`, 'application/json', JSON.stringify(rws, null, 1), filled);
    if (filled) { editMsg.className = 'mut'; editMsg.textContent = `${src.length} entri terisi diekspor.`; }
  };
  // File pembanding untuk mengisi otomatis kolom translation yang kosong.
  let prevRows = null, prevName = '';
  const prevMsg = h('p', { class: 'mut' });
  const prevClear = h('button', { onclick: () => { prevRows = null; prevName = ''; prevMsg.className = 'mut'; prevMsg.textContent = 'File pembanding dilepas.'; } }, 'Lepas file pembanding');
  const prevInp = h('input', { type: 'file', accept: '.csv,.json', onchange: async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    prevMsg.className = 'mut'; prevMsg.textContent = 'Membaca file pembanding…';
    try {
      const txt = await f.text();
      const rws = /\.json$/i.test(f.name) ? JSON.parse(txt) : parseCsv(txt);
      if (!Array.isArray(rws)) throw new Error('Isi file bukan daftar baris');
      prevRows = rws; prevName = f.name;
      prevMsg.textContent = `File pembanding siap: ${f.name} (${rws.length} baris). Saat impor, kolom translation yang kosong di file impor diisi dari file ini lewat id.`;
    } catch (e) { prevRows = null; prevName = ''; prevMsg.className = 'err'; prevMsg.textContent = e.message; }
  }});
  const importEdit = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    editMsg.className = 'mut'; editMsg.textContent = 'Membaca…';
    try {
      const txt = await f.text(); let rws = /\.json$/i.test(f.name) ? JSON.parse(txt) : parseCsv(txt);
      if (!Array.isArray(rws)) throw new Error('Isi file bukan daftar baris');
      const empty = (arr) => arr.filter((r) => String(r?.translation ?? '').trim() === '').length;
      let filledFromPrev = 0;
      if (prevRows) {
        const before = empty(rws);
        rws = mergeRows(rws, prevRows);
        filledFromPrev = Math.max(0, before - empty(rws));
      }
      const r = applyImport(await dbQuery('entries', 'projectId', p.id), rws);
      if (r.updates.length) await dbPutMany('entries', r.updates);
      const ids = (a) => (a.length ? ` (id ${a.slice(0, 8).join(', ')}${a.length > 8 ? ', …' : ''})` : '');
      editMsg.className = 'mut';
      editMsg.textContent = [
        `Diperbarui: ${r.updates.length}`,
        ...(prevRows ? [`Diisi otomatis dari file pembanding: ${filledFromPrev} baris`] : []),
        `Sama dengan sebelumnya: ${r.same}`,
        `Terjemahan kosong (dilewati): ${r.empty}`,
        `Teks asli tidak cocok dengan proyek ini: ${r.mismatch.length}${ids(r.mismatch)}`,
        `Kode escape/tag berubah (ditolak): ${r.badEsc.length}${ids(r.badEsc)}`,
        `id tidak dikenal: ${r.unknown.length}`,
      ].join('\n');
    } catch (e) { editMsg.className = 'err'; editMsg.textContent = e.message; }
  };
  let chatUrls = [];
  const chatOut = h('div'), chatMsg = h('p', { class: 'mut' }), perPart = h('input', { type: 'number', value: '150', min: '10', max: '100000' }), perChars = h('input', { type: 'number', value: '6000', min: '1000', max: '1000000' });
  const paste = h('textarea', { rows: '5', spellcheck: 'false', placeholder: 'Tempel balasan AI di sini…' });
  const fmtIds = (a) => (a.length ? ` (id ${a.slice(0, 8).join(', ')}${a.length > 8 ? ', …' : ''})` : '');
  const prepare = async () => {
    chatUrls.forEach((u) => URL.revokeObjectURL(u)); chatUrls = [];
    const parts = buildChatParts(p, await dbQuery('entries', 'projectId', p.id), await loadConfig(), Number(perPart.value) || 150, Number(perChars.value) || 6000);
    chatMsg.className = 'mut'; chatMsg.textContent = '';
    if (!parts.length) { chatOut.replaceChildren(h('p', { class: 'mut' }, 'Tidak ada teks yang belum selesai.')); return; }
    chatOut.replaceChildren(...parts.map((pt) => {
      const url = URL.createObjectURL(new Blob([pt.text], { type: 'text/plain;charset=utf-8' })); chatUrls.push(url);
      return h('div', { class: 'row' }, h('span', {}, `Bagian ${pt.index} dari ${pt.total} · ${pt.count} teks`),
        h('button', { onclick: async () => { try { await navigator.clipboard.writeText(pt.text); chatMsg.className = 'mut'; chatMsg.textContent = `Bagian ${pt.index} disalin`; } catch { chatMsg.className = 'err'; chatMsg.textContent = 'Gagal menyalin. Pakai Unduh'; } } }, 'Salin'),
        h('a', { class: 'file', href: url, download: `rpgtl-${p.id}-bagian-${pt.index}.txt` }, 'Unduh'));
    }));
  };
  const doImport = async (txt) => {
    chatMsg.className = 'mut'; chatMsg.textContent = 'Membaca…';
    try {
      const es = await dbQuery('entries', 'projectId', p.id), { rows, ignored } = parseChatReply(txt, new Set(es.map((e) => e.id)));
      if (!rows.length) { chatMsg.className = 'err'; chatMsg.textContent = 'Tidak ada baris berformat [id] terjemahan'; return false; }
      const r = applyChatRows(es, rows);
      if (r.updates.length) await dbPutMany('entries', r.updates);
      const upd = new Set(r.updates.map((u) => u.id)), left = new Set(es.filter((e) => TODO.has(e.status) && !upd.has(e.id)).map((e) => e.original)).size;
      chatMsg.textContent = [`Baris terbaca: ${rows.length}`, `Teks diterjemahkan: ${r.texts} (${r.updates.length} entri)`, `Sisa belum diterjemahkan: ${left} teks`, `Kode game rusak atau hilang (ditolak): ${r.badToken.length}${fmtIds(r.badToken)}`,
        `Terjemahan kosong: ${r.empty.length}${fmtIds(r.empty)}`, `id tidak dikenal: ${r.unknown.length}${fmtIds(r.unknown)}`, `Duplikat diabaikan: ${r.dup}`, `Baris tanpa nomor di awal atau akhir diabaikan: ${ignored}`].join('\n');
      return r.updates.length > 0;
    } catch (e) { chatMsg.className = 'err'; chatMsg.textContent = e.message; return false; }
  };
  return [card(h('h2', {}, 'Ekspor'), h('p', { class: 'mut' }, `Siap diekspor: ${ready}\nBelum diterjemahkan (tetap asli): ${pend}\nError (tetap asli): ${err}`), btn), out,
    card(h('h2', {}, 'Edit manual'),
      h('p', { class: 'mut' }, 'Unduh semua teks sebagai CSV atau JSON, edit kolom translation, lalu impor lagi. Jangan ubah kolom id dan original. Kode escape dan tag harus tetap sama.'),
      h('p', { class: 'mut' }, h('strong', {}, '1) Ekspor semua teks')),
      h('div', { class: 'row' }, h('button', { onclick: () => dump('csv') }, 'Siapkan CSV'), h('button', { onclick: () => dump('json') }, 'Siapkan JSON')), editOut,
      h('p', { class: 'mut' }, h('strong', {}, '2) Ekspor hanya yang sudah terisi (id asli ikut)')),
      h('p', { class: 'mut' }, 'Hanya entri berstatus done atau edited yang terjemahannya tidak kosong. Cocok untuk melanjutkan di aplikasi AI lain: hanya id yang sudah benar yang ikut.'),
      h('div', { class: 'row' }, h('button', { onclick: () => dump('csv', true) }, 'CSV terisi'), h('button', { onclick: () => dump('json', true) }, 'JSON terisi')), editOutFilled,
      h('p', { class: 'mut' }, h('strong', {}, '3) Impor hasil edit')),
      h('p', { class: 'mut' }, 'File pembanding (opsional) dipilih dulu. Kolom translation yang kosong di file impor diisi otomatis dari file pembanding lewat id, jadi kamu bisa impor file yang belum lengkap tanpa kehilangan nilai yang sudah ada di file sebelumnya.'),
      h('label', { class: 'file' }, 'Pilih file pembanding (.csv / .json) — opsional', prevInp), prevClear, prevMsg,
      h('label', { class: 'file' }, 'Impor hasil edit (.csv / .json)', h('input', { type: 'file', accept: '.csv,.json', onchange: importEdit })), editMsg),
    card(h('h2', {}, 'Terjemah lewat chat AI'), h('p', { class: 'mut' }, 'Untuk menerjemahkan di aplikasi AI lain tanpa API. Teks yang belum selesai dipecah jadi bagian-bagian berisi instruksi, gaya, dan glosarium. Kirim satu bagian ke AI (tempel atau unggah file), lalu tempel balasannya di bawah. Bagian dihitung ulang dari teks yang belum selesai tiap kali kamu menyiapkannya.'),
      h('label', {}, 'Teks per bagian'), perPart, h('label', {}, 'Maks karakter per bagian'), perChars, h('button', { class: 'pri', onclick: prepare }, 'Siapkan bagian'), chatOut,
      h('label', {}, 'Balasan AI'), paste,
      h('div', { class: 'row' }, h('button', { class: 'pri', onclick: async () => { if (await doImport(paste.value)) paste.value = ''; } }, 'Impor tempelan'),
        h('label', { class: 'file' }, 'Impor file (.txt)', h('input', { type: 'file', accept: '.txt,text/plain', multiple: '', onchange: async (ev) => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) await doImport((await Promise.all(fs.map((f) => f.text()))).join('\n')); } }))), chatMsg)];
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