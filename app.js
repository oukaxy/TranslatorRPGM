import { ID_W, ID_X, EN_W, EN_SKIP, ID_AMBIG, FOREIGN_W } from './lang-vocab.js';
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
  codeAdded: 'AI menulis kode game sendiri (bukan token). Coba terjemahkan ulang',
  codeWord: 'Kata kunci kode (if, else, true, dll) hilang atau diterjemahkan. Coba terjemahkan ulang',
  timeout: 'Provider terlalu lama menjawab. Coba lagi atau naikkan batas waktu di Pengaturan',
  langBad: 'File bahasa tidak bisa dibaca. Pastikan itu file JSON berisi kunci dan teks (mis. languages/en.json)',
  tooLong: 'Jawaban model terpotong karena kena batas token (kemungkinan berpikir terlalu panjang atau mengulang). Teks ini dilewati; coba terjemahkan ulang, kecilkan ukuran batch, atau naikkan batas token di Pengaturan',
  tooMany: 'Tiga batch gagal berturut-turut. Periksa Pengaturan atau koneksi, lalu lanjutkan',
  exportEmpty: 'Belum ada terjemahan yang bisa diekspor. Terjemahkan dulu di tab Translate',
  urlBad: 'Base URL harus memakai https. Untuk lokal pakai localhost',
  nothing: 'Tidak ada teks yang perlu diterjemahkan. Semua sudah selesai, atau impor tidak menemukan teks',
  emptyImp: 'Impor selesai tapi tidak ada teks yang ditemukan. Sumber Jepang hanya mengambil teks berhuruf Jepang. Bila game berbahasa Inggris, hapus proyek ini lalu impor ulang dengan sumber Inggris',  backupBad: 'File cadangan tidak valid atau rusak. Pilih file .zip hasil Buat cadangan dari aplikasi ini',
  backupNew: 'Cadangan dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi dulu lalu coba lagi',
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
    t.objectStore('settings').delete('exportCount:' + id);
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
/**
 * Kategori untuk satu field database. Skills/Items/Weapons/Armors dipecah jadi `-label` (name) dan `-deskripsi` (description);
 * Classes/Enemies/States (name) dan Actors (nickname) jadi `-label`. Field lain (message, profile, dll.) tetap memakai nama file.
 */
const DESC_SPLIT = new Set(['Skills', 'Items', 'Weapons', 'Armors']);
export function dbCat(base, field) {
  const b = base.toLowerCase();
  if (DESC_SPLIT.has(base)) return field === 'name' ? `${b}-label` : field === 'description' ? `${b}-deskripsi` : b;
  if ((field === 'name' && ['Classes', 'Enemies', 'States'].includes(base)) || (base === 'Actors' && field === 'nickname')) return `${b}-label`;
  return b;
}
/** Semua kategori yang bisa dihasilkan extractor (dipakai menu Isi dari game asli, karena proyek hasil impor game yang sudah diubah mungkin belum punya kategori itu). */
export const ALL_CATS = ['dialog', 'scroll', 'choice', 'speaker', 'actorname', 'system', 'map', 'plugin', ...new Set(Object.entries(DB_FIELDS).flatMap(([k, fs]) => fs.map((f) => dbCat(k, f)))), 'comment', 'comment-teks', 'comment-label', 'note-tag', 'script-teks', 'script-multi'];
export const NOTE_TAGS = ['図鑑特徴'];
const noteTagRe = (tag) => new RegExp('<' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[:：]([\\s\\S]*?)>', 'g');
/** String berkutip di kode Ruby (perintah Script): "..." atau '...'. Grup 1 = isi kutip ganda, grup 2 = isi kutip tunggal. */
const rbLit = () => /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
// Kode escape (\C[2], \!, ...) dan tag plugin ASCII seperti <br>, <WordWrap>, <left>. Tag berisi huruf Jepang tidak ikut.
// Selain kode escape pesan, ikut dimasker: pemanggilan fungsi berindeks (if(s[12]), en(s[3]), f(\v[5])), s[n]/v[n], $gameXxx, dan placeholder %1.
const ESC = /\\[A-Za-z]{1,12}<[^>\n\u3000-\u9fff\uff00-\uffef]*>|\\[Ff][RrIiBb](?![A-Za-z])|\\(?:[A-Za-z]+\[(?:\d+|#[0-9A-Fa-f]{3,8}|[0-9A-Fa-f]{6}|auto)\]|[A-Za-z]|[{}.|!^$<>\\])|<\/?[A-Za-z][ -;=?-~]{0,40}>|\b[A-Za-z_]\w*\((?=[^)\n]*(?:\[\d+\]|\\[A-Za-z]+\[))(?:[^()\n]|\([^()\n]*\))*\)|\b[sv]\[\d+\]|\$game[A-Za-z]+(?:\.\w+|\[[^\]\n]*\])*|%\d|#\{[^}\n]*\}|\$\{[^}\n]*\}|\{\{[^}\n]*\}\}|\{\d+\}|[¥￥]/g;
// Pola masking yang lebih lengkap dari ESC: variabel bersarang \V[\V[1]], placeholder printf (%1$s, %s, %d) dan entitas HTML.
// Hanya dipakai untuk masking terjemahan dan audit kode; ESC dipakai tetap oleh heuristik impor supaya hasil ekstraksi proyek lama tidak bergeser.
const MASK = new RegExp(['\\\\[A-Za-z]+\\[\\\\[A-Za-z]+\\[\\d+\\]\\]', '%\\d+\\$[sd]', ESC.source, '%[sd]\\b', '&(?:nbsp|amp|lt|gt|quot|#\\d+);'].join('|'), 'g');
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
const srcLabel = (s) => ({ auto: 'Otomatis (Jepang/Inggris)', all: 'Semua teks (bahasa apa pun)', ja: 'Jepang', en: 'Inggris' }[s] || s);
/**
 * Analisis bahasa satu teks (kode escape sudah dibuang).
 * lang: 'ja' (ada kana/kanji) | 'en' | 'id' | null (tanpa huruf). mixed: ada kana/kanji DAN huruf Latin.
 * sure: false bila teks terlalu pendek / skor seri, jadi hasilnya hanya tebakan.
 */
export function langInfo(t) {
  const ja = (t.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
  const raw = t.match(/[A-Za-z']+/g), w = raw && raw.map((x) => x.toLowerCase());
  const lat = w ? w.length : 0;
  if (ja) return { lang: 'ja', mixed: lat > 0, sure: true, id: 0, en: 0 };
  if (!w) return { lang: null, mixed: false, sure: false, id: 0, en: 0 };
  let id = 0, en = 0;
  w.forEach((x, k) => {
    if ((ID_W.has(x) || ID_X.has(x)) && !(ID_AMBIG.has(x) && raw[k] !== x)) id++;
    else if (/^(ber|ter|meng|peng|mem|pem)[a-z]{4,}$|^(ke|per|pen|peng)[a-z]{3,}an$|^[a-z]{3,}(kan|nya|lah|kah)$/.test(x)) id += 0.5;
    if (EN_W.has(x)) en++;
    else if (/^[a-z]{3,}(tion|ment|ness|ous|ful|ly|ed)$/.test(x)) en += 0.4;
  });
  const lang = id > en ? 'id' : 'en';
  return { lang, mixed: false, sure: Math.abs(id - en) >= 1.5 || (lat >= 4 && id !== en), id, en };
}
/** Tebak bahasa satu teks: 'ja' | 'en' | 'id' | null (tanpa huruf, mis. angka/simbol). */
export const detectLang = (t) => langInfo(t).lang;
/**
 * Filter ketat saat IMPOR dengan sumber Inggris: buang teks yang ada huruf Jepang atau jelas berbahasa Indonesia.
 * Teks pendek yang tidak yakin (nama, "Potion") tetap lolos. stats (opsional) menghitung yang dibuang per alasan.
 */
export function langAllowed(original, src, stats = null) {
  if (src !== 'en') return true;
  const t = original.replace(ESC, '').trim(), r = langInfo(t);
  const why = r.lang === 'ja' ? (r.mixed ? 'mix' : 'ja') : r.lang === 'id' ? 'id' : null;
  if (!why) return true;
  if (stats) { const g = (stats[why] ||= { n: 0, samples: [] }); g.n++; if (g.samples.length < 3) g.samples.push(t.replace(/\s+/g, ' ').slice(0, 40)); }
  return false;
}
/** Ganti kode escape dengan token ⟦n⟧. Kode di awal dan akhir teks tidak dikirim ke AI (sering dihapus model); dipasang lagi saat unmask. */
const ESC_LEAD = new RegExp('^(?:\\s*(?:' + MASK.source + '))+\\s*'), ESC_TRAIL = new RegExp('(?:\\s*(?:' + MASK.source + '))+\\s*$');
export function maskText(text) {
  let lead = '', trail = '', core = text;
  const a = ESC_LEAD.exec(core); if (a) { lead = a[0]; core = core.slice(lead.length); }
  const b = ESC_TRAIL.exec(core); if (b) { trail = b[0]; core = core.slice(0, core.length - trail.length); }
  if (!core.trim()) { lead = ''; trail = ''; core = text; } // teks hanya berisi kode: perlakukan seperti biasa
  const tokens = [];
  tokens.lead = lead; tokens.trail = trail;
  return { text: core.replace(MASK, (m) => { tokens.push(m); return `⟦${tokens.length - 1}⟧`; }), tokens };
}
/** Kembalikan kode escape. ok=false bila token hilang, duplikat, atau asing. */
export function unmaskText(text, tokens) {
  const seen = new Array(tokens.length).fill(0); let ok = true;
  const out = text.replace(/⟦(\d+)⟧/g, (m, n) => { if (tokens[n] === undefined) { ok = false; return m; } seen[n]++; return tokens[n]; });
  return { ok: ok && seen.every((c) => c === 1), text: (tokens.lead || '') + out + (tokens.trail || '') };
}
// Kata kunci kode yang tidak boleh hilang/diterjemahkan, hanya diperiksa bila teks asli terlihat seperti kode (ada operator, if(...), atau x = y).
const CODE_WORDS = /\b(?:if|elsif|else|unless|while|true|false|nil|null|return)\b/g;
const CODEY = /[=!<>]=|&&|\|\||\b(?:if|elsif|unless|while)\b\s*[($!\\]|\b[A-Za-z_]\w*\s*=\s*[^\s=]/;
/** True bila teks asli berbau kode dan jumlah kata kuncinya di terjemahan lebih sedikit. */
export function kwLost(orig, tr) {
  if (!CODEY.test(orig)) return false;
  const cnt = (x) => { const m = {}; for (const w of String(x).match(CODE_WORDS) || []) m[w] = (m[w] || 0) + 1; return m; };
  const a = cnt(orig), b = cnt(tr);
  return Object.keys(a).some((w) => (b[w] || 0) < a[w]);
}
/**
 * Pengaman kode untuk balasan AI (teks masih bertoken ⟦n⟧): tolak bila AI menulis kode game mentah sendiri
 * (yang seharusnya hanya ada lewat token) atau kata kunci kode asli hilang/diterjemahkan. Hasil '' bila aman.
 */
export function codeProblem(maskedOrig, maskedTr) {
  if (new RegExp(MASK.source).test(String(maskedTr))) return UI.codeAdded;
  return kwLost(maskedOrig, maskedTr) ? UI.codeWord : '';
}
/** Audit: terjemahan yang kode game atau kata kunci kodenya tidak sama dengan teks asli. */
export function codeDiff(e) {
  const t = String(e.translation ?? '').trim();
  if (!t || e.status === 'skipped' || e.status === 'pending') return false;
  return escSig(e.original) !== escSig(t) || kwLost(stripEscapes(e.original), stripEscapes(t));
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
/** File bahasa plugin lokalisasi (JSON bertingkat atau datar {kunci: teks}). Disimpan sebagai languages/<nama>.json. */
export const LANG_PATH = /(^|\/)languages\/[^/]+\.json$/i;
const PLACEHOLDER = /#\{|\$\{|\{\{/;
/**
 * Teks yang hanya berisi kunci/kode, mis. \nw[#{Chara.X}]#{Scenario.Msg1}: teks aslinya ada di file bahasa, jadi tidak ada kalimat untuk diterjemahkan.
 * Syarat: memuat penanda kunci (#{...}, ${...}, {{...}}) dan setelah kode dibuang tersisa paling banyak satu huruf.
 */
export function keyOnly(s) {
  const t = String(s ?? '');
  if (!PLACEHOLDER.test(t)) return false;
  const rest = t.replace(ESC, '').replace(/[\s\[\]()<>{}|.,:;!?'"_\-~*/\\]+/g, '');
  return (rest.match(/\p{L}/gu) || []).length <= 1;
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

/**
 * String Ruby yang dipecah di beberapa baris Script (355 + 655...), mis.
 *   355: text = "      655: kalimat 1 \|      655: kalimat 2."      655: ...
 * Mengembalikan { n (jumlah baris), q (jenis kutip), at (posisi kutip buka di baris pertama), segs (isi tiap baris), tail (kode setelah kutip tutup) } atau null.
 */
export function readMulti(list, i) {
  const c = list?.[i];
  if (!c || (c.code !== 355 && c.code !== 655) || typeof c.parameters?.[0] !== 'string') return null;
  const s = c.parameters[0], rest = s.replace(rbLit(), (m) => ' '.repeat(m.length)), m = /["']/.exec(rest);
  if (!m || rest.slice(0, m.index).includes('#')) return null; // kutip di dalam komentar bukan string
  const q = m[0], at = m.index, endRe = q === '"' ? /^((?:[^"\\]|\\[\s\S])*)"/ : /^((?:[^'\\]|\\[\s\S])*)'/;
  if (endRe.test(s.slice(at + 1))) return null;
  const segs = [s.slice(at + 1)];
  for (let j = i + 1; j < list.length && j <= i + 60; j++) {
    const d = list[j];
    if (d?.code !== 655 || typeof d.parameters?.[0] !== 'string') return null;
    const t = d.parameters[0], em = endRe.exec(t);
    if (em) { segs.push(em[1]); return { n: j - i + 1, q, at, segs, tail: t.slice(em[0].length), endRe }; }
    segs.push(t);
  }
  return null;
}

/**
 * Rentetan Control Variables (122) bertipe Script pada variabel yang sama, mis. sistem diary:
 *   $122 v1241 += "Today, "   +=  $game_actors[1].name   +=  " licked￥"   += "me down there ￥" ...
 * Tiap baris = satu potongan string (atau ekspresi seperti $game_actors[1].name). ￥ = penanda ganti baris.
 * Mengembalikan { n, pieces, text } atau null.
 */
const LIT = /^(\s*)(["'])((?:(?!\2)[^\\]|\\[\s\S])*)\2(\s*)$/;
const EXPR = new RegExp('^\\s*(?:' + ESC.source + ')\\s*$');
export function readRun(list, i) {
  const P0 = list?.[i]?.parameters;
  if (list[i].code !== 122 || P0?.[3] !== 4 || typeof P0[4] !== 'string') return null;
  const pieces = [];
  for (let j = i; j < list.length && j < i + 120; j++) {
    const c = list[j], P = c?.parameters;
    if (c?.code !== 122 || P?.[3] !== 4 || typeof P[4] !== 'string' || P[0] !== P0[0] || P[1] !== P0[1] || P[2] !== P0[2]) break;
    const m = LIT.exec(P[4]);
    if (m) pieces.push({ lead: m[1], q: m[2], body: m[3], trail: m[4] });
    else if (EXPR.test(P[4])) pieces.push({ expr: P[4].trim() });
    else break;
  }
  if (pieces.filter((x) => !x.expr).length < 2) return null;
  return { n: pieces.length, pieces, text: pieces.map((x) => (x.expr ? x.expr : x.body)).join('') };
}
/** Pecah s menjadi n potongan (di spasi/￥) yang bila digabung persis sama dengan s. */
function splitN(s, n) {
  if (n <= 1) return [s];
  const chunks = s.split(/(?<=[￥ ])/), goal = Math.ceil(s.length / n), out = [];
  let cur = '';
  for (const c of chunks) {
    if (cur && out.length < n - 1 && (cur + c).length > goal) { out.push(cur); cur = c; } else cur += c;
  }
  out.push(cur);
  while (out.length < n) out.push('');
  return out;
}
/** Susun ulang pemisah baris ￥ pada terjemahan sesuai lebar baris aslinya (kecuali asli memakai baris kosong). */
function wrapRun(t, rn) {
  const orig = rn.text, exprs = rn.pieces.filter((x) => x.expr).map((x) => x.expr);
  if (/￥[\s　]*￥|^[\s　]*￥/.test(orig)) return t;
  const vis = (x) => { for (const e of exprs) x = x.split(e).join('xxxxxx'); return [...x].reduce((a, ch) => a + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0); };
  const W = Math.max(20, ...orig.split('￥').map((l) => vis(l.trim())));
  const lines = []; let cur = '';
  for (const w of t.replace(/￥/g, ' ').split(/\s+/).filter(Boolean)) {
    const cand = cur ? cur + ' ' + w : w;
    if (cur && vis(cand) > W) { lines.push(cur); cur = w; } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.join('￥') + (/￥[\s　]*$/.test(orig) ? '￥' : '');
}
/** Pisahkan terjemahan menjadi tepat n baris (newline, lalu batas \| , lalu rata per kata). */
function fitLines(t, n) {
  if (n <= 1) return [t.replace(/\s*\n\s*/g, ' ')];
  const byNl = t.split('\n').map((x) => x.trimEnd());
  if (byNl.length === n) return byNl;
  const byBar = t.split(/(?<=\\\|)\s*/).filter((x, k, a) => x !== '' || k < a.length - 1);
  if (byBar.length === n) return byBar.map((x) => x.trim());
  const words = t.split(/\s+/).filter(Boolean), total = words.join(' ').length, goal = Math.ceil(total / n), out = [];
  let cur = '';
  for (const w of words) {
    if (cur && out.length < n - 1 && (cur + ' ' + w).length > goal) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  out.push(cur);
  while (out.length < n) out.push('');
  return out;
}
/** Apakah string di dalam script mirip kalimat untuk pemain (bukan kunci/kode). */
export const scriptSentence = (x, src = 'ja') => {
  const t = x.replace(ESC, '').trim();
  if (!t || /[=$@{}]|\w_\w/.test(t)) return false;
  // perintah/konfigurasi berbentuk [Kunci nilai:Nilai] (mis. [Add 100%:Confuse]) dibaca script, bukan teks pemain
  if (/^\[[^\]\n]*:[^\]\n]*\]$/.test(t)) return false;
  // nama aset/ID/path (Audio/VOICE/96020201, A101f, face_01.png) bukan teks pemain
  if (!JA.test(t) && (/^[\w\-.\/\\#:]+$/.test(t) || /\.(png|jpg|jpeg|ogg|wav|m4a|mp3|rb|json|txt|ttf|otf)\b/i.test(t))) return false;
  if (src === 'all') return JA.test(t) || /[^\x00-\x7f]/.test(t.replace(/[\p{P}\p{S}\p{Z}]/gu, '')) || (/\s/.test(t) && (t.match(/[A-Za-z']+/g) || []).length >= 2);
  return (JA.test(t) || (t.match(/[A-Za-z']+/g) || []).length >= 3) && detectLang(t) !== 'id';
};
export function extractFile(path, json, { src = 'ja', allow = null, strict = false, stats = null, skipKeys = false, skipped = null } = {}) {
  const A = allowSets(allow);
  const base = path.split('/').pop().replace(/\.(json|rvdata2)$/i, ''), ace = /\.rvdata2$/i.test(path), out = [];
  const add = (p, kind, category, original, meta = {}, lineCount = 1) => {
    if (skipKeys && typeof original === 'string' && keyOnly(original)) { if (skipped) skipped.n++; return; }
    if (!isTranslatable(original, src)) return;
    if (strict && !langAllowed(original, src, stats)) return;
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
      } else if ((c.code === 355 || c.code === 655) && typeof P[0] === 'string') {
        scriptLits(P[0], [...p, i, 'parameters', 0]);
        const ml = readMulti(list, i);
        if (ml) {
          const S = ml.segs.join('\n'), t = S.trim();
          if (t && scriptSentence(t, src)) {
            add([...p, i, '#ml', ml.n], 'field', 'script-multi', t, { lead: S.slice(0, S.length - S.trimStart().length), trail: S.slice(S.trimEnd().length) });
            i += ml.n - 1; // baris di dalam string tidak dipindai lagi sebagai script biasa
          }
        }
      }
      else if (c.code === 122 && P[3] === 4 && typeof P[4] === 'string') {
        const rn = readRun(list, i), S = rn?.text || '', t = S.trim();
        if (rn && t && scriptSentence(t, src)) {
          add([...p, i, '#run', rn.n], 'field', 'script-multi', t, { lead: S.slice(0, S.length - S.trimStart().length), trail: S.slice(S.trimEnd().length) });
          i += rn.n - 1; // potongan di dalam rentetan tidak diambil lagi satu per satu
        } else scriptLits(P[4], [...p, i, 'parameters', 4]);
      }
    }
  };
  const walk = (v, p) => {
    if (typeof v === 'string') add(p, 'field', 'system', v);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...p, i]));
    else if (v && typeof v === 'object') Object.keys(v).filter((k) => !k.startsWith('__')).forEach((k) => walk(v[k], [...p, k]));
  };
  const pages = (pg, p) => (pg || []).forEach((pa, pi) => scanList(pa?.list, [...p, 'pages', pi, 'list']));
  if (LANG_PATH.test(path)) {
    // File bahasa: semua string diambil; kategori = nama bagian teratas (lang:Scenario_H), atau lang:umum untuk string di tingkat atas.
    const go = (v, p, cat) => {
      if (typeof v === 'string') add(p, 'field', cat, v);
      else if (Array.isArray(v)) v.forEach((x, i) => go(x, [...p, i], cat));
      else if (v && typeof v === 'object') for (const k of Object.keys(v)) go(v[k], [...p, k], cat);
    };
    if (Array.isArray(json)) go(json, [], 'lang:umum');
    else if (json && typeof json === 'object') for (const k of Object.keys(json)) go(json[k], [k], typeof json[k] === 'string' ? 'lang:umum' : `lang:${k}`);
  } else if (base === 'System') {
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
    DB_FIELDS[base].forEach((f) => add([i, f], 'field', dbCat(base, f), it[f]));
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
    if (e.category === 'script-multi' && p.at(-2) === '#run') {
      // path = [..., 'list', i, '#run', n]; rentetan Control Variables (122): teks digabung, ekspresi tetap, jumlah baris tetap n
      const n = p.at(-1), i = p.at(-3), list = getAt(json, p.slice(0, -3)), rn = readRun(list, i);
      if (!rn || rn.n !== n) { fail(e, 'rentetan script tidak cocok dengan file asli'); continue; }
      if (nz(rn.text) !== nz(e.original)) { fail(e, 'teks asli di posisi ini berbeda (posisi bergeser)'); continue; }
      let T = wrapRun(e.translation.replace(/\r/g, '').replace(/\s*\n\s*/g, ' ').trim(), rn);
      T = (e.meta?.lead || '') + T + (e.meta?.trail || '');
      const exprs = rn.pieces.filter((x) => x.expr).map((x) => x.expr), segs = []; let pos = 0, bad1 = '';
      for (const x of exprs) { const k = T.indexOf(x, pos); if (k < 0) { bad1 = `ekspresi ${x} hilang dari terjemahan`; break; } segs.push(T.slice(pos, k)); pos = k + x.length; }
      segs.push(T.slice(pos));
      const gaps = [0]; for (const pc of rn.pieces) { if (pc.expr) gaps.push(0); else gaps[gaps.length - 1]++; }
      if (!bad1 && segs.some((x, g) => !gaps[g] && x.trim())) bad1 = 'teks di antara dua ekspresi tidak punya baris untuk menampungnya';
      if (bad1) { fail(e, bad1); continue; }
      const chunks = segs.map((x, g) => (gaps[g] ? splitN(x, gaps[g]) : [])); let g = 0;
      rn.pieces.forEach((pc, k) => {
        if (pc.expr) { g++; return; }
        let body = chunks[g].shift();
        body = (pc.q === '"' ? body.replace(/"/g, "'") : body.replace(/'/g, '’')).replace(/#(?=[{$@])/g, '').replace(/\\+$/, '');
        list[i + k].parameters[4] = pc.lead + pc.q + body + pc.q + pc.trail;
      });
      continue;
    }
    if (e.category === 'script-multi') {
      // path = [..., 'list', i, '#ml', n]; isi string yang membentang n baris Script diganti, jumlah baris tetap n
      const n = p.at(-1), i = p.at(-3), list = getAt(json, p.slice(0, -3)), ml = readMulti(list, i);
      if (!ml || ml.n !== n) { fail(e, 'string script multi-baris tidak cocok dengan file asli'); continue; }
      if (nz(ml.segs.join(' ')) !== nz(e.original)) { fail(e, 'teks asli di posisi ini berbeda (posisi bergeser)'); continue; }
      const dq = ml.q === '"', lead = (e.meta?.lead || '').split('\n'), trail = (e.meta?.trail || '').split('\n');
      const C = n - (lead.length - 1) - (trail.length - 1);
      if (C < 1) { fail(e, 'struktur baris string tidak valid'); continue; }
      let t = e.translation.replace(/\r/g, '').trim();
      t = dq ? t.replace(/"/g, "'") : t.replace(/'/g, '’');
      t = t.replace(/#(?=[{$@])/g, '');
      const body = fitLines(t, C).map((x) => x.replace(/\\+$/, ''));
      const segs = [...lead.slice(0, -1), lead.at(-1) + body[0], ...body.slice(1)];
      segs[segs.length - 1] += trail[0]; segs.push(...trail.slice(1));
      if (segs.length !== n) { fail(e, 'jumlah baris hasil tidak sama dengan aslinya'); continue; }
      segs.forEach((x, k) => {
        const par = list[i + k].parameters;
        par[0] = k === 0 ? par[0].slice(0, ml.at + 1) + x : k === n - 1 ? x + ml.q + ml.tail : x;
      });
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
export function diffGuard(orig, next, file = 'data/X.json', allow = null, src = 'all') {
  const probs = [], allowS = new Set(), allowB = new Set(), allowN = new Set(), allowL = new Set(), allowM = new Map(), allowR = new Set();
  // Proyek lama menyimpan indeks array System.terms sebagai string; samakan jadi angka.
  const norm = (path) => JSON.stringify(JSON.parse(path).map((k) => (typeof k === 'string' && /^\d+$/.test(k) ? Number(k) : k)));
  for (const e of extractFile(file, orig, { src, allow })) {
    // note-tag: yang boleh berubah hanya isi tag di dalam string note; path note-nya didaftarkan terpisah
    if (e.category === 'script-multi') {
      const pp = JSON.parse(e.path), n = pp.at(-1), i = pp.at(-3), lp = pp.slice(0, -3);
      if (pp.at(-2) === '#run') { for (let k = 0; k < n; k++) allowR.add(norm(JSON.stringify([...lp, i + k, 'parameters', 4]))); continue; }
      const ml = readMulti(getAt(orig, lp), i);
      if (ml) for (let k = 0; k < n; k++) allowM.set(norm(JSON.stringify([...lp, i + k, 'parameters', 0])), { k, n, at: ml.at, endRe: ml.endRe });
    } else if (e.category === 'script-teks') allowL.add(norm(JSON.stringify(JSON.parse(e.path).slice(0, -2))));
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
      if (allowR.has(JSON.stringify(p))) {
        const rm = (x) => { const m = LIT.exec(x); return m ? m[1] + m[2] + m[2] + m[4] : EXPR.test(x) ? x : null; };
        const ma = rm(a), mb = rm(b);
        if (ma === null || mb === null || ma !== mb) bad(p, 'bagian script di luar isi string berubah');
        return;
      }
      const am = allowM.get(JSON.stringify(p));
      if (am) {
        const mask = (x) => am.k === 0 ? (am.endRe.test(x.slice(am.at + 1)) ? null : x.slice(0, am.at + 1)) : am.k === am.n - 1 ? (() => { const m = am.endRe.exec(x); return m ? x.slice(m[0].length) : null; })() : (am.endRe.test(x) ? null : '');
        const ma = mask(a), mb = mask(b);
        if (ma === null || mb === null || ma !== mb) bad(p, 'bagian script di luar isi string berubah');
        return;
      }
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
/** Format ulang JSON file bahasa mengikuti file asli: indentasi (spasi/tab) dan akhir baris CRLF. */
function fmtLang(work, orig) {
  const m = /\n([ \t]+)\S/.exec(orig), ind = m ? (m[1][0] === '\t' ? '\t' : m[1].length) : 0;
  const s = JSON.stringify(work, null, ind || undefined);
  return /\r\n/.test(orig) ? s.replace(/\n/g, '\r\n') : s;
}
export function buildPatch(files, entries, { model = '', date = new Date(), wrap = null, notes = [], allow = null, bom = null, src = 'all' } = {}) {
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
    const lang = LANG_PATH.test(f.path), text = isPl ? buildPluginsJs(pj, work) : lang ? fmtLang(work, f.text) : JSON.stringify(work); let re = null;
    try { re = isPl ? parsePluginsJs(text)?.arr : JSON.parse(text); if (!re) throw new Error('x'); } catch { pr.push(`${f.path}: hasil tidak bisa dibaca ulang`); }
    if (!pr.length) pr.push(...diffGuard(orig, re, f.path, allow, src));
    let data = null;
    if (!pr.length && /\.rvdata2$/i.test(f.path)) {
      try {
        const w2 = JSON.parse(text); fixAceCmds(w2); data = viewToMarshal(w2);
        if (JSON.stringify(marshalToView(data)) !== JSON.stringify(w2)) pr.push(`${f.path}: hasil rvdata2 tidak sama dengan data yang diterjemahkan`);
      } catch (e) { pr.push(`${f.path}: gagal menulis rvdata2 (${e.message})`); }
    }
    if (pr.length) { problems.push(...pr); continue; }
    out.push({ name: f.path, data: data || new TextEncoder().encode((lang && bom?.[f.path] ? '\uFEFF' : '') + text) }); stat.files++; stat.applied += use.length;
  }
  const report = ['RPG Maker Translator - patch-report', `Tanggal: ${date.toISOString()}`, `Model: ${model}`, ...notes, `File diubah: ${stat.files}`, `Teks diterapkan: ${stat.applied}`, `Teks dipecah ulang agar muat: ${stat.wrapped}`, `Deskripsi/profil lebih dari 2 baris (mungkin terpotong di game): ${stat.long}`,
    `Belum diterjemahkan (tetap asli): ${stat.pending}`, `Error (tetap asli): ${stat.error}`, `Dilewati: ${stat.skipped}`, `Posisi tidak cocok dengan file asli (tetap asli): ${stat.mismatch}`, ...(warnings.length ? ['', ...warnings.slice(0, 50), ...(warnings.length > 50 ? [`...dan ${warnings.length - 50} lainnya`] : [])] : []), '', ...out.map((x) => x.name)].join('\n');
  return { ok: !problems.length && out.length > 0, empty: !problems.length && !out.length, problems, warnings, bad: badAll, files: out, report, stat };
}
/** Ekspor proyek: JSON asli + terjemahan, lolos diff guard, lalu zip. Bila gagal, tidak ada zip. */
export async function exportProject(project, model = '', wrap = null) {
  const plug = project.msgPlugins?.length ? project.msgPlugins : null;
  if (plug || project.langFile) wrap = null;
  const files = await dbPrefix('origFiles', project.id + ':'), entries = await dbQuery('entries', 'projectId', project.id);
  const r = buildPatch(files, entries, { model, wrap, allow: project.allow, src: project.src || 'all', bom: project.bom, notes: plug ? [`Plugin message terdeteksi (${plug.join(', ')}): pemecahan baris otomatis dimatikan. Cek hasil di game.`] : project.langFile ? ['File bahasa: salin hasilnya ke folder languages game. Nama file boleh diganti sesuai bahasa yang dipilih di menu game (backup dulu).'] : [] });
  if (!r.ok) return r;
  return { ...r, blob: await writeZip([...r.files, { name: 'patch-report.txt', data: new TextEncoder().encode(r.report) }]) };
}
// ===== 4b. CADANGAN & PEMULIHAN PROYEK =====
export const BACKUP_VERSION = 1;
const doneCount = (rows) => rows.filter((e) => e.status === 'done' || e.status === 'edited').length;
const BACKUP_KEYS = ['glossary', 'style', 'charNotes', 'pluginAllow'];
/** Minta penyimpanan permanen (browser boleh menolak) dan laporkan statusnya. null bila browser tidak mendukung. */
export async function storageStatus(ask = false) {
  const st = globalThis.navigator?.storage; if (!st?.persisted) return null;
  let persisted = await st.persisted();
  if (!persisted && ask && st.persist) { try { persisted = await st.persist(); } catch { /* ditolak */ } }
  let usage = null, quota = null; try { ({ usage, quota } = await st.estimate()); } catch { /* tidak tersedia */ }
  return { persisted, usage, quota };
}
/**
 * Cadangan satu proyek: zip berisi manifest.json (data proyek + pengaturan non-rahasia), entries.json (semua teks, urut),
 * dan orig/N.txt (file data asli, supaya proyek langsung bisa diekspor lagi). API key dan cache tidak ikut.
 */
export async function buildBackup(project, cfg = {}) {
  const enc = new TextEncoder();
  const entries = (await dbQuery('entries', 'projectId', project.id)).sort((a, b) => a.id - b.id);
  const orig = await dbPrefix('origFiles', project.id + ':');
  const settings = {}; for (const k of BACKUP_KEYS) if (typeof cfg[k] === 'string') settings[k] = cfg[k];
  const manifest = { app: 'rpgtl-backup', version: BACKUP_VERSION, date: new Date().toISOString(), project, entries: entries.length, done: doneCount(entries), settings, orig: orig.map((o, i) => ({ file: `orig/${i}.txt`, path: o.path })) };
  const files = [{ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest)) }, { name: 'entries.json', data: enc.encode(JSON.stringify(entries.map(({ id, ...r }) => r))) }];
  orig.forEach((o, i) => files.push({ name: `orig/${i}.txt`, data: enc.encode(o.text) }));
  return writeZip(files);
}
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/, BAD_PATH = /(^|[\\/])\.\.([\\/]|$)|^[\\/]|^[A-Za-z]:|\0/;
/**
 * Pulihkan proyek dari cadangan. Semua isi divalidasi dulu sebelum ada yang diubah. Bila proyek dengan id yang sama sudah ada
 * dan overwrite=false, tidak ada yang ditulis: hasilnya {confirm:true, ...} berisi perbandingan untuk ditampilkan.
 */
export async function restoreBackup(file, { overwrite = false } = {}) {
  let z; try { z = await readZip(file); } catch { throw new Error(UI.backupBad); }
  const get = (n) => z.entries.find((e) => e.name === n), dec = new TextDecoder(), mf = get('manifest.json'), en = get('entries.json');
  if (!mf || !en) throw new Error(UI.backupBad);
  let m; try { m = JSON.parse(dec.decode(await z.read(mf))); } catch { throw new Error(UI.backupBad); }
  if (m?.app !== 'rpgtl-backup' || !m.project || !SAFE_ID.test(String(m.project.id))) throw new Error(UI.backupBad);
  if (!(m.version >= 1) || m.version > BACKUP_VERSION) throw new Error(m.version > BACKUP_VERSION ? UI.backupNew : UI.backupBad);
  const id = m.project.id, old = await dbGet('projects', id);
  if (old && !overwrite) {
    const rows = await dbQuery('entries', 'projectId', id);
    return { confirm: true, backup: { total: m.entries, done: m.done, date: m.date }, existing: { total: rows.length, done: doneCount(rows) } };
  }
  let rows; try { rows = JSON.parse(dec.decode(await z.read(en))); } catch { throw new Error(UI.backupBad); }
  if (!Array.isArray(rows) || rows.length !== m.entries || !rows.every((r) => r && typeof r.original === 'string' && typeof r.status === 'string')) throw new Error(UI.backupBad);
  const orig = [];
  for (const o of m.orig || []) {
    const f = get(String(o?.file)); if (!f || typeof o.path !== 'string' || BAD_PATH.test(o.path)) throw new Error(UI.backupBad);
    orig.push({ key: `${id}:${o.path}`, projectId: id, path: o.path, text: dec.decode(await z.read(f)) });
  }
  if (old) await deleteProject(id);
  await dbPutMany('origFiles', orig);
  await dbPutMany('entries', rows.map((r) => ({ ...r, projectId: id })));
  const project = { ...m.project, updatedAt: Date.now() };
  await dbPut('projects', project);
  await dbPut('settings', { key: 'current', value: id });
  return { project, done: doneCount(rows), settings: m.settings && typeof m.settings === 'object' ? m.settings : {} };
}
/**
 * Bangun proyek dari file bahasa JSON (tanpa IndexedDB, agar bisa diuji). Kunci dan struktur tidak diubah; hanya nilai teks yang jadi entri.
 * @param {File[]} files file .json (mis. languages/en.json)
 */
export async function buildLangProject(files, src = 'en', onProgress = () => {}) {
  const id = 'p' + Date.now().toString(36), orig = [], entries = [], broken = [], counts = {}, bom = {}, langSkip = {}, keySkip = { n: 0 };
  let i = 0;
  for (const f of files) {
    const name = String(f.name || 'bahasa.json').replace(/[\\/]/g, '_'), path = 'languages/' + name;
    onProgress(`Membaca ${name} (${++i} dari ${files.length})`, i - 1, files.length);
    let text, json;
    try {
      const u8 = new Uint8Array(await f.arrayBuffer());
      text = new TextDecoder('utf-8').decode(u8); // BOM dibuang saat decode; dicatat agar ekspor bisa memasangnya lagi
      json = JSON.parse(text);
      if (!json || typeof json !== 'object') throw new Error('x');
      if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) bom[path] = true;
    } catch { broken.push(name); continue; }
    orig.push({ key: `${id}:${path}`, projectId: id, path, text });
    for (const e of extractFile(path, json, { src, strict: true, stats: langSkip, skipKeys: true, skipped: keySkip })) {
      e.projectId = id; e.hash = await sha256(e.original); entries.push(e);
      counts[e.category] = (counts[e.category] || 0) + 1;
      if (entries.length % 2000 === 0) { onProgress(`Membaca ${name}: ${entries.length} teks`, i - 1, files.length); await new Promise((r) => setTimeout(r)); }
    }
  }
  if (!orig.length) throw new Error(UI.langBad);
  const project = { id, engine: 'File bahasa', langFile: true, src, tgt: 'id', scriptsDiag: null, gaps: [], langSkip, msgPlugins: [], pluginsSeen: false, allow: parseAllow(''), paramNote: '', catV: 2, files: orig.length, broken, counts, total: entries.length, keySkipped: keySkip.n, bom, updatedAt: Date.now() };
  return { project, orig, entries };
}
export async function importLangFiles(files, src = 'en', onProgress = () => {}) {
  const { project, orig, entries } = await buildLangProject(files, src, onProgress);
  onProgress(`Menyimpan ${entries.length} teks…`, files.length, files.length);
  await dbPutMany('origFiles', orig);
  await dbPutMany('entries', entries);
  await dbPut('projects', project);
  await dbPut('settings', { key: 'current', value: project.id });
  return project;
}
/** Impor folder/zip: simpan JSON asli dan entries ke IndexedDB. */
const engine_isAce = (e) => e === 'VX Ace';
export async function importProject(files, src = 'ja', onProgress = () => {}, { allow: allowText = '' } = {}) {
  const allow = parseAllow(allowText);
  onProgress('Membaca daftar file…', 0, 0);
  const { engine: eng, data, plugins, scripts } = await collectSources(files);
  if (!data.size) throw new Error(UI.noData);
  const id = 'p' + Date.now().toString(36), orig = [], entries = [], broken = [], counts = {};
  const gaps = new Map(), langSkip = {}, keySkip = { n: 0 };
  let sys = null, i = 0, msgPlugins = [], pluginsSeen = false, pluginsText = '';
  if (plugins) try { pluginsText = await plugins.read(); msgPlugins = detectMessagePlugins(pluginsText); pluginsSeen = true; } catch { /* plugins.js tidak terbaca */ }
  const ingest = async (path, json, text) => {
    orig.push({ key: `${id}:${path}`, projectId: id, path, text });
    const covered = new Set();
    for (const e of extractFile(path, json, { src, allow, strict: true, stats: langSkip, skipKeys: true, skipped: keySkip })) {
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
  const project = { id, engine, src, tgt: 'id', scriptsDiag, gaps: [...gaps].sort((a, b) => b[1].n - a[1].n).slice(0, 10), langSkip, msgPlugins, pluginsSeen, allow, paramNote, catV: 2, files: orig.length, broken, counts, total: entries.length, keySkipped: keySkip.n, updatedAt: Date.now() };
  onProgress(`Menyimpan ${entries.length} teks…`, data.size, data.size);
  await dbPutMany('origFiles', orig);
  await dbPutMany('entries', entries);
  await dbPut('projects', project);
  await dbPut('settings', { key: 'current', value: id });
  return project;
}

const normTxt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const escSig = (s) => (String(s ?? '').match(MASK) || []).sort().join('\u0001');
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
 * Isi kolom translation entri kategori terpilih dengan teks dari game asli, dicocokkan lewat posisi (file + path), bukan teks atau id.
 * Cocok untuk mengembalikan teks tertentu (mis. label) ke bahasa asli tanpa menyentuh entri lain dan tanpa mengganti file asli proyek.
 * Entri yang diisi berstatus edited; teks asli di proyek tidak diubah.
 */
export async function fillFromPristine(project, files, cats, onProgress = () => {}) {
  const { data, plugins } = await collectSources(files), base = (x) => x.split('/').pop().toLowerCase();
  const isPl = (x) => /(^|\/)js\/plugins\.js$/.test(x.replace(/\\/g, '/'));
  const byBase = new Map([...data].map(([k, v]) => [base(k), v]));
  const stored = await dbPrefix('origFiles', project.id + ':'), ents = await dbQuery('entries', 'projectId', project.id);
  const byFile = new Map();
  for (const e of ents) { if (!cats.has(e.category)) continue; if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); }
  const res = { files: 0, filled: 0, same: 0, nopos: 0, nofile: 0, bad: 0, badNames: [] }, toPut = [];
  let i = 0;
  for (const f of stored) {
    const oldEs = byFile.get(f.path); if (!oldEs) continue;
    onProgress(`Mencocokkan ${base(f.path)} (${++i} dari ${byFile.size})`);
    if (i % 10 === 0) await new Promise((r) => setTimeout(r));
    const item = isPl(f.path) ? plugins : byBase.get(base(f.path));
    if (!item) { res.nofile++; continue; }
    let json;
    try {
      if (isPl(f.path)) { json = parsePluginsJs(await item.read())?.arr; if (!json) throw new Error('plugins.js'); }
      else if (/\.rvdata2$/i.test(f.path)) json = marshalToView(await item.readBin());
      else json = JSON.parse(await item.read());
    } catch { res.bad++; if (res.badNames.length < 5) res.badNames.push(base(f.path)); continue; }
    res.files++;
    // src 'all': teks asli bisa bahasa apa pun, dan yang dicari hanya posisi entri yang sudah ada
    const pos = new Map(extractFile(f.path, json, { src: 'all', allow: project.allow }).map((c) => [`${c.category}\n${c.path}`, c]));
    for (const e of oldEs) {
      const c = pos.get(`${e.category}\n${e.path}`);
      if (!c) { res.nopos++; continue; }
      if (e.translation === c.original && (e.status === 'edited' || e.status === 'done')) { res.same++; continue; }
      toPut.push({ ...e, translation: c.original, status: 'edited', error: '' }); res.filled++;
    }
  }
  if (toPut.length) await dbPutMany('entries', toPut);
  project.updatedAt = Date.now(); await dbPut('projects', project);
  return res;
}
// ===== 4b. GLOSARIUM =====
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
export const termsFor = (gl, text) => { const low = String(text).toLowerCase(); return gl.filter(([a]) => low.includes(a.toLowerCase())); };
/** Normalisasi untuk membandingkan teks yang mirip: huruf kecil, angka jadi #, spasi dirapatkan ("Up Level 2" dan "Up level 3" sama). */
export const simNorm = (s) => String(s || '').toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
/** Istilah glosarium yang ada di teks asli tetapi padanannya tidak muncul di terjemahan (tak peka huruf besar/kecil). */
export const glossMissing = (gl, original, translation) => { const t = String(translation || '').toLowerCase(); return termsFor(gl, original).filter(([, b]) => !t.includes(b.toLowerCase())); };
/** id entry yang teks aslinya mirip (beda angka/huruf besar) tetapi terjemahannya berbeda. */
export function inconsistentIds(rows) {
  const g = new Map();
  for (const e of rows) {
    if (!e.translation || !e.translation.trim()) continue;
    const k = simNorm(stripEscapes(e.original)); if (k.length < 3) continue;
    const l = g.get(k); if (l) l.push(e); else g.set(k, [e]);
  }
  const out = new Set();
  for (const l of g.values()) if (l.length > 1 && new Set(l.map((e) => simNorm(stripEscapes(e.translation)))).size > 1) l.forEach((e) => out.add(e.id));
  return out;
}
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

// ===== 4c. TERJEMAH LEWAT CHAT AI =====
const NL = '⏎', LANG_NAME = { all: 'bahasa apa pun (tiap baris bisa Jepang, Inggris, Indonesia, Korea, dll; baris yang sudah bersih berbahasa Indonesia salin apa adanya; bila bercampur bahasa lain atau salah ketik, perbaiki jadi bahasa Indonesia yang bersih)', ja: 'Jepang', en: 'Inggris', id: 'Indonesia', auto: 'Jepang atau Inggris (tiap baris bisa salah satunya; baris yang sudah bersih berbahasa Indonesia salin apa adanya; bila bercampur bahasa lain atau salah ketik, perbaiki jadi bahasa Indonesia yang bersih)' };
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
      `3c. Token ⟦n⟧ mewakili kode game (warna, nama, variabel, ikon, fungsi). Anggap tiap token satu kata utuh: tetap menempel pada kata yang sama seperti di sumber (mis. "⟦0⟧Potion" jadi "⟦0⟧Ramuan", tanpa spasi atau tanda baca tambahan), jangan dipecah, digabung, atau diganti.`,
      `3d. Jangan menulis kode game sendiri: tidak ada kode \\C[2], \\V[1], \\N[1], tag <...>, atau %1 kecuali yang sudah berupa token ⟦n⟧ di sumber. Kalau sumber tidak punya kode, terjemahan juga tidak.`,
      `3e. Baris yang isinya cuma kode, angka, nama variabel/file/switch, atau pasangan key=value: salin persis. Jangan "memperbaiki", merapikan, atau mengubah tanda kurung, operator, angka, dan besar kecil huruf pada kode. Identifier seperti CamelCase, snake_case, atau HURUF_BESAR tidak diterjemahkan.`,
      `4. Tanda ${NL} berarti pindah baris di dalam satu teks. Pertahankan tanda itu (jangan diganti baris baru sungguhan) dan taruh di tempat yang wajar.`,
      `5. Bagian "|nama" setelah id hanyalah konteks pembicara. Jangan ikut ditulis di balasan dan jangan diterjemahkan sebagai teks.`,
      `6. Tanpa komentar, pembuka, penutup, atau blok kode.`,
      `7. Teks sumber bisa sudah setengah terjemah, salah ketik, atau berisi kata bahasa lain (mis. Portugis "mesmo", "você", Spanyol "gracias"). Perbaiki semuanya: hasil harus bersih, ejaan benar, tanpa sisa kata asing.`,
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
  const out = { updates: [], texts: 0, empty: [], badToken: [], foreign: [], unknown: [], dup: 0 }, seen = new Set();
  for (const r of rows) {
    const e0 = byId.get(r.id); if (!e0) { out.unknown.push(r.id); continue; }
    if (seen.has(e0.original)) { out.dup++; continue; }
    const t = String(r.text).replace(new RegExp(`\\s*${NL}\\s*`, 'g'), '\n').trim();
    const lead = (e0.original.match(/^\s*/) || [''])[0].replace(/\r/g, ''), trail = (e0.original.match(/\s*$/) || [''])[0].replace(/\r/g, '');
    if (!t) { out.empty.push(r.id); continue; }
    const mk = maskText(e0.original), u = unmaskText(t, mk.tokens);
    if (!u.ok || codeProblem(mk.text.replace(/\r?\n/g, '\n'), t)) { out.badToken.push(r.id); continue; }
    if (stray(t) || foreignWords(t, e0.original).length) { out.foreign.push(r.id); continue; }
    seen.add(e0.original); out.texts++;
    for (const e of byOrig.get(e0.original)) if (TODO.has(e.status)) out.updates.push({ ...e, translation: lead + u.text + trail, status: 'done', error: '' });
  }
  return out;
}

// ===== 5. TRANSLATE (batch, cache, retry, resume, klien LLM, biaya) =====
export const DEFAULT_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', remember: false, model: 'google/gemini-2.5-flash',
  temperature: 0.3, maxTokens: 0, batchSize: 30, maxChars: 4000, concurrency: 4, delay: 100, priceIn: 0, priceOut: 0,
  fast: false, wrapWidth: 48, wrapFace: 38, pluginAllow: '', glossary: '', style: DEFAULT_STYLE, charNotes: '', timeout: 120, extraBody: '', auto: true, fixRounds: 1,
};
const LANG = { ja: 'Japanese', en: 'English', id: 'Indonesian', all: 'any language (each item may be Japanese, English, Indonesian, Korean, etc.; if an item is already entirely clean Indonesian, return it unchanged; if it mixes Indonesian with other languages or has typos, rewrite it as clean Indonesian)', auto: 'Japanese or English (each item may be in either language; if an item is already entirely clean Indonesian, return it unchanged; if it mixes Indonesian with other languages or has typos, rewrite it as clean Indonesian)' };
/** Hasil terjemahan yang masih memuat huruf Jepang/Mandarin, Cyrillic, Arab, atau Hangul: tanda terjemahan setengah jalan atau ngaco. */
// U+30FB (・, titik tengah katakana) hanya tanda poin, bukan huruf Jepang: hasil yang mempertahankannya tidak boleh ditolak.
export const stray = (t) => JA.test(String(t).replace(/[\u30fb\u30fc\u30a0\u309b\u309c]/g, '')) || /[\u0400-\u04FF\u0600-\u06FF\uAC00-\uD7AF]/.test(t);
const STRAY_MSG = 'Hasil masih bercampur huruf Jepang/asing, bukan bahasa target';
/** Kata khas Portugis/Spanyol yang tertinggal di teks (kode escape diabaikan). Mengembalikan kata unik berhuruf kecil. */
export function foreignWords(t, orig = '') {
  const ws = String(t || '').replace(ESC, ' ').match(/\p{L}+/gu) || [], out = new Set();
  const ow = new Set((String(orig || '').replace(ESC, ' ').toLowerCase().match(/\p{L}+/gu) || []));
  for (const w of ws) {
    const k = w.toLowerCase();
    if (FOREIGN_W.has(k)) out.add(k);
    else if (/[àâäçèéêëîïôöùûüÿœæãõñß]/.test(k) && !ow.has(k)) out.add(k); // huruf beraksen Latin yang tidak ada di sumber: ciri bahasa asing
  }
  return [...out];
}
const foreignMsg = (t, o = '') => `Ada kata bahasa asing (Prancis/Spanyol/Portugis/dll) yang muncul: ${foreignWords(t, o).slice(0, 3).join(', ')}`;
const TODO = new Set(['pending', 'error', 'translating']);
/** Entri pending/error yang hanya berisi kunci atau kode ditandai skipped (tidak dikirim ke model, tetap asli di ekspor). Mengubah `entries` di tempat. */
export async function skipKeyOnly(entries) {
  const hit = entries.filter((e) => TODO.has(e.status) && keyOnly(e.original));
  if (!hit.length) return 0;
  hit.forEach((e) => { e.status = 'skipped'; e.translation = ''; e.error = ''; });
  await dbPutMany('entries', hit);
  return hit.length;
}
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
  constructor(msg, { status = 0, fatal = false, retryAfter = null, split = false, noRetry = false, usage = null } = {}) { super(msg); this.usage = usage; this.name = 'LlmError'; this.status = status; this.fatal = fatal; this.retryAfter = retryAfter; this.split = split; this.noRetry = noRetry; }
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
// Pengali batas token otomatis: naik sendiri kalau model penalar kehabisan token saat berpikir (dipakai ulang sampai halaman dimuat ulang).
let capBoost = 1;
// Model penalar di provider selain OpenRouter: kirim reasoning_effort rendah otomatis supaya tidak berpikir panjang.
// Dilewati bila Body tambahan sudah mengatur reasoning/reasoning_effort. Bila provider menolak field-nya, dimatikan sampai halaman dimuat ulang.
let noEffort = false;
const REASONER = /gpt-oss|(^|[\/:_-])o[134](-|$)|deepseek-?r1|qwq|magistral|reasoner/i;
export async function llmChat(cfg, messages, signal, fetchFn = fetch) {
  if (!cfg.apiKey) throw new LlmError(UI.noKey, { fatal: true });
  if (!urlOk(cfg.baseUrl)) throw new LlmError(UI.urlBad, { fatal: true });
  let extra = {};
  if (String(cfg.extraBody || '').trim()) {
    try { extra = JSON.parse(cfg.extraBody); if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('x'); }
    catch { throw new LlmError('Body tambahan di Pengaturan bukan objek JSON yang valid', { fatal: true }); }
    delete extra.model; delete extra.messages;
  }
  // Batas token keluar: mencegah model penalar berpikir/mengulang tanpa henti (dan tagihan membengkak).
  // Otomatis dari panjang pesan pengguna (teks batch) ditambah ruang berpikir; diisi manual lewat pengaturan atau Body tambahan.
  const lastLen = String(messages[messages.length - 1]?.content || '').length;
  const autoCap = Math.min(16000, Math.round(Math.max(6000, Math.ceil(lastLen / 1.5) + 4000) * capBoost));
  const capTok = Number(cfg.maxTokens) > 0 ? Math.round(Number(cfg.maxTokens)) : autoCap;
  const capFromExtra = 'max_tokens' in extra || 'max_completion_tokens' in extra;
  const sendEffort = !noEffort && REASONER.test(String(cfg.model || '')) && !/(^|\.)openrouter\.ai$/.test(new URL(cfg.baseUrl).hostname) && !('reasoning_effort' in extra) && !('reasoning' in extra);
  // Batas waktu per request; pembatalan dari pengguna tetap diteruskan.
  const ctl = new AbortController(); let timedOut = false;
  const onAbort = () => ctl.abort();
  if (signal?.aborted) ctl.abort(); else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, Math.max(10, Number(cfg.timeout) || Math.round(120 * Math.max(1, capBoost))) * 1000);
  try {
    let res;
    try {
      res = await fetchFn(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify({ model: cfg.model, temperature: cfg.temperature, messages, ...(capFromExtra ? {} : { max_tokens: capTok }), ...(cfg.fast && /(^|\.)openrouter\.ai$/.test(new URL(cfg.baseUrl).hostname) ? { reasoning: { enabled: false } } : {}), ...(sendEffort ? { reasoning_effort: 'low' } : {}), ...extra }),
      });
    } catch (e) {
      if (e.name === 'AbortError') { if (timedOut) throw new LlmError(UI.timeout, { split: true, noRetry: true }); throw e; }
      throw new LlmError(UI.net);
    }
    if (!res.ok) {
      const s = res.status, retryAfter = parseRetryAfter(res.headers?.get?.('retry-after'));
      if (s === 401 || s === 403) { let d = ''; try { d = (await res.json())?.error?.message || ''; } catch { /* abaikan */ } throw new LlmError(`${UI.keyBad} (${s}${d ? ': ' + String(d).slice(0, 160) : ''})`, { status: s, fatal: true }); }
      if (s === 402) throw new LlmError(UI.credit, { status: s, fatal: true });
      let d = ''; try { d = (await res.json())?.error?.message || ''; } catch { /* abaikan */ }
      if (sendEffort && s === 400 && /reasoning|effort/i.test(d)) { noEffort = true; throw new LlmError('Provider tidak menerima reasoning_effort; diulang tanpa field itu', { status: s, retryAfter: 0 }); }
      // 400/413/422: biasanya satu teks bermasalah (filter konten, terlalu panjang). Batch dipecah untuk mencari yang bermasalah.
      // Pesan soal model/key/kuota tetap fatal agar tidak memboroskan request.
      const split = ([400, 413, 422].includes(s) && !/model|api.?key|auth|credit|quota|billing|permission/i.test(d)) || [408, 504, 524].includes(s); // 408/504/524: request terlalu lama (provider memutus); batch dipecah, bukan diulang utuh
      const fatal = s !== 429 && s < 500 && !split;
      throw new LlmError(`Provider menolak permintaan (${s}). ${d || (fatal ? 'Periksa model di Pengaturan' : 'Coba lagi nanti')}`.trim(), { status: s, fatal, retryAfter, split, noRetry: split });
    }
    const j = await res.json().catch((e) => { if (timedOut) throw new LlmError(UI.timeout); return null; }), content = j?.choices?.[0]?.message?.content;
    // Terpotong karena batas token: jangan dipakai. Batch dipecah (split) agar yang ngaco terisolasi; token yang terpakai tetap dihitung.
    if (j?.choices?.[0]?.finish_reason === 'length') { capBoost = Math.min(2, capBoost * 1.5); throw new LlmError(UI.tooLong, { split: true, noRetry: true, usage: j.usage || null }); }
    let text = content;
    if (typeof text !== 'string') throw new LlmError(UI.badResp);
    // Model penalar (mis. MiniMax) menaruh proses berpikir di <think>…</think>; buang supaya JSON balasan terbaca.
    text = text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim();
    if (!text) throw new LlmError(UI.badResp);
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
- A ⟦n⟧ token stands for one game code (color, name, variable, icon, function call). Treat it as an opaque word: keep it attached to the same neighbouring word as in the source ("⟦0⟧Potion" -> "⟦0⟧Ramuan", no added space or punctuation), never split, merge, or replace it.
- Never write game codes yourself: no backslash codes (\\C[2], \\V[1], \\N[1]), no <tags>, no %1 placeholders unless they appear as ⟦n⟧ tokens in the source. If the source has none, the translation has none.
- If an item is only code, a number, a variable/file/switch name, or key=value pairs, copy it unchanged. Do not fix, normalise, or reformat code: keep brackets, parentheses, operators, digits, and letter case exactly. Never translate identifiers (CamelCase, snake_case, ALL_CAPS).
- Keep line breaks as line breaks and keep the same number of lines when possible.
- Translate every word into ${LANG[tgt]}. Never leave Japanese, Chinese, or Korean characters in the translation and never mix source-language words into the sentence; romanize a name if you must keep it. Reply only in ${LANG[tgt]}.\n- Slang, crude, and adult terms in the source must also be translated, using their natural equivalents in ${LANG[tgt]}. Never leave them in the source language and never skip, censor, or summarise a line.\n- HARD RULE: the output language is ${LANG[tgt]} and nothing else. Never answer in French, Spanish, Portuguese, German, Italian or any other language, even for very short lines, quotes, or lines that look already translated. Do not copy the language of a neighbouring line.\n- The source may already be machine-translated, half-translated, or contain stray words from other languages (e.g. Portuguese "mesmo", "você", Spanish "gracias", "pero") or typos. Fix all of them: the result must be clean, correctly spelled ${LANG[tgt]} with no leftover foreign words.\n- Translate as natural game dialogue. Keep names consistent. Keep short UI terms short.
- If an item has "glossary", every term listed there must appear in that item's translation exactly as its "to" value, in the same wording every time (never a synonym or a different word for the same term).
- If an item has "similar" ({from, to}), it is almost identical to a line already translated: reuse the same wording as "to" and change only what differs (numbers, names). Numbers in your translation must be exactly the numbers in the current item's text, never copied from "to". Keep the same vocabulary.
- If an item has "note", follow it.${style.trim() ? `\n- Style guide for all text: ${style.trim().replace(/\s+/g, ' ')}` : ''}
- If "character_notes" is given, follow each note for lines spoken by that speaker; it overrides the general style guide.
- If an item has max_chars_per_line and max_lines, the translation must fit: break lines with \\n, never exceed max_chars_per_line characters per line (not counting ⟦n⟧ tokens) or max_lines lines. Indonesian and English run longer than Japanese, so shorten the wording when needed and keep the meaning.
- "context" holds earlier lines for reference only. Do not translate or return them.
- Reply with one JSON object only, no code fence, no commentary: {"0":"translation","1":"translation"}. One key per item, using the item's id.`;
  const cns = new Map(); units.forEach((u) => (u.notes || []).forEach(([a, b]) => cns.set(a, b)));
  const user = JSON.stringify({ context, ...(cns.size ? { character_notes: [...cns].map(([name, note]) => ({ name, note })) } : {}), items: units.map((u) => ({ id: u.id, ...(u.speaker ? { speaker: u.speaker } : {}), ...(u.terms?.length ? { glossary: u.terms.map(([from, to]) => ({ from, to })) } : {}), ...(u.ref ? { similar: u.ref } : {}), ...(u.hint ? { note: u.hint } : {}), ...(u.limit ? { max_chars_per_line: u.limit.line, max_lines: u.limit.lines } : {}), text: u.text })) });
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
    if (e.usage) o.onUsage?.(e.usage);
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
    if (bad) why.set(id, bad); else { ok.set(id, r.text); if (o.keep && !o.keep.has(id)) o.keep.set(id, r.text); }
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
/** Istilah glosarium (dari teks asli) yang belum muncul di terjemahan t. */
const glossMiss = (u, t) => (u.must || []).filter(([, b]) => !String(t).toLowerCase().includes(b.toLowerCase()));
/** Unit yang hasilnya melewatkan istilah glosarium diterjemah ulang sekali dengan catatan; hasil yang lebih baik dipakai, selain itu hasil awal tetap. */
export async function glossFix(units, r, o) {
  if (o.fixRounds === 0) return;
  const bad = units.filter((u) => r.ok.has(u.id) && glossMiss(u, r.ok.get(u.id)).length);
  if (!bad.length) return;
  const r2 = await translateBatch(bad.map((u) => ({ ...u, hint: `Your previous translation missed required glossary terms: ${glossMiss(u, r.ok.get(u.id)).map(([a, b]) => `${a} -> ${b}`).join('; ')}. Use them exactly.` })), o);
  r2.ok.forEach((t, id) => { const u = units.find((x) => x.id === id); if (u && glossMiss(u, t).length < glossMiss(u, r.ok.get(id)).length) r.ok.set(id, t); });
}
/** Kata Inggris yang tertinggal di hasil (target bukan Inggris): >= 2 kata, atau 1 kata sepanjang >= 4 huruf. Kata yang di teks asli ditulis berhuruf kapital di tengah kalimat (nama/istilah) diabaikan. */
export function englishLeft(t, tgt = 'id', orig = '') {
  if (tgt === 'en') return [];
  const names = new Set();
  for (const m of String(orig || '').matchAll(/([.!?…"“”(]\s*|^\s*)?([A-Z][A-Za-z']+)/g)) if (!m[1]) names.add(m[2].toLowerCase());
  const ws = englishWords(t).filter((k) => !names.has(k));
  return ws.length >= 2 || (ws.length === 1 && ws[0].length >= 4) ? ws : [];
}
/** Serpihan aneh seperti "_OS" yang muncul di hasil tetapi tidak ada di teks asli. */
export const garbled = (t, orig = '') => (String(t || '').match(/(?:^|\s)_[A-Za-z]{2,}|\b[A-Z]{5,}\b/g) || []).map((x) => x.trim()).filter((x) => !String(orig).includes(x));
const langScore = (t, orig, tgt) => englishLeft(t, tgt, orig).length + garbled(t, orig).length * 3;
const ENG_MSG = 'Hasil masih bercampur kata Inggris atau serpihan aneh, bukan bahasa target penuh';
const NUM_MSG = 'Angka di hasil tidak sama dengan teks asli';
/** Angka (digit) di hasil tidak sama dengan teks asli, mis. "Level 8" jadi "Level 9". Angka yang ditulis dengan kata (hasil tanpa digit) tidak dihitung salah. Angka yang di teks asli berupa kata Inggris ("Four") boleh jadi digit di hasil ("4"). */
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100 };
const NUM_WORD_RE = new RegExp(`\\b(?:${Object.keys(NUM_WORDS).join('|')})\\b`, 'g');
export function numDiff(orig, t) {
  const digits = (x) => String(x || '').replace(/⟦\d+⟧/g, ' ').replace(ESC, ' ').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).match(/\d+/g) || [];
  const a = digits(orig), b = digits(t);
  if (!a.length || !b.length) return false;
  const cnt = (arr, d) => arr.filter((x) => x === d).length;
  for (const w of String(orig).toLowerCase().match(NUM_WORD_RE) || []) {
    const d = String(NUM_WORDS[w]);
    if (cnt(b, d) > cnt(a, d)) b.splice(b.indexOf(d), 1);
  }
  return a.sort().join(',') !== b.sort().join(',');
}
const LEN_MSG = 'Panjang hasil tidak wajar dibanding teks asli (mungkin terjemahan baris lain)';
/** Hasil jauh lebih pendek (<30%) atau jauh lebih panjang (>3,5x) dari teks asli: tanda model menjawab baris lain atau menghilangkan isi. Teks Jepang dan teks pendek (<40 huruf) tidak diperiksa. */
export function lenOff(t, orig) {
  const strip = (x) => String(x || '').replace(/⟦\d+⟧/g, '').replace(ESC, ' ').replace(/\s+/g, ' ').trim();
  const a = strip(orig), b = strip(t);
  if (JA.test(a) || a.length < 40) return false;
  return b.length < a.length * 0.3 || b.length > a.length * 3.5;
}
/** Hasil yang masih bercampur Inggris/serpihan diterjemah ulang (maks 2 kali) dengan catatan; hasil yang lebih bersih dipakai, selain itu hasil awal tetap. */
export async function langFix(units, r, o) {
  if (o.tgt === 'en') return;
  for (let i = 0; i < (o.fixRounds ?? 2); i++) {
    const cur = units.filter((u) => r.ok.has(u.id) && langScore(r.ok.get(u.id), u.text, o.tgt) > 0);
    if (!cur.length) return;
    const r2 = await translateBatch(cur.map((u) => {
      const t = r.ok.get(u.id), left = [...englishLeft(t, o.tgt, u.text), ...garbled(t, u.text)].slice(0, 6).join(', ');
      return { ...u, hint: `${u.hint ? u.hint + ' ' : ''}Your previous translation was not fully ${LANG[o.tgt] || 'the target language'}: it still had English or stray fragments (${left}). This is fictional adult-game dialogue: translate every word faithfully into natural ${LANG[o.tgt] || 'the target language'}, including slang and crude terms, using the usual local equivalents. Leave no English words, do not censor, skip or summarise, and do not add stray fragments such as "_OS".` };
    }), o);
    r2.ok.forEach((t, id) => { const u = units.find((x) => x.id === id); if (u && langScore(t, u.text, o.tgt) < langScore(r.ok.get(id), u.text, o.tgt)) r.ok.set(id, t); });
  }
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
  const { signal, onProgress = () => {}, base = 0 } = o, ids = o.ids ? new Set(o.ids) : null, chat = o.chat || ((m, s) => llmChat(cfg, m, s));
  const all = (await dbQuery('entries', 'projectId', project.id)).sort((a, b) => a.id - b.id);
  await skipKeyOnly(all);
  const cats = Array.isArray(o.cats) ? new Set(o.cats) : null; // null = semua kategori
  const pos = new Map(all.map((e, i) => [e.id, i])), todo = all.filter((e) => TODO.has(e.status) && (!cats || cats.has(e.category)) && (!ids || ids.has(e.id)));
  const stat = { done: 0, error: 0, cached: 0, tokensIn: 0, tokensOut: 0, stopped: false, expOut: 0, nb: 0 };
  const auto = cfg.auto !== false, eff = auto ? autoTune(todo, cfg) : cfg;
  // Jumlah batch yang berjalan bersamaan: mulai 6, turun saat provider membatasi, naik tiap 4 batch lancar (sampai batas konkurensi).
  const lim = { cur: auto ? Math.min(eff.concurrency, 6) : eff.concurrency, max: eff.concurrency, active: 0, okRun: 0 };
  let n = 0; const tick = (t) => onProgress(n + base, todo.length + base, (stat.tokensIn ? `${t} · token masuk ${stat.tokensIn}, keluar ${stat.tokensOut}` : t) + (stat.nb >= 3 && stat.tokensOut > stat.expOut * 2.5 ? ' · Token keluar jauh di atas wajar: model memakai mode berpikir. Batas token otomatis menahan lonjakan; atur manual di Pengaturan bila perlu' : ''));
  // Status berjalan: kemajuan khusus proses ini (bukan seluruh proyek), waktu berjalan, dan jumlah batch aktif; disegarkan tiap detik.
  const tStart = Date.now(); let gateRef = null;
  const fmtDur = (ms) => { const s = Math.round(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return hh ? `${hh}j ${mm}m` : mm ? `${mm}m ${ss}d` : `${ss}d`; };
  const act = new Map(); let bcount = 0;
  const prog = () => {
    const w = gateRef ? Math.max(gateRef.until - Date.now(), gateRef.pace) : 0, total = todo.length || 1;
    return (w > 1500 ? `Menunggu limit provider (${Math.round(w / 1000)} dtk) · ` : '') + `${n} dari ${todo.length} teks (${Math.floor((n * 100) / total)}%) · berjalan ${fmtDur(Date.now() - tStart)} · ${lim.active} batch aktif`
      + (act.size ? '\n' + [...act].slice(0, 8).map(([k, b]) => `#${k}: ${b.n} teks, ${b.ph} ${fmtDur(Date.now() - b.t0)}`).join('\n') : '');
  };
  const groups = new Map();
  for (const e of todo) { if (!groups.has(e.original)) groups.set(e.original, []); groups.get(e.original).push(e); }
  const units = [], hits = [], gl = parseGlossary(cfg.glossary), cn = parseNotes(cfg.charNotes); let uid = 0;
  // Memori terjemahan: teks pendek yang mirip (beda angka/huruf besar) dan sudah diterjemahkan dipakai sebagai acuan agar pilihan katanya sama.
  const tm = new Map(), plain = (x) => maskText(x).tokens.length === 0;
  for (const e of all) if (e.original.length <= 120 && e.translation?.trim() && (e.status === 'done' || e.status === 'edited')) { const k = simNorm(e.original); if (!tm.has(k)) tm.set(k, e); }
  for (const [original, entries] of groups) {
    const exact = gl.find(([a]) => a.toLowerCase() === original.trim().toLowerCase());
    if (exact) { entries.forEach((e) => hits.push({ ...e, translation: exact[1], status: 'done', error: '' })); continue; }
    const terms = termsFor(gl, `${original}\n${entries[0].meta?.speaker || ''}`);
    const notes = notesFor(cn, entries[0].meta?.speaker || '');
    const key = await cacheKey(project, cfg, original, terms, notes), c = await dbGet('cache', key);
    if (c && !stray(c.text) && !foreignWords(c.text, original).length && !lenOff(c.text, original) && !numDiff(original, c.text) && !englishLeft(c.text, project.tgt, original).length) { entries.forEach((e) => hits.push({ ...e, translation: c.text, status: 'done', error: '' })); continue; }
    const m = maskText(original), e0 = entries[0], p = pos.get(e0.id);
    units.push({
      id: uid++, key, text: m.text, tokens: m.tokens, speaker: e0.meta?.speaker || '', entries, terms, notes, must: termsFor(gl, original),
      ref: (() => { const r0 = original.length <= 120 ? tm.get(simNorm(original)) : null; return r0 && r0.original !== original && plain(r0.original) && plain(r0.translation) ? { from: r0.original.slice(0, 160), to: r0.translation.slice(0, 160) } : null; })(),
      limit: entries.map((x) => limitFor(x, effCfg(project, cfg))).filter(Boolean).reduce((a, b) => (a ? { line: Math.min(a.line, b.line), lines: Math.min(a.lines, b.lines) } : b), null),
      ctx: all.slice(Math.max(0, p - 3), p).filter((x) => x.file === e0.file).map((x) => maskText(x.original).text.slice(0, 200)),
    });
  }
  if (hits.length) { await dbPutMany('entries', hits); n += hits.length; stat.done = stat.cached = hits.length; }
  tick(prog());
  const byId = new Map(units.map((u) => [u.id, u])); let streak = 0;
  // Gerbang bersama: bila provider membatasi (429/5xx), semua worker menunggu dan lajunya diperlambat bertahap, lalu pulih saat sukses.
  const gate = { until: 0, pace: 0 };
  const guarded = async (m) => {
    const w = Math.max(gate.until - Date.now(), gate.pace);
    if (w > 1500) tick(prog());
    if (w > 0) await sleepSig(w, signal);
    try { const r = await chat(m, signal); gate.pace = gate.pace < 200 ? 0 : gate.pace / 2; if (auto && ++lim.okRun >= 4 && lim.cur < lim.max) { lim.cur++; lim.okRun = 0; } return r; }
    catch (e) {
      if (e.status === 429 || e.status >= 500) { if (auto) { lim.cur = Math.max(1, lim.cur - 1); lim.okRun = 0; } gate.until = Math.max(gate.until, Date.now() + Math.min(60000, e.retryAfter ?? 2000)); gate.pace = Math.min(5000, gate.pace ? gate.pace * 2 : 500); }
      throw e;
    }
  };
  const run = async (batch) => {
    const o2 = {
      chat: guarded, retry: { signal }, src: project.src, tgt: project.tgt, context: batch[0].ctx, style: cfg.style,
      check: (id, t) => (!t.trim() ? UI.emptyTr : !unmaskText(t, byId.get(id).tokens).ok ? UI.tokenBad : stray(t) ? STRAY_MSG : foreignWords(t, byId.get(id).text).length ? foreignMsg(t, byId.get(id).text) : codeProblem(byId.get(id).text, t) || (lenOff(t, byId.get(id).text) ? LEN_MSG : '') || (numDiff(byId.get(id).text, t) ? NUM_MSG : '')),
      fixRounds: Math.max(0, Math.min(2, Number.isFinite(Number(cfg.fixRounds)) ? Math.round(Number(cfg.fixRounds)) : 1)),
      onUsage: (u) => { stat.tokensIn += u?.prompt_tokens || 0; stat.tokensOut += u?.completion_tokens || 0; },
    };
    // Simpan hasil valid sesegera mungkin (checkpoint) dan selamatkan bila proses dihentikan/gagal di tengah jalan.
    const keep = new Map(); o2.keep = keep;
    const saveOk = async (map) => {
      const upd = [], cache = [];
      map.forEach((t, id) => { const u = byId.get(id), text = unmaskText(t, u.tokens).text; cache.push({ key: u.key, text, at: Date.now() }); u.entries.forEach((e) => upd.push({ ...e, translation: text, status: 'done', error: '' })); });
      if (cache.length) { await dbPutMany('cache', cache); await dbPutMany('entries', upd); }
      return upd.length;
    };
    let r; const early = new Set(); const st = act.get(batch.bn); if (st) st.ph = 'menerjemahkan'; let earlyN = 0; // unit yang sudah disimpan dan dihitung di checkpoint, supaya angka progres naik lebih awal tanpa terhitung dua kali
    try {
      r = await translateBatch(batch, o2);
      earlyN = await saveOk(r.ok); r.ok.forEach((_, id) => early.add(id)); n += earlyN; stat.done += earlyN; tick(prog());
      if (st) st.ph = 'memeriksa';
      await glossFix(batch, r, o2); await langFix(batch, r, o2);
    } catch (e) {
      let c = 0; try { c = Math.max(0, (await saveOk(keep)) - earlyN); } catch { /* abaikan */ }
      stat.done += c; n += c; tick(prog());
      throw e;
    }
    stat.expOut += batch.reduce((a, u) => a + u.text.length + 5, 0); stat.nb++;
    const upd = [], cache = [];
    r.ok.forEach((t, id) => {
      const u = byId.get(id), text = unmaskText(t, u.tokens).text;
      cache.push({ key: u.key, text, at: Date.now() });
      if (u.entries[0].original.length <= 120) { const k = simNorm(u.entries[0].original); if (!tm.has(k)) tm.set(k, { original: u.entries[0].original, translation: text }); }
      u.entries.forEach((e) => upd.push({ ...e, translation: text, status: 'done', error: '' })); if (!early.has(id)) stat.done += u.entries.length;
    });
    r.fail.forEach((msg, id) => { byId.get(id).entries.forEach((e) => upd.push({ ...e, status: 'error', error: msg })); stat.error += byId.get(id).entries.length; });
    await dbPutMany('cache', cache); await dbPutMany('entries', upd);
    n += upd.length - earlyN; tick(prog());
    streak = r.ok.size ? 0 : streak + 1;
    if (streak >= 3) throw new LlmError(UI.tooMany, { fatal: true });
  };
  const work = async (batch) => {
    while (lim.active >= lim.cur) await sleepSig(150, signal);
    lim.active++; const bn = ++bcount; batch.bn = bn; act.set(bn, { n: batch.length, t0: Date.now(), ph: 'mulai' });
    try { await run(batch); } finally { lim.active--; act.delete(bn); }
  };
  gateRef = gate; const iv = setInterval(() => tick(prog()), 1000);
  try { await runPool(makeBatches(units, eff.batchSize, eff.maxChars), eff.concurrency, eff.delay, signal, work); }
  catch (e) { if (e.name !== 'AbortError') throw e; }
  finally { clearInterval(iv); }
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
  const u0 = { id: 0, text: m.text, speaker: e.meta?.speaker || '', limit: limitFor(e, effCfg(project, cfg)), terms, notes, must: termsFor(parseGlossary(cfg.glossary), e.original) };
  const o1 = {
    chat: call, src: project.src, tgt: project.tgt, context: [], style: cfg.style,
    check: (id, t) => (t.trim() ? (unmaskText(t, m.tokens).ok ? (stray(t) ? STRAY_MSG : foreignWords(t, m.text).length ? foreignMsg(t, m.text) : codeProblem(m.text, t) || (lenOff(t, m.text) ? LEN_MSG : '') || (numDiff(m.text, t) ? NUM_MSG : '')) : UI.tokenBad) : UI.emptyTr),
  };
  const r = await translateBatch([u0], o1); await glossFix([u0], r, o1); await langFix([u0], r, o1);
  if (!r.ok.size) throw new LlmError(r.fail.get(0) || UI.badJson);
  const text = unmaskText(r.ok.get(0), m.tokens).text, u = { ...e, translation: text, status: 'done', error: '' };
  await dbPut('entries', u);
  await dbPut('cache', { key: await cacheKey(project, cfg, e.original, terms, notes), text, at: Date.now() });
  return u;
}
export const MARK_MSG = 'Ditandai untuk diterjemah ulang';
/**
 * Tandai banyak entri untuk diterjemah ulang: status jadi error (terjemahan lama tetap terlihat sebagai acuan, tapi tidak ikut ekspor),
 * dan cache untuk teks-teks itu dibuang supaya hasil lama yang sama tidak dipakai lagi. Mengembalikan {entries, cache}.
 */
export async function markRetranslate(project, cfg, list) {
  const gl = parseGlossary(cfg.glossary), cn = parseNotes(cfg.charNotes), keys = new Set(), seen = new Set();
  for (const e of list) {
    const sp = e.meta?.speaker || '', sig = `${sp}\u0001${e.original}`; if (seen.has(sig)) continue; seen.add(sig);
    keys.add(await cacheKey(project, cfg, e.original, termsFor(gl, `${e.original}\n${sp}`), notesFor(cn, sp)));
  }
  await dbDeleteMany('cache', [...keys]);
  await dbPutMany('entries', list.map((e) => ({ ...e, status: 'error', error: MARK_MSG, reviewed: false })));
  return { entries: list.length, cache: keys.size };
}

// ===== 6. VIEWS (proyek/import, translate, review, ekspor, pengaturan) =====
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k.startsWith('on') ? e.addEventListener(k.slice(2), v) : e.setAttribute(k, v);
  kids.flat().forEach((c) => e.append(c));
  return e;
};
const card = (...k) => h('div', { class: 'card' }, ...k);
/** Kartu yang bisa dilipat: untuk alat yang jarang dipakai. */
const fold = (title, ...k) => h('details', { class: 'card fold' }, h('summary', {}, title), ...k);
/** Teks "Kunci: nilai" per baris menjadi daftar label dan nilai. */
const kv = (t) => h('dl', { class: 'kv' }, t.split('\n').flatMap((l) => {
  const i = l.indexOf(': ');
  return i < 0 ? [h('dd', { class: 'wide' }, l)] : [h('dt', {}, l.slice(0, i)), h('dd', {}, l.slice(i + 2))];
}));
/** Bar aksi menempel di atas nav bawah. Tingginya diukur supaya konten tidak tertutup. */
const actionBar = (...k) => {
  const el = h('div', { class: 'actionbar' }, h('div', { class: 'actionbar-in' }, ...k));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => el.parentElement?.style.setProperty('--bar-h', `${el.offsetHeight}px`)).observe(el);
  return el;
};
/** Baris pilih file: judul + keterangan di kiri, tombol di kanan. */
const pickRow = (title, hint, attrs, onpick) => h('div', { class: 'row' },
  h('span', {}, h('b', {}, title), hint ? h('small', {}, hint) : ''),
  h('label', { class: 'file' }, 'Pilih', h('input', { type: 'file', 'aria-label': `Pilih ${title}`, onchange: onpick, ...attrs })));
/** Proyek lama: pecah kategori database (items -> items-label/items-deskripsi, dst.). Sekali jalan per proyek. */
async function migrateCats(p) {
  if (p.catV >= 2) return p;
  const rows = await dbQuery('entries', 'projectId', p.id), upd = [], counts = {};
  for (const e of rows) {
    const base = String(e.file).split('/').pop().replace(/\.(json|rvdata2)$/i, '');
    if (e.kind === 'field' && DB_FIELDS[base] && e.category === base.toLowerCase()) {
      let key = ''; try { key = String(JSON.parse(e.path).at(-1)); } catch { /* path rusak */ }
      const c = dbCat(base, key); if (c !== e.category) { e.category = c; upd.push(e); }
    }
    counts[e.category] = (counts[e.category] || 0) + 1;
  }
  if (upd.length) await dbPutMany('entries', upd);
  p.counts = counts; p.catV = 2; await dbPut('projects', p);
  return p;
}
async function currentProject() {
  const cur = await dbGet('settings', 'current');
  const p = cur ? await dbGet('projects', cur.value) : null;
  return p ? migrateCats(p) : null;
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
const uiGet = (k, d) => { try { const v = localStorage.getItem('rpgtl:ui:' + k); return v === null ? d : v; } catch { return d; } };
const uiSet = (k, v) => { try { localStorage.setItem('rpgtl:ui:' + k, v); } catch { /* abaikan */ } };
let backupUrl = '';
const mb = (n) => `${n >= 1.05e7 ? Math.round(n / 1048576) : (n / 1048576).toFixed(1)} MB`;
/** Kartu cadangan di tab Proyek: status penyimpanan, buat cadangan, pulihkan. */
function backupCard(p) {
  const msg = h('p', { class: 'mut' }), res = h('div'), st = h('p', { class: 'mut' }, 'Memeriksa penyimpanan…');
  const say = (t, bad) => { msg.className = bad ? 'err' : 'mut'; msg.textContent = t; };
  const ask = h('button', { hidden: '', onclick: () => paintSt(true) }, 'Minta penyimpanan permanen');
  const paintSt = async (askNow) => {
    const s = await storageStatus(askNow).catch(() => null);
    if (!s) { st.textContent = 'Status penyimpanan tidak tersedia di browser ini. Buat cadangan secara berkala.'; return; }
    st.textContent = `Penyimpanan: ${s.persisted ? 'permanen (tidak dihapus otomatis)' : 'belum permanen (browser boleh menghapusnya bila memori penuh)'}${s.usage != null && s.quota ? ` · terpakai ${mb(s.usage)} dari ${mb(s.quota)}` : ''}`;
    ask.hidden = s.persisted;
  };
  paintSt(false);
  const mk = h('button', { class: 'pri', onclick: async (ev) => {
    const b = ev.currentTarget; b.disabled = true; say('Membuat cadangan…'); res.replaceChildren();
    try {
      const blob = await buildBackup(p, await loadConfig());
      if (backupUrl) URL.revokeObjectURL(backupUrl); backupUrl = URL.createObjectURL(blob);
      say(`Cadangan siap (${mb(blob.size)}). Simpan di tempat aman, mis. Google Drive. API key tidak ikut.`);
      res.replaceChildren(h('a', { class: 'file', href: backupUrl, download: `rpgtl-cadangan-${p.id}.zip` }, 'Unduh cadangan'));
      uiSet(`bk:${p.id}:t`, String(Date.now())); uiSet(`bk:${p.id}:n`, String((await dbQuery('entries', 'projectId', p.id)).filter((e) => e.status === 'done' || e.status === 'edited').length));
    } catch (e) { say(e?.message || String(e), true); }
    b.disabled = false;
  } }, 'Buat cadangan');
  const done = async (r) => {
    const c = await loadConfig(), keep = {};
    for (const k of BACKUP_KEYS) if (typeof r.settings[k] === 'string') keep[k] = r.settings[k];
    if (Object.keys(keep).length) await saveConfig({ ...c, ...keep });
    importNote = { text: `Pemulihan selesai. ${r.project.total} teks, ${r.done} sudah diterjemahkan. Glosarium, gaya, catatan karakter, dan daftar aman plugin ikut dipulihkan` };
    storageStatus(true).catch(() => {});
    await render();
  };
  const onPick = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    res.replaceChildren(); say('Membaca cadangan…');
    try {
      const r = await restoreBackup(f);
      if (!r.confirm) return await done(r);
      say(`Proyek ini sudah ada di perangkat.\nSaat ini: ${r.existing.done} dari ${r.existing.total} teks diterjemahkan.\nCadangan: ${r.backup.done} dari ${r.backup.total} teks (${new Date(r.backup.date).toLocaleString('id-ID')}).\nMenimpa mengganti data saat ini dengan isi cadangan.`);
      res.replaceChildren(h('button', { class: 'danger', onclick: async (e2) => {
        e2.currentTarget.disabled = true;
        try { await done(await restoreBackup(f, { overwrite: true })); } catch (e) { say(e?.message || String(e), true); }
      } }, 'Timpa dengan cadangan'));
    } catch (e) { say(e?.message || String(e), true); }
  };
  return fold('Cadangan dan pemulihan',
    h('p', { class: 'mut' }, 'Data hanya tersimpan di browser ini dan bisa hilang bila memori penuh atau data situs dibersihkan. Cadangan berisi proyek, semua terjemahan, file data asli, serta glosarium, gaya, catatan karakter, dan daftar aman plugin. Tanpa API key.'),
    st, ask, p ? mk : '', res,
    pickRow('Pulihkan dari cadangan', 'File .zip hasil Buat cadangan', { accept: '.zip' }, onPick), msg);
}
async function viewProyek() {
  const msg = h('p', { class: 'mut' }), bar = h('progress', { value: '0', max: '1', hidden: '' });
  const box = card(h('h2', {}, 'Impor game'));
  let src = ['auto', 'all', 'ja', 'en'].includes(uiGet('src', 'auto')) ? uiGet('src', 'auto') : 'auto', busy = false;
  if (importNote) { msg.className = importNote.bad ? 'err' : 'mut'; msg.textContent = importNote.text; importNote = null; }
  const lock = (on) => { busy = on; box.classList.toggle('busy', on); bar.hidden = !on; };
  const run = async (ev) => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length || busy) return;
    lock(true); bar.removeAttribute('value'); msg.className = 'mut'; msg.textContent = 'Mengimpor…';
    try {
      const p = await importProject(files, src, (t, d, n) => { msg.textContent = t; if (n) { bar.max = n; bar.value = d; } else bar.removeAttribute('value'); }, { allow: (await loadConfig()).pluginAllow });
      storageStatus(true).catch(() => {});
      importNote = p.total
        ? { text: `Impor selesai. ${p.total} teks dari ${p.files} file${p.broken.length ? `, ${p.broken.length} file rusak dilewati` : ''}. Lanjut ke tab Translate` }
        : { bad: true, text: UI.emptyImp };
      await render();
    } catch (e) { lock(false); msg.className = 'err'; msg.textContent = e.message; }
  };
  const sel = h('select', { onchange: (e) => { src = e.target.value; uiSet('src', src); } },
    h('option', { value: 'auto' }, 'Otomatis (Jepang/Inggris campur)'), h('option', { value: 'all' }, 'Semua teks (bahasa apa pun, impor penuh)'), h('option', { value: 'ja' }, 'Jepang'), h('option', { value: 'en' }, 'Inggris'));
  sel.value = src;
  const pick = (title, hint, attrs) => pickRow(title, hint, attrs, run);
  box.append(h('label', {}, 'Bahasa sumber'), sel,
    h('div', { class: 'picks' },
      pick('Folder data', 'Hasil ekstrak MV, MZ, atau VX Ace', { webkitdirectory: '', multiple: '' }),
      pick('File zip game', 'Zip yang berisi folder data', { accept: '.zip' }),
      pick('Game.rgss3a', 'Arsip terenkripsi VX Ace', {})), bar, msg);
  const lmsg = h('p', { class: 'mut' }), lbar = h('progress', { value: '0', max: '1', hidden: '' });
  const runLang = async (ev) => {
    const files = [...ev.target.files]; ev.target.value = '';
    if (!files.length || busy) return;
    busy = true; lbar.hidden = false; lbar.removeAttribute('value'); lmsg.className = 'mut'; lmsg.textContent = 'Mengimpor…';
    try {
      const p = await importLangFiles(files, src, (t, d, n) => { lmsg.textContent = t; if (n) { lbar.max = n; lbar.value = d; } else lbar.removeAttribute('value'); });
      storageStatus(true).catch(() => {});
      importNote = p.total
        ? { text: `Impor selesai. ${p.total} teks dari ${p.files} file bahasa${p.keySkipped ? `, ${p.keySkipped} entri hanya-kunci dilewati` : ''}${p.broken.length ? `, ${p.broken.length} file rusak dilewati` : ''}. Lanjut ke tab Translate` }
        : { bad: true, text: UI.emptyImp };
      busy = false; await render();
    } catch (e) { busy = false; lbar.hidden = true; lmsg.className = 'err'; lmsg.textContent = e.message; }
  };
  const langCard = card(h('h2', {}, 'Impor file bahasa'),
    h('p', { class: 'mut' }, 'Untuk game yang menyimpan dialog di file bahasa (mis. languages/en.json) dan di event hanya ada kunci seperti #{Scenario.Msg1}. Kunci dan struktur tidak diubah, hanya teksnya. Jadi proyek baru. Bahasa sumber memakai pilihan di atas (pilih Inggris untuk en.json).'),
    h('div', { class: 'picks' }, pickRow('File bahasa JSON', 'Berkas .json bertingkat atau datar (kunci: teks)', { accept: '.json,application/json', multiple: '' }, runLang)), lbar, lmsg);
  const out = [box, langCard];
  const p = await currentProject();
  if (p) out.push(card(h('h2', {}, 'Ringkasan'),
    kv(`Engine: ${p.engine}\nSumber: ${srcLabel(p.src)}\nFile data: ${p.files}${p.broken.length ? ` (rusak: ${p.broken.length})` : ''}\nTotal teks: ${p.total}\n${p.langFile ? `Jenis: file bahasa (kunci dan struktur tetap)\nDilewati (hanya kunci/kode): ${p.keySkipped || 0}` : `Plugin message: ${p.msgPlugins?.length ? `${p.msgPlugins.join(', ')} (pemecahan baris manual dimatikan)` : p.pluginsSeen ? 'tidak ada (pemecahan baris manual aktif)' : 'tidak diketahui (js/plugins.js tidak ikut dipilih)'}`}`),
    p.paramNote ? h('p', { class: 'err' }, p.paramNote) : '',
    h('details', { class: 'fold-in', ...((uiGet('diag', (p.scriptsDiag?.hits || p.scriptsDiag?.error || p.gaps?.length) ? '1' : '0') === '1') ? { open: '' } : {}), ontoggle: (e) => uiSet('diag', e.currentTarget.open ? '1' : '0') },
      h('summary', {}, (p.scriptsDiag?.hits || p.scriptsDiag?.error || p.gaps?.length) ? 'Diagnostik impor (ada temuan)' : 'Diagnostik impor'),
    (() => {
      const L = p.langSkip, names = { ja: 'berhuruf Jepang', mix: 'campuran Jepang + Latin', id: 'berbahasa Indonesia' };
      if (p.src !== 'en') return '';
      if (!L) return h('p', { class: 'mut' }, 'Filter bahasa: impor ulang proyek ini untuk menghitung.');
      const ks = Object.keys(L).filter((k) => L[k].n);
      if (!ks.length) return h('p', { class: 'mut' }, 'Filter bahasa: tidak ada teks yang dibuang.');
      return h('p', { class: 'err' }, `Dibuang karena bukan Inggris (cek bila ada yang salah):\n${ks.map((k) => `${names[k]}: ${L[k].n} | ${L[k].samples.map((x) => `"${x}"`).join(' / ')}`).join('\n')}`);
    })(),
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
    })()),
    p.total ? '' : h('p', { class: 'err' }, UI.emptyImp),
    Object.entries(p.counts).map(([k, v]) => h('span', { class: 'badge' }, `${k} ${v}`)),
    (() => {
      const st = h('p', { class: 'mut' }); let armed = false, tm = 0;
      const b = h('button', { class: 'danger', onclick: async () => {
        // konfirmasi dua ketukan (confirm() sering diblokir browser HP)
        if (!armed) { armed = true; b.textContent = 'Yakin? Ketuk lagi untuk menghapus'; tm = setTimeout(() => { armed = false; b.textContent = 'Hapus proyek'; }, 5000); return; }
        clearTimeout(tm); b.disabled = true; st.className = 'mut'; st.textContent = 'Menghapus… (proyek besar bisa butuh beberapa detik)';
        try { await deleteProject(p.id); await render(); }
        catch (e) { st.className = 'err'; st.textContent = `Gagal menghapus: ${e?.message || e}`; b.disabled = false; armed = false; b.textContent = 'Hapus proyek'; }
      } }, 'Hapus proyek');
      return h('div', { class: 'danger-zone' }, b, st);
    })()));
  if (p) {
    const q = h('textarea', { rows: '3', autocomplete: 'off', spellcheck: 'false', placeholder: 'mis. taste setting, atau satu kalimat panjang' }), res = h('p', { class: 'mut' });
    const minIn = h('input', { type: 'number', min: '30', max: '100', value: '60', inputmode: 'numeric' });
    out.push(fold('Cari teks di data game', h('p', { class: 'mut' }, 'Ketik potongan teks atau kalimat yang belum berubah di game (bahasa aslinya). Cocok persis tampil 100%; selain itu dicari yang mirip dan ditampilkan dengan persentase kemiripan. Kalimat yang dipecah per baris di game juga ikut dicocokkan. Query kurang dari 6 karakter hanya dicari persis.'), q,
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
    const cats = [...new Set([...ALL_CATS, ...Object.keys(p.counts || {})])];

    const fillC = new Set(cats.filter((c) => /-label$/.test(c))), fillBoxes = [];
    const setFill = (on) => { fillC.clear(); if (on) cats.forEach((c) => fillC.add(c)); fillBoxes.forEach((b) => { b.checked = on; }); };
    const fmsg = h('p', { class: 'mut' }), fbar = h('progress', { value: '0', max: '1', hidden: '' });
    const doFill = async (ev) => {
      const fs = [...ev.target.files]; ev.target.value = ''; if (!fs.length) return;
      if (!fillC.size) { fmsg.className = 'err'; fmsg.textContent = 'Centang minimal satu kategori'; return; }
      fbar.hidden = false; fmsg.className = 'mut'; fmsg.textContent = 'Membaca game asli…';
      try {
        const r = await fillFromPristine(p, fs, fillC, (t) => { fmsg.textContent = t; });
        fmsg.textContent = `Selesai. File dicocokkan: ${r.files} (tidak ada di game asli: ${r.nofile}, gagal dibaca: ${r.bad})\nDiisi dengan teks asli: ${r.filled}\nSudah sama: ${r.same}\nPosisi tidak ditemukan (dibiarkan): ${r.nopos}${r.badNames.length ? `\nContoh file gagal: ${r.badNames.join(', ')}` : ''}\nCek di tab Review, lalu ekspor ulang.`;
      } catch (e) { fmsg.className = 'err'; fmsg.textContent = e?.message || String(e); }
      fbar.hidden = true;
    };
    const pickF = (label, attrs) => pickRow(label.replace(/^Pilih /, '').replace(/^./, (c) => c.toUpperCase()), '', attrs, doFill);
    out.push(fold('Isi dari game asli (lewat posisi)',
      h('p', { class: 'mut' }, 'Untuk mengembalikan teks tertentu (mis. label) ke teks game asli tanpa menyentuh entri lain. Pilih kategori, lalu pilih game asli. Teks dicocokkan lewat posisi di file, bukan lewat teks, jadi tetap cocok walau proyek ini diimpor dari game yang sudah diterjemahkan. Kolom terjemahan diisi teks asli dan berstatus edited. File asli proyek tidak diganti.'),
      h('div', { class: 'row' }, h('button', { onclick: () => setFill(true) }, 'Pilih semua'), h('button', { onclick: () => setFill(false) }, 'Kosongkan')),
      cats.map((c) => { const cb = h('input', { type: 'checkbox', ...(fillC.has(c) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? fillC.add(c) : fillC.delete(c); } }); fillBoxes.push(cb); return h('label', { class: 'row' }, cb, ` ${c}`); }),
      pickF('Pilih folder data asli', { webkitdirectory: '', multiple: '' }), pickF('Pilih zip game asli', { accept: '.zip' }), pickF('Pilih Game.rgss3a asli', {}), fbar, fmsg));
  }
  out.push(backupCard(p));
  return out;
}
/** Pengingat cadangan di tab Translate: belum pernah, sudah >= 3 hari dengan kemajuan, atau kemajuan besar sejak cadangan terakhir. */
function backupNag(p, doneN) {
  const last = Number(uiGet(`bk:${p.id}:t`, '0')), lastN = Number(uiGet(`bk:${p.id}:n`, '0')), snooze = Number(uiGet(`bk:${p.id}:s`, '0'));
  const days = (Date.now() - last) / 864e5, gained = doneN - lastN;
  if (doneN < 50 || Date.now() < snooze || !(!last || (days >= 3 && gained >= 50) || gained >= 1000)) return '';
  return card(h('h2', {}, 'Saatnya buat cadangan'),
    h('p', { class: 'mut' }, !last ? `${doneN} teks sudah diterjemahkan dan belum pernah dicadangkan. Data hanya ada di browser ini dan bisa hilang.` : `Cadangan terakhir ${Math.floor(days)} hari lalu; sejak itu ada ${gained} teks baru. Data hanya ada di browser ini.`),
    h('div', { class: 'row' },
      h('button', { class: 'pri', onclick: () => { location.hash = '#/proyek'; } }, 'Buka tab Proyek'),
      h('button', { onclick: () => { uiSet(`bk:${p.id}:s`, String(Date.now() + 864e5)); render(); } }, 'Ingatkan besok')));
}
const job = { running: false, ctl: null, value: 0, max: 1, text: '', err: false, ui: null, warn: '' };
const paintJob = (force) => {
  const u = job.ui; if (!u || !(force || u.bar.isConnected)) return;
  u.bar.max = job.max; u.bar.value = job.value; u.txt.style.whiteSpace = 'pre-line'; u.txt.textContent = job.text + (job.warn ? '\n⚠ ' + job.warn : ''); u.txt.className = job.err ? 'err' : 'mut';
  u.start.disabled = job.running; u.stop.disabled = !job.running;
};
// Kategori yang dipilih untuk diterjemahkan (tab Translate). Disimpan per proyek selama halaman terbuka.
const catSel = { pid: null, set: null };
/** Hitung kategori yang masih punya teks belum selesai, dan samakan pilihan kategori (catSel) dengannya. Default: semua kecuali komentar/skrip. */
function syncCatSel(p, all) {
  const todoBy = new Map(); all.filter((e) => TODO.has(e.status)).forEach((e) => todoBy.set(e.category, (todoBy.get(e.category) || 0) + 1));
  if (catSel.pid !== p.id || !catSel.set) { catSel.pid = p.id; catSel.set = new Set([...todoBy.keys()].filter((k) => k !== 'comment-label' && k !== 'comment-teks' && k !== 'script-teks' && k !== 'script-multi')); }
  for (const k of [...catSel.set]) if (!todoBy.has(k)) catSel.set.delete(k);
  return todoBy;
}
/** opts.ids: terjemahkan hanya entri dengan id tersebut (dipakai aksi massal di Review); tanpa itu, semua kategori yang dicentang. */
async function startJob(opts = {}) {
  if (job.running) return;
  const cfg = await loadConfig(), p = await currentProject();
  job.err = false;
  if (!cfg.apiKey) { job.err = true; job.text = UI.noKey; return paintJob(); }
  const ids = Array.isArray(opts.ids) ? new Set(opts.ids) : null;
  const cats = !ids && catSel.pid === p.id && catSel.set ? [...catSel.set] : null;
  if (cats && !cats.length) { job.err = true; job.text = 'Pilih minimal satu kategori dulu'; return paintJob(); }
  const before = await dbQuery('entries', 'projectId', p.id), base = ids ? 0 : before.filter((e) => e.status === 'done' || e.status === 'edited').length;
  job.running = true; job.ctl = new AbortController(); job.value = 0; job.max = before.filter((e) => TODO.has(e.status) && (!cats || cats.includes(e.category)) && (!ids || ids.has(e.id))).length || 1; job.text = 'Memulai…'; paintJob();
  let lock = null, hiddenAt = 0; job.warn = navigator.wakeLock ? '' : 'Browser ini tidak punya penjaga layar. Matikan kunci layar otomatis di HP dan biarkan app tetap di depan.';
  const getLock = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* layar tetap boleh mati */ } };
  await getLock();
  const onVis = async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt) { const sec = Math.round((Date.now() - hiddenAt) / 1000); hiddenAt = 0; if (sec >= 5) job.warn = `App sempat di latar belakang ${sec} detik. Request yang tertunda bisa gagal dan diulang otomatis. Biarkan layar menyala dan app tetap di depan.`; }
    await getLock(); paintJob();
  };
  const onLeave = (e) => { e.preventDefault(); e.returnValue = ''; };
  document.addEventListener('visibilitychange', onVis); addEventListener('beforeunload', onLeave);
  try {
    let t0 = Date.now(), d0 = null; const smp = [];
    const r = await runTranslation(p, cfg, { signal: job.ctl.signal, base, cats, ids, onProgress: (d, t, txt) => {
      if (d0 === null) { d0 = d; t0 = Date.now(); }
      // ETA dari kecepatan penyelesaian batch (jendela 5 menit terakhir), bukan dari awal proses.
      const now = Date.now(); if (!smp.length || smp[smp.length - 1][1] !== d) smp.push([now, d]);
      while (smp.length > 2 && now - smp[0][0] > 300000) smp.shift();
      let eta = '';
      if (d < t) {
        const a = smp[0], b = smp[smp.length - 1];
        if (smp.length >= 3 && b[0] - a[0] >= 15000 && b[1] > a[1]) { const sec = (t - d) / ((b[1] - a[1]) / ((b[0] - a[0]) / 1000)); eta = ` · sisa ±${sec >= 90 ? Math.round(sec / 60) + ' menit' : Math.round(sec) + ' detik'}`; }
        else if (d > d0) eta = ' · menghitung sisa waktu…';
      }
      job.value = d - base; job.max = (t - base) || 1; job.text = txt + eta; paintJob();
    } });
    job.text = !r.done && !r.error && !r.stopped ? UI.nothing
      : `${r.stopped ? 'Dihentikan' : 'Selesai'}. ${r.done} berhasil (${r.cached} dari cache), ${r.error} error${r.error ? '. Lihat di tab Review, filter Error' : ''}`;
  } catch (e) { job.err = true; job.text = e.message; }
  document.removeEventListener('visibilitychange', onVis); removeEventListener('beforeunload', onLeave);
  try { await lock?.release(); } catch { /* abaikan */ }
  job.running = false; paintJob();
  if (/^#\/translate/.test(location.hash)) render();
}
async function viewTranslate() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const cfg = await loadConfig(), all = await dbQuery('entries', 'projectId', p.id);
  await skipKeyOnly(all);
  // Kategori yang masih punya teks belum diterjemahkan (pending/error). Default: semua kecuali komentar/skrip.
  const todoBy = syncCatSel(p, all);
  const cnt = (s) => all.filter((e) => e.status === s).length;
  // Perkiraan dihitung ulang di tempat saat kategori dicentang, tanpa memuat ulang seluruh halaman.
  const estText = () => {
    const pickedAll = [...todoBy.keys()].every((k) => catSel.set.has(k));
    const scoped = pickedAll ? all : all.filter((e) => !TODO.has(e.status) || catSel.set.has(e.category));
    const est = estimateCost(scoped, cfg, p.src);
    const money = est.cost === null ? 'isi harga token di Pengaturan' : `sekitar ${est.cost.toFixed(4)} (satuan mengikuti harga di Pengaturan)`;
    return `${est.auto ? `Mode otomatis: ${est.batchSize} teks per batch, konkurensi menyesuaikan\n` : ''}Perkiraan kasar: ${est.items} teks unik, ${est.batches} batch\nToken masuk ${est.inTok}, keluar ${est.outTok}\nBiaya: ${money}\nBelum menghitung cache.`;
  };
  const estP = h('p', { class: 'mut' }, estText());
  const setCats = (on) => {
    catSel.set = new Set(on ? todoBy.keys() : []);
    document.querySelectorAll('input[data-cat]').forEach((i) => { i.checked = catSel.set.has(i.dataset.cat); });
    estP.textContent = estText();
  };
  const tgt = h('select', { onchange: async (e) => { p.tgt = e.target.value; await dbPut('projects', { ...p, updatedAt: Date.now() }); await render(); } },
    h('option', { value: 'id', ...(p.tgt === 'id' ? { selected: '' } : {}) }, 'Indonesia'),
    h('option', { value: 'en', ...(p.tgt === 'en' ? { selected: '' } : {}) }, 'Inggris'));
  const bar = h('progress', { value: '0', max: '1' }), txt = h('p', { class: 'mut' });
  const start = h('button', { class: 'pri', onclick: () => startJob() }, cnt('done') || cnt('error') ? 'Lanjutkan' : 'Mulai translate');
  const stop = h('button', { onclick: () => job.ctl?.abort() }, 'Hentikan');
  job.ui = { bar, txt, start, stop };
  if (!p.total) job.text = UI.emptyImp, job.err = true;
  else if (!job.running && !job.text) {
    const fin = cnt('done') + cnt('edited'), todoN = cnt('pending') + cnt('translating') + cnt('error');
    job.value = fin; job.max = fin + todoN || 1;
    job.text = fin ? `${fin} dari ${fin + todoN} teks sudah tersimpan${todoN ? '. Tekan Lanjutkan untuk meneruskan' : ''}` : '';
  }
  const out = [
    card(h('h2', {}, 'Bahasa'), h('label', {}, 'Sumber'), h('p', { class: 'mut' }, srcLabel(p.src)), h('label', {}, 'Target'), tgt),
    card(h('h2', {}, 'Status'), ['pending', 'translating', 'done', 'edited', 'error', 'skipped'].filter(cnt).map((s) => h('span', { class: 'badge' }, `${s} ${cnt(s)}`)),
      estP),
    backupNag(p, cnt('done') + cnt('edited')),
    todoBy.size ? card(h('h2', {}, 'Kategori yang diterjemahkan'),
      h('p', { class: 'mut' }, 'Centang kategori yang mau diterjemahkan sekarang. Hanya teks yang belum diterjemahkan (pending/error) di kategori itu yang dikirim ke LLM di Pengaturan. Kategori lain tidak disentuh.'),
      [...todoBy].sort((a, b) => b[1] - a[1]).map(([k, n]) => h('label', { class: 'row' },
        h('input', { type: 'checkbox', 'data-cat': k, ...(catSel.set.has(k) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? catSel.set.add(k) : catSel.set.delete(k); estP.textContent = estText(); } }), ` ${k} (${n})`)),
      h('div', { class: 'row' },
        h('button', { onclick: () => setCats(true) }, 'Pilih semua'),
        h('button', { onclick: () => setCats(false) }, 'Kosongkan')),
      (() => {
        if (!all.some((e) => todoBy.has(e.category) && e.status !== 'pending')) return '';
        const getBack = () => all.filter((e) => catSel.set.has(e.category) && e.status !== 'pending');
        let armed = false, tm = 0, back = []; const msg = h('p', { class: 'mut' });
        const b = h('button', { class: 'danger', onclick: async () => {
          if (!armed) {
            back = getBack();
            if (!back.length) { msg.textContent = 'Tidak ada terjemahan di kategori yang dicentang.'; return; }
            msg.textContent = ''; armed = true; b.textContent = `Yakin? Ketuk lagi: ${back.length} teks dikosongkan`;
            tm = setTimeout(() => { armed = false; b.textContent = 'Kembalikan ke teks asli'; }, 5000); return;
          }
          clearTimeout(tm); b.disabled = true;
          await dbPutMany('entries', back.map((e) => ({ ...e, translation: '', status: 'pending', error: '' })));
          await render();
        } }, 'Kembalikan ke teks asli');
        return h('div', { class: 'danger-zone' }, h('p', { class: 'mut' }, 'Batalkan terjemahan kategori yang dicentang: hasilnya dikosongkan dan saat ekspor teks itu kembali seperti data yang kamu impor.'), b, msg);
      })()) : '',
    cnt('done') ? (() => {
      const m = h('p', { class: 'mut' });
      return card(h('h2', {}, 'Periksa hasil'), h('p', { class: 'mut' }, 'Cari terjemahan yang masih bercampur huruf Jepang atau asing, atau memuat kata bahasa asing seperti Prancis, Spanyol, Portugis, atau masih ada kata Inggris, atau angkanya berbeda dari teks asli (mis. Level 8 jadi Level 9), atau panjangnya tidak masuk akal dibanding teks asli (salah bahasa, setengah terjemah, atau terjemahan baris lain). Yang ketemu ditandai error supaya bisa diterjemahkan ulang lewat tombol Lanjutkan. Terjemahan yang kamu edit manual tidak disentuh.'),
        h('button', { onclick: async (ev) => {
          const b = ev.currentTarget; b.disabled = true;
          const bad = all.filter((e) => e.status === 'done' && (stray(e.translation) || foreignWords(e.translation, e.original).length || englishLeft(e.translation, p.tgt, e.original).length || garbled(e.translation, e.original).length || lenOff(e.translation, e.original) || numDiff(e.original, e.translation)));
          if (bad.length) await dbPutMany('entries', bad.map((e) => ({ ...e, status: 'error', error: stray(e.translation) ? STRAY_MSG : foreignWords(e.translation, e.original).length ? foreignMsg(e.translation, e.original) : (englishLeft(e.translation, p.tgt, e.original).length || garbled(e.translation, e.original).length) ? ENG_MSG : lenOff(e.translation, e.original) ? LEN_MSG : NUM_MSG })));
          m.textContent = bad.length ? `${bad.length} teks ditandai error.` : 'Tidak ada hasil yang bercampur huruf atau kata asing.';
          b.disabled = false; if (bad.length) render();
        } }, 'Periksa hasil'), m);
    })() : '',
    h('p', { class: 'mut' }, `Teks dikirim ke provider yang dipilih (${cfg.baseUrl}) dengan model ${cfg.model}.`),
    actionBar(bar, txt, h('div', { class: 'row' }, start, stop)),
  ];
  paintJob(true);
  return out;
}
const FIELDS = [
  ['baseUrl', 'Base URL', 'url'], ['apiKey', 'API key', 'password'], ['model', 'Model', 'text'], ['extraBody', 'Body tambahan JSON (opsional)', 'text'], ['temperature', 'Temperature (0 sampai 2)', 'number'],
  ['batchSize', 'Ukuran batch (teks)', 'number'], ['maxChars', 'Batas karakter per batch', 'number'], ['concurrency', 'Konkurensi maks (1 sampai 12)', 'number'],
  ['delay', 'Jeda antar request (ms)', 'number'], ['timeout', 'Batas waktu per request (detik)', 'number'], ['maxTokens', 'Batas token keluar per request (0 = otomatis)', 'number'], ['fixRounds', 'Putaran perbaikan otomatis (0 = mati, 1 = hemat, 2 = penuh)', 'number'], ['wrapWidth', 'Lebar baris maks tanpa face (0 = mati)', 'number'], ['wrapFace', 'Lebar baris maks dengan face', 'number'], ['priceIn', 'Harga token masuk per 1 juta', 'number'], ['priceOut', 'Harga token keluar per 1 juta', 'number'],
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
    concurrency: Math.round(num('concurrency', 1, 12)), delay: Math.round(num('delay', 0, 10000)), timeout: Math.round(num('timeout', 10, 600)), maxTokens: Math.round(num('maxTokens', 0, 200000)), fixRounds: Math.round(num('fixRounds', 0, 2)), wrapWidth: Math.round(num('wrapWidth', 0, 200)), wrapFace: Math.round(num('wrapFace', 0, 200)), fast: fast.checked, auto: autoCb.checked, pluginAllow: allowTa.value, glossary: glossTa.value, style: styleTa.value, charNotes: notesTa.value, priceIn: num('priceIn', 0, 1e6), priceOut: num('priceOut', 0, 1e6),
  });
  const wipeBtn = h('button', { class: 'danger', disabled: '', onclick: async () => { try { await resetAll((m) => say(m, true)); location.hash = '#/proyek'; location.reload(); } catch (e) { say(e.message, true); } } }, 'Hapus semua data');
  const wipe = h('input', { type: 'text', placeholder: 'HAPUS', autocomplete: 'off', oninput: (e) => { wipeBtn.disabled = e.target.value !== 'HAPUS'; } });
  const say = (t, bad) => { msg.className = bad ? 'err' : 'mut'; msg.textContent = t; };
  const save = async () => {
    const n = gather(); if (!urlOk(n.baseUrl)) return say(UI.urlBad, true) || null;
    await saveConfig(n); const gl = parseGlossary(n.glossary).length; say((n.apiKey && !n.remember ? 'Tersimpan. Key hanya diingat sampai tab ditutup' : 'Tersimpan') + (gl ? `. ${gl} istilah di glosarium` : '')); return n;
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
  const pair = {}; FIELDS.forEach(([k], i) => { pair[k] = [form[i * 2], form[i * 2 + 1]]; });
  const advKeys = FIELDS.map(([k]) => k).filter((k) => !['baseUrl', 'apiKey', 'model'].includes(k));
  return [
    card(h('h2', {}, 'Koneksi LLM'), ...pair.baseUrl, ...pair.apiKey, ...pair.model,
      h('label', { class: 'chk' }, remember, 'Ingat key di perangkat ini'),
      h('p', { class: 'mut' }, 'Key hanya dikirim ke base URL di atas. Jangan aktifkan di perangkat bersama.')),
    card(h('h2', {}, 'Gaya bahasa'), h('p', { class: 'mut' }, 'Dikirim ke model di setiap batch. Kosongkan untuk memakai gaya bawaan model. Berlaku untuk terjemahan berikutnya; teks yang sudah selesai tidak berubah.'), styleTa,
      h('label', {}, 'Catatan per karakter (nama pembicara: gaya bicara)'), notesTa,
      h('button', { onclick: () => { styleTa.value = DEFAULT_STYLE; } }, 'Pulihkan gaya bawaan')),
    card(h('h2', {}, 'Glosarium (opsional)'), h('p', { class: 'mut' }, 'Satu baris per istilah: sumber = terjemahan. Istilah dicocokkan tanpa membedakan huruf besar/kecil dan dikirim ke model bersama teks yang memuatnya. Bila hasilnya tidak memakai padanan istilah, teks itu diterjemah ulang sekali. Teks yang isinya persis satu istilah diterjemahkan langsung tanpa model. Teks mirip yang sudah diterjemahkan dipakai sebagai acuan agar pilihan katanya sama. Berlaku untuk terjemahan berikutnya; teks yang sudah selesai tidak diubah. Untuk yang sudah selesai, pakai filter Review "Glosarium tidak dipakai" dan "Terjemahan tidak konsisten".'), glossTa),
    fold('Lanjutan',
      h('label', { class: 'chk' }, autoCb, 'Atur kecepatan otomatis (disarankan)'),
      h('p', { class: 'mut' }, 'Ukuran batch dan konkurensi diatur sendiri mengikuti panjang teks dan respons provider. Isian ukuran batch, batas karakter, konkurensi, dan jeda di bawah baru dipakai kalau ini dimatikan.'),
      ...advKeys.flatMap((k) => pair[k]),
      h('label', { class: 'chk' }, fast, 'Matikan mode berpikir model (khusus OpenRouter, lebih cepat)'),
      h('label', {}, 'Daftar aman plugin (opsional)'),
      h('p', { class: 'mut' }, 'Kosong = perintah dan parameter plugin tidak disentuh. Isi hanya entri yang kamu yakin berisi teks tampil. Berlaku saat impor, jadi impor ulang proyek setelah mengubahnya.'), allowTa),
    h('div', { class: 'card danger-card' }, h('h2', {}, 'Hapus semua data'), h('p', { class: 'mut' }, 'Menghapus semua proyek, terjemahan, cache, dan pengaturan aplikasi ini. Data lain di situs ini tidak disentuh. Ketik HAPUS untuk lanjut.'), wipe, wipeBtn),
    actionBar(msg, h('div', { class: 'row' }, h('button', { class: 'pri', onclick: save }, 'Simpan'), h('button', { onclick: test }, 'Tes koneksi')))];
}
const FILTERS = [['all', 'Semua status'], ['pending', 'Pending'], ['done', 'Done'], ['edited', 'Diedit'], ['error', 'Error'], ['skipped', 'Skipped'], ['codediff', 'Kode berubah (audit)'], ['foreign', 'Bahasa asing (Prancis/Spanyol/Portugis/dll)'], ['same', 'Belum diterjemahkan (sama dengan asli)'], ['glmiss', 'Glosarium tidak dipakai'], ['inconsistent', 'Terjemahan tidak konsisten (teks mirip)'], ['unreviewed', 'Belum dicek'], ['tag:cek', 'Tag: cek nanti']];
const hasForeign = (e) => !!e.translation && foreignWords(e.translation, e.original).length > 0;
/** Apakah k kata Inggris: ada di EN_W atau bentuk turunannya (-s, -es, -ies, -ed, -ing, -ly, -er, -est, 's) dari kata di EN_W. */
function enHas(k) {
  if (EN_W.has(k)) return true;
  if (k.length < 5) return false;
  const ok = (r) => r.length >= 3 && EN_W.has(r);
  const un = (r) => ok(r) || (r.length > 3 && r[r.length - 1] === r[r.length - 2] && ok(r.slice(0, -1)));
  if (k.endsWith("'s")) return enHas(k.slice(0, -2));
  if (k.endsWith('ies') && ok(k.slice(0, -3) + 'y')) return true;
  if (k.endsWith('ing') && (un(k.slice(0, -3)) || ok(k.slice(0, -3) + 'e'))) return true;
  if (k.endsWith('ed') && (un(k.slice(0, -2)) || ok(k.slice(0, -1)))) return true;
  if (k.endsWith('es') && (un(k.slice(0, -2)) || ok(k.slice(0, -1)))) return true;
  if (k.endsWith('s') && un(k.slice(0, -1))) return true;
  if (k.endsWith('ly') && ok(k.slice(0, -2))) return true;
  if (k.endsWith('est') && (un(k.slice(0, -3)) || ok(k.slice(0, -2)))) return true;
  if (k.endsWith('er') && (un(k.slice(0, -2)) || ok(k.slice(0, -1)))) return true;
  return false;
}
/** Kata Inggris yang tertinggal di teks (kode escape diabaikan). Kata >= 3 huruf yang bukan kata Indonesia dan tidak ada di EN_SKIP. */
export function englishWords(t) {
  const ws = String(t || '').replace(ESC, ' ').match(/[A-Za-z']+/g) || [], out = new Set();
  for (const w of ws) { const k = w.toLowerCase().replace(/^'+|'+$/g, ''); if (k.length >= 3 && !ID_W.has(k) && !ID_X.has(k) && !EN_SKIP.has(k) && enHas(k)) out.add(k); }
  return [...out];
}
/** Porsi kata Inggris dari seluruh kata berhuruf (0..1). Dipakai untuk "Dominan Inggris"; kata Indonesia yang tidak ada di kamus tetap dihitung sebagai bukan Inggris. */
function enShare(t) {
  const ws = (String(t || '').replace(ESC, ' ').toLowerCase().match(/[a-z']+/g) || []).map((k) => k.replace(/^'+|'+$/g, '')).filter((k) => k.length >= 2);
  if (!ws.length) return 0;
  let n = 0; for (const k of ws) if (!ID_W.has(k) && !ID_X.has(k) && !EN_SKIP.has(k) && enHas(k)) n++;
  return n / ws.length;
}
const LANG_FILTERS = [['all', 'Semua bahasa'], ['ja', 'Masih ada Jepang/aksara asing'], ['en1', 'Ada kata Inggris (semua)'], ['mix', 'Campuran (Inggris di tengah kalimat Indonesia)'], ['en2', 'Dominan Inggris (belum diterjemah)'], ['es', 'Bahasa asing (Prancis/Spanyol/Portugis/dll)'], ['id', 'Bahasa Indonesia (bersih)']];
const langMemo = new WeakMap();
/**
 * Bahasa HASIL TERJEMAHAN (bukan teks asli). Mengembalikan null bila terjemahan kosong.
 * ja: ada kana/kanji/Cyrillic/Arab/Hangul | en1: ada minimal satu kata Inggris | en2: dominan Inggris dan yakin
 * es: ada kata Spanyol/Portugis | id: terdeteksi Indonesia dan tidak ada kata Inggris.
 */
export function transLang(e) {
  const t = e.translation; if (!t || !t.trim()) return null;
  const m = langMemo.get(e); if (m && m.t === t) return m.v;
  const c = stripEscapes(t).trim(), li = langInfo(c), ja = stray(c.replace(/[\u30fb\u30fc\u30a0\u309b\u309c]/g, ''));
  const en = !ja && englishWords(c).length > 0, dom = en && enShare(c) >= 0.6;
  const v = { ja, en1: en, mix: en && !dom, en2: dom, es: foreignWords(c, e.original).length > 0, id: !ja && li.lang === 'id' && englishWords(c).length === 0 };
  langMemo.set(e, { t, v }); return v;
}
const sameMemo = new WeakMap();
/**
 * Terjemahan identik dengan teks asli padahal bahasanya bukan bahasa target (Jepang, atau Inggris/Indonesia yang jelas):
 * tanda teks yang lolos tanpa diterjemahkan. Teks pendek atau ragu (nama, istilah) tidak dihitung.
 */
export function leftUntranslated(e, tgt = 'id') {
  const t = e.translation; if (!t || !t.trim()) return false;
  const m = sameMemo.get(e); if (m && m.t === t && m.g === tgt) return m.v;
  let v = false;
  if (normTxt(t) === normTxt(e.original)) { const li = langInfo(stripEscapes(t).trim()); v = li.lang === 'ja' || (li.sure && !!li.lang && li.lang !== tgt); }
  sameMemo.set(e, { t, g: tgt, v }); return v;
}
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
const edgeCls = (e) => `card st-${e.status}${e.reviewed ? ' rv' : ''}`;
const CODEDIFF_MSG = 'Kode game berbeda dari teks asli (cek warna, nama, variabel, tag). Periksa sebelum ekspor';
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
  const glRev = parseGlossary((await loadConfig()).glossary);
  let filter = 'all', lang = 'all', cat = 'all', fn = 'any', mode = 'loose', q = '', qRaw = '', qRe = null, page = 0, count = 0;
  const origNorm = new WeakMap(), normOf = (e) => { let v = origNorm.get(e); if (v === undefined) { v = searchNorm(e.original); origNorm.set(e, v); } return v; };
  const box = h('div'), info = h('p', { class: 'mut' });
  let qErr = '', paintChips = () => {}, paintBulk = () => {}, paintCats = () => {}, curList = [];
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
  // Satu jalur simpan dan terjemah ulang untuk kartu daftar dan tampilan fokus.
  const unrev = (e) => (e.status === 'done' || e.status === 'edited') && !e.reviewed;
  // Edit manual dianggap sudah dicek; terjemahan dikosongkan berarti belum.
  const saveTr = async (e, text) => { const u = { ...e, translation: text, status: text.trim() ? 'edited' : 'pending', error: '', reviewed: !!text.trim() }; await dbPut('entries', u); Object.assign(e, u); };
  const hasTag = (e, t) => Array.isArray(e.tags) && e.tags.includes(t);
  const setTag = async (e, t, on) => { const cur = new Set(Array.isArray(e.tags) ? e.tags : []); if (on) cur.add(t); else cur.delete(t); const u = { ...e, tags: [...cur] }; await dbPut('entries', u); Object.assign(e, u); };
  // "Jangan diterjemahkan" memakai status skipped yang sudah ada (tidak dikirim ke model, tetap asli di ekspor). Terjemahan lama disimpan agar bisa dipulihkan.
  const setSkip = async (e, on) => { const u = { ...e, status: on ? 'skipped' : (e.translation?.trim() ? 'edited' : 'pending'), error: '' }; await dbPut('entries', u); Object.assign(e, u); };
  const setReviewed = async (e, v) => { const u = { ...e, reviewed: !!v }; await dbPut('entries', u); Object.assign(e, u); };
  // Terjemah ulang otomatis menghapus tanda dicek (hasilnya belum dilihat manusia).
  const redoOne = async (e) => {
    const cfg = await loadConfig(); if (!cfg.apiKey) throw new Error(UI.noKey);
    Object.assign(e, await retranslateEntry(p, cfg, e)); e.error = '';
    if (e.reviewed) await setReviewed(e, false);
  };
  // Tampilan fokus satu teks. Konteks dan bantuan dihitung hanya untuk entri yang sedang dibuka.
  const fdlg = h('dialog', { class: 'sheet focus', 'aria-label': 'Koreksi satu teks' });
  let fSeq = [], fi = 0, fScroll = 0, fCommit = async () => {};
  const byFile = new Map();
  const ctxOf = (e) => {
    let l = byFile.get(e.file);
    if (!l) { l = rows.filter((x) => x.file === e.file).sort((a, b) => ((a.order ?? a.id) - (b.order ?? b.id)) || a.id - b.id); byFile.set(e.file, l); }
    const i = l.indexOf(e); return i < 0 ? [] : l.slice(Math.max(0, i - 3), i);
  };
  const clip = (t, n = 110) => {
    const s = String(t || '').replace(/\s*\n\s*/g, ' / ').trim(); if (s.length <= n) return s;
    const cut = s.slice(0, n), sp = cut.lastIndexOf(' '); return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:/]+$/, '')}…`;
  };
  const openFocus = (e) => { fSeq = curList.slice(); fi = Math.max(0, fSeq.indexOf(e)); fScroll = scrollY; paintFocus(); fdlg.showModal(); };
  const paintFocus = () => {
    const e = fSeq[fi]; if (!e) { fdlg.close(); return; }
    const st = h('span', { class: 'badge' }, e.status), warn = h('span', { class: 'badge warn' }, 'baris panjang');
    const msg = h('p', { class: 'err' }), note = h('p', { class: 'mut' }), cb = h('input', { type: 'checkbox' }), tagCb = h('input', { type: 'checkbox' }), skCb = h('input', { type: 'checkbox' });
    const ta = h('textarea', { rows: String(Math.max(4, e.original.split('\n').length + 2)), 'aria-label': 'Terjemahan', spellcheck: 'false' }, e.translation);
    const sync = () => { st.textContent = e.status; cb.checked = !!e.reviewed; tagCb.checked = hasTag(e, 'cek'); skCb.checked = e.status === 'skipped'; warn.hidden = !longLine(ta.value); msg.className = 'err'; msg.textContent = e.error || (codeDiff(e) ? CODEDIFF_MSG : ''); };
    sync(); ta.addEventListener('input', () => { warn.hidden = !longLine(ta.value); note.textContent = ''; });
    fCommit = async () => { if (ta.value !== e.translation) { await saveTr(e, ta.value); sync(); } };
    const say = (t, bad) => { note.className = bad ? 'err' : 'mut'; note.textContent = t; };
    cb.addEventListener('change', async () => { try { await fCommit(); await setReviewed(e, cb.checked); sync(); } catch (x) { say(x?.message || String(x), true); sync(); } });
    const flip = (fn) => async () => { try { await fCommit(); await fn(); } catch (x) { say(x?.message || String(x), true); } sync(); paintDup(); };
    tagCb.addEventListener('change', flip(() => setTag(e, 'cek', tagCb.checked)));
    skCb.addEventListener('change', flip(() => setSkip(e, skCb.checked)));
    // Terapkan ke teks lain yang aslinya sama persis (dan pembicara sama). Konfirmasi dua ketukan; yang sedang diterjemahkan atau dilewati tidak disentuh.
    const spk = (x) => x.meta?.speaker || '';
    const dups = rows.filter((x) => x !== e && x.original === e.original && spk(x) === spk(e) && x.status !== 'skipped' && x.status !== 'translating');
    let dArmed = false, dTm = 0;
    const dupInfo = () => { const t = ta.value, hit = t.trim() ? dups.filter((x) => x.translation !== t) : []; return { hit, manual: hit.filter((x) => x.status === 'edited' && x.translation?.trim()) }; };
    const dupBtn = h('button', { onclick: async () => {
      const { hit } = dupInfo(); if (!hit.length) return;
      if (!dArmed) { dArmed = true; paintDup(); dTm = setTimeout(() => { dArmed = false; paintDup(); }, 5000); return; }
      clearTimeout(dTm); dArmed = false; dupBtn.disabled = true;
      try {
        await fCommit();
        const t = e.translation, targets = dups.filter((x) => x.translation !== t);
        const upd = targets.map((x) => ({ ...x, translation: t, status: 'edited', error: '', reviewed: !!e.reviewed }));
        await dbPutMany('entries', upd); targets.forEach((x, i) => Object.assign(x, upd[i]));
        say(`Diterapkan ke ${upd.length} teks`);
      } catch (x) { say(x?.message || String(x), true); }
      dupBtn.disabled = false; paintDup();
    } });
    const paintDup = () => {
      const { hit, manual } = dupInfo(); dupBtn.hidden = !hit.length;
      dupBtn.textContent = dArmed ? `Yakin? Ketuk lagi: ${hit.length} teks ditimpa${manual.length ? `, termasuk ${manual.length} hasil edit manual yang berbeda` : ''}` : `Terapkan ke ${hit.length} teks lain yang aslinya sama persis`;
    };
    ta.addEventListener('input', () => { clearTimeout(dTm); dArmed = false; paintDup(); });
    paintDup();
    const move = (find) => async () => {
      try { await fCommit(); } catch (x) { say(x?.message || String(x), true); return; }
      const j = find(); if (j < 0) { say('Tidak ada lagi di daftar ini'); return; }
      fi = j; paintFocus(); fdlg.querySelector('.sheet-body').scrollTop = 0;
    };
    const rt = h('button', { class: 'sm', onclick: async () => {
      rt.disabled = true; msg.className = 'mut'; msg.textContent = 'Menerjemahkan…'; e.error = '';
      try { await redoOne(e); ta.value = e.translation; } catch (x) { e.error = x?.message || String(x); }
      rt.disabled = false; sync();
    } }, 'Terjemah ulang');
    const ctx = ctxOf(e), terms = termsFor(glRev, e.original), k = simNorm(stripEscapes(e.original)), seen = new Set(), sims = [];
    if (k.length >= 3) for (const x of rows) {
      if (x === e || !x.translation?.trim() || (x.status !== 'done' && x.status !== 'edited') || seen.has(x.translation) || simNorm(stripEscapes(x.original)) !== k) continue;
      seen.add(x.translation); sims.push(x); if (sims.length >= 3) break;
    }
    const meta = [e.meta?.speaker && `Pembicara: ${e.meta.speaker}`, e.meta?.face && 'Ada wajah (face)'].filter(Boolean);
    const body = h('div', { class: 'sheet-body' },
      h('div', {}, h('span', { class: 'badge' }, e.category), st, warn), meta.length ? h('p', { class: 'mut' }, meta.join('\n')) : '',
      ctx.length ? h('details', { class: 'fold-in', open: '' }, h('summary', {}, `Konteks (${ctx.length} sebelumnya)`),
        ctx.map((x) => h('div', { class: 'ctx' }, h('p', { class: 'mut' }, clip(x.original)), x.translation?.trim() ? h('p', { class: 'tr' }, clip(x.translation)) : ''))) : '',
      h('label', {}, 'Teks asli'), h('div', { class: 'orig' }, e.original),
      h('label', {}, 'Terjemahan'), ta, msg, note,
      h('label', { class: 'chk' }, cb, 'Sudah dicek'), h('label', { class: 'chk' }, tagCb, 'Cek nanti'), h('label', { class: 'chk' }, skCb, 'Jangan diterjemahkan (lewati)'), dupBtn,
      (terms.length || sims.length) ? h('details', { class: 'fold-in', open: '' }, h('summary', {}, 'Bantuan'),
        terms.length ? h('div', {}, h('p', { class: 'mut' }, 'Glosarium'), terms.map(([a, b]) => h('p', { class: 'help' }, `${a} = ${b}`))) : '',
        sims.length ? h('div', {}, h('p', { class: 'mut' }, 'Teks mirip yang sudah diterjemahkan'), sims.map((x) => h('div', { class: 'row sim' }, h('span', {}, clip(x.translation, 140)),
          h('button', { class: 'sm', onclick: () => { ta.value = x.translation; ta.dispatchEvent(new Event('input')); ta.focus(); } }, 'Pakai')))) : '') : '',
      h('div', { class: 'row' }, rt));
    fdlg.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', {}, `${fi + 1} / ${fSeq.length}`), h('button', { class: 'sm', onclick: async () => { try { await fCommit(); } catch (x) { say(x?.message || String(x), true); return; } fdlg.close(); } }, 'Tutup')),
      body,
      h('div', { class: 'sheet-foot' },
        h('button', { class: 'pri', onclick: async () => { try { const d = ta.value !== e.translation, was = !!e.reviewed; await fCommit(); if (e.translation.trim() && !e.reviewed) await setReviewed(e, true); sync(); say(d ? 'Tersimpan' : was ? 'Tidak ada perubahan' : 'Ditandai sudah dicek'); } catch (x) { say(x?.message || String(x), true); } } }, 'Simpan'),
        h('div', { class: 'row' },
          h('button', { onclick: move(() => fi - 1), ...(fi > 0 ? {} : { disabled: '' }) }, 'Sebelumnya'),
          h('button', { onclick: move(() => fSeq.findIndex((x, j) => j > fi && x.status === 'error')) }, 'Error berikutnya'),
          h('button', { onclick: move(() => (fi < fSeq.length - 1 ? fi + 1 : -1)), ...(fi < fSeq.length - 1 ? {} : { disabled: '' }) }, 'Berikutnya'))));
  };
  // Menutup (tombol, Esc, atau tombol kembali) menyimpan sisa ketikan, lalu daftar digambar ulang di posisi semula.
  fdlg.addEventListener('close', async () => { try { await fCommit(); } catch { /* abaikan */ } fCommit = async () => {}; fill(); scrollTo(0, fScroll); });
  fdlg.addEventListener('click', (ev) => { if (ev.target === fdlg) fdlg.close(); });
  const rowCard = (e) => {
    const st = h('span', { class: 'badge' }, e.status), warn = h('span', { class: 'badge warn' }, 'baris panjang'), rv = h('span', { class: 'badge ok' }, 'dicek'), tg = h('span', { class: 'badge tag' }, 'cek nanti'), msg = h('p', { class: 'err' }, e.error);
    warn.hidden = !longLine(e.translation);
    const ta = h('textarea', { rows: String(Math.max(2, e.original.split('\n').length + 1)) }, e.translation);
    const sync = () => { st.textContent = e.status; rv.hidden = !e.reviewed; tg.hidden = !hasTag(e, 'cek'); const c = ta.closest('.card'); if (c) c.className = edgeCls(e); warn.hidden = !longLine(e.translation); msg.className = 'err'; msg.textContent = e.error || (codeDiff(e) ? CODEDIFF_MSG : ''); };
    sync();
    ta.addEventListener('change', async () => {
      await saveTr(e, ta.value); sync();
    });
    const rt = h('button', { class: 'sm', onclick: async () => {
      rt.disabled = true; msg.className = 'mut'; msg.textContent = 'Menerjemahkan…'; e.error = '';
      try {
        await redoOne(e); ta.value = e.translation;
      } catch (x) { e.error = x.message || String(x); }
      rt.disabled = false; sync();
    } }, 'Terjemah ulang');
    const open = h('button', { class: 'sm', 'aria-label': 'Buka tampilan fokus', onclick: () => openFocus(e) }, 'Buka');
    const orig = h('p', { class: 'mut tap', onclick: () => { if (!String(getSelection?.() || '')) openFocus(e); } }, e.original);
    const c = card(h('div', { class: 'rowhead' }, h('div', {}, h('span', { class: 'badge' }, e.category), st, rv, tg, warn), h('div', { class: 'rowbtns' }, open, rt)), orig, ta, msg);
    c.className = edgeCls(e); return c;
  };
  const fill = () => {
    uiSet('filters:' + p.id, JSON.stringify({ filter, lang, cat, fn, mode, q: qRaw }));
    const fnRe = fnTest(fn), incSet = filter === 'inconsistent' ? inconsistentIds(rows) : null;
    const list = rows.filter((e) => (filter === 'all' || (filter === 'codediff' ? codeDiff(e) : filter === 'foreign' ? hasForeign(e) : filter === 'same' ? leftUntranslated(e, p.tgt) : filter === 'glmiss' ? !!e.translation && glossMissing(glRev, e.original, e.translation).length > 0 : filter === 'inconsistent' ? incSet.has(e.id) : filter === 'unreviewed' ? unrev(e) : filter === 'tag:cek' ? hasTag(e, 'cek') : e.status === filter)) && (lang === 'all' || !!transLang(e)?.[lang]) && (cat === 'all' || e.category === cat) && (!fnRe || fnRe.test(e.original)) && matchText(e));
    if (incSet) list.sort((a, b) => (simNorm(stripEscapes(a.original)) < simNorm(stripEscapes(b.original)) ? -1 : simNorm(stripEscapes(a.original)) > simNorm(stripEscapes(b.original)) ? 1 : a.id - b.id));
    curList = list;
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); page = Math.min(page, pages - 1);
    info.textContent = qErr ? qErr : `${list.length} teks`; info.className = qErr ? 'err' : 'mut'; count = list.length; paintChips(); paintBulk(list); paintCats();
    const go = (n) => () => { page = n; fill(); scrollTo(0, 0); };
    box.replaceChildren(...list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(rowCard),
      h('div', { class: 'row' }, h('button', { onclick: go(page - 1), ...(page ? {} : { disabled: '' }) }, 'Sebelumnya'),
        h('button', { onclick: go(page + 1), ...(page < pages - 1 ? {} : { disabled: '' }) }, `Berikutnya (${page + 1}/${pages})`)));
  };
  const sCnt = new Map(); rows.forEach((e) => sCnt.set(e.status, (sCnt.get(e.status) || 0) + 1)); sCnt.set('codediff', rows.filter(codeDiff).length); sCnt.set('foreign', rows.filter(hasForeign).length); sCnt.set('same', rows.filter((e) => leftUntranslated(e, p.tgt)).length); sCnt.set('glmiss', glRev.length ? rows.filter((e) => e.translation && glossMissing(glRev, e.original, e.translation).length).length : 0); sCnt.set('inconsistent', inconsistentIds(rows).size); sCnt.set('unreviewed', rows.filter(unrev).length); sCnt.set('tag:cek', rows.filter((e) => hasTag(e, 'cek')).length);
  const sel = h('select', { 'aria-label': 'Filter status', onchange: (e) => { filter = e.target.value; page = 0; fill(); } }, FILTERS.map(([v, t]) => h('option', { value: v }, v === 'all' ? `${t} (${rows.length})` : `${t} (${sCnt.get(v) || 0})`)));
  const lCnt = new Map(); rows.forEach((e) => { const f = transLang(e); if (f) for (const k of Object.keys(f)) if (f[k]) lCnt.set(k, (lCnt.get(k) || 0) + 1); });
  const langSel = h('select', { 'aria-label': 'Filter bahasa terjemahan', onchange: (e) => { lang = e.target.value; page = 0; fill(); } }, LANG_FILTERS.map(([v, t]) => h('option', { value: v }, v === 'all' ? t : `${t} (${lCnt.get(v) || 0})`)));
  const fnSel = h('select', { 'aria-label': 'Filter kode atau fungsi', onchange: (e) => { fn = e.target.value; page = 0; fill(); } }, FUNC_FILTERS.map(([v, t]) => { const re = fnTest(v); return h('option', { value: v }, re ? `${t} (${rows.filter((x) => re.test(x.original)).length})` : t); }));
  const modeSel = h('select', { 'aria-label': 'Mode pencarian', onchange: (e) => { mode = e.target.value; setQuery(qRaw); } },
    h('option', { value: 'loose' }, 'Cari longgar (abaikan spasi & tanda baca)'), h('option', { value: 'exact' }, 'Cari persis (kode & tanda baca, mis. \\v[ atau if)'), h('option', { value: 'regex' }, 'Regex'));
  const cats = new Map(); rows.forEach((e) => cats.set(e.category, (cats.get(e.category) || 0) + 1));
  const catSel = h('select', { onchange: (e) => { cat = e.target.value; page = 0; fill(); } },
    h('option', { value: 'all' }, `Semua kategori (${rows.length})`), [...cats].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => h('option', { value: c }, `${c} (${n})`)));
  // Pintu masuk: kategori dengan jumlah dan persentase selesai (done + edited dibanding semua kecuali skipped, sama dengan tab Translate).
  const catList = h('div'), catCard = fold('Kategori', catList);
  let catInit = false;
  paintCats = () => {
    const m = new Map(); let fin = 0, todo = 0;
    for (const e of rows) {
      let s = m.get(e.category); if (!s) m.set(e.category, s = { fin: 0, todo: 0 });
      if (e.status === 'done' || e.status === 'edited') { s.fin++; fin++; } else if (e.status !== 'skipped') { s.todo++; todo++; }
    }
    const pct = (s) => (s.fin + s.todo ? Math.round((100 * s.fin) / (s.fin + s.todo)) : null);
    const row = (key, label, n, s) => {
      const v = pct(s);
      return h('button', { class: `catrow${cat === key ? ' on' : ''}`, 'aria-pressed': String(cat === key), onclick: () => { cat = key; catSel.value = key; page = 0; catCard.open = false; fill(); scrollTo(0, 0); } },
        h('span', {}, label), h('span', { class: 'cm' }, `${n} teks · ${v === null ? '—' : v + '%'}`), v === null ? '' : h('progress', { max: '100', value: String(v), 'aria-hidden': 'true' }));
    };
    catList.replaceChildren(row('all', 'Semua kategori', rows.length, { fin, todo }), ...[...cats].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => row(c, c, n, m.get(c) || { fin: 0, todo: 0 })));
    const all = pct({ fin, todo });
    catCard.querySelector('summary').textContent = `Kategori (${cats.size})${all === null ? '' : ` · ${all}% selesai`}`;
    if (!catInit) { catInit = true; catCard.open = cat === 'all' && filter === 'all' && lang === 'all' && fn === 'any' && !qRaw; }
  };
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
  // Ganti massal memakai konfirmasi dua ketukan seperti aksi hapus lainnya.
  let armed = false, tm = 0;
  const disarm = () => { clearTimeout(tm); armed = false; applyBtn.textContent = 'Ganti semua'; };
  const applyBtn = h('button', { class: 'danger', onclick: async () => {
    if (armed) { disarm(); await apply(); return; }
    if (!rf.value) { rMsg.className = 'err'; rMsg.textContent = 'Isi kata yang dicari dulu'; return; }
    const { total } = scan();
    if (!total) { rMsg.className = 'mut'; rMsg.textContent = 'Tidak ada yang cocok'; return; }
    armed = true; applyBtn.textContent = `Yakin? Ganti ${total} kata`; tm = setTimeout(disarm, 5000);
  } }, 'Ganti semua');
  [rf, rr, wholeCb, icCb].forEach((x) => x.addEventListener('input', disarm));
  const replCard = fold('Cari & ganti kata',
    h('p', { class: 'mut' }, 'Mengganti kata di terjemahan saja (bukan teks asli), mengikuti kategori yang dipilih di atas. Kode game tidak disentuh.'),
    rf, rr, h('label', { class: 'chk' }, wholeCb, 'Kata utuh saja (kau tidak mengubah "kaum")'), h('label', { class: 'chk' }, icCb, 'Abaikan huruf besar/kecil (Kau menjadi Kamu)'),
    h('div', { class: 'row' }, h('button', { onclick: preview }, 'Cek jumlah'), applyBtn), rMsg);
  // Aksi massal untuk semua teks hasil filter/pencarian (hanya tampil bila ada filter aktif). Konfirmasi dua ketukan.
  const cfg0 = await loadConfig();
  let shown = []; const bMsg = h('p', { class: 'mut' });
  const bSay = (t, bad) => { bMsg.className = bad ? 'err' : 'mut'; bMsg.textContent = t; };
  const bulkBtn = (cls, label, warn, run) => {
    const b = h('button', cls ? { class: cls } : {}); let armed = false, tm = 0;
    b.reset = () => { clearTimeout(tm); armed = false; b.textContent = label(); };
    b.addEventListener('click', async () => {
      if (!shown.length) return;
      if (!armed) { armed = true; b.textContent = warn(); tm = setTimeout(b.reset, 5000); return; }
      b.reset(); b.disabled = true; bSay('');
      try { await run(); } catch (x) { bSay(x?.message || String(x), true); }
      b.disabled = false;
    });
    b.reset(); return b;
  };
  const editedN = () => shown.filter((e) => e.status === 'edited').length;
  const warnTxt = (what) => `Yakin? Ketuk lagi: ${shown.length} teks ${what}${editedN() ? `, termasuk ${editedN()} hasil edit manual` : ''}`;
  const markBtn = bulkBtn('', () => `Tandai untuk diterjemah ulang (${shown.length})`, () => warnTxt('ditandai'), async () => {
    const r = await markRetranslate(p, cfg0, shown);
    shown.forEach((e) => Object.assign(e, { status: 'error', error: MARK_MSG, reviewed: false }));
    bSay(`${r.entries} teks ditandai (status Error; terjemahan lama tetap terlihat tapi tidak ikut ekspor). Buka tab Translate lalu tekan Lanjutkan, atau pakai chat AI di tab Ekspor.`); fill();
  });
  const redoBtn = bulkBtn('pri', () => `Terjemah ulang sekarang (${shown.length})`, () => {
    const est = estimateCost(shown.map((e) => ({ ...e, status: 'pending' })), cfg0, p.src);
    return warnTxt(`diterjemah ulang lewat LLM (±${est.inTok + est.outTok} token)`);
  }, async () => {
    const cfg = await loadConfig(); if (!cfg.apiKey) throw new Error(UI.noKey);
    const ids = shown.map((e) => e.id); await markRetranslate(p, cfg, shown);
    location.hash = '#/translate'; startJob({ ids });
  });
  const bulkCard = fold('Aksi untuk hasil filter', h('p', { class: 'mut' }, 'Berlaku untuk semua teks yang tampil di daftar (bukan hanya halaman ini). Terjemahan lama diganti, termasuk hasil edit manual, dan cache teks itu dibuang agar hasilnya benar-benar baru.'), redoBtn, markBtn, bMsg);
  bulkCard.hidden = true;
  paintBulk = (list) => {
    shown = list; const act = filter !== 'all' || lang !== 'all' || cat !== 'all' || fn !== 'any' || !!qRaw;
    bulkCard.hidden = !act || !list.length; bulkCard.querySelector('summary').textContent = `Aksi untuk ${list.length} teks hasil filter`;
    redoBtn.reset(); markBtn.reset();
  };
  // Filter tersembunyi di balik tombol Filter (panel bawah); yang aktif tampil sebagai chip yang bisa dihapus.
  const optText = (s) => s.options[s.selectedIndex]?.textContent.replace(/\s*\(\d+\)$/, '') || '';
  const activeFilters = () => [
    filter !== 'all' && [`Status: ${optText(sel)}`, () => { filter = 'all'; sel.value = 'all'; }],
    lang !== 'all' && [`Bahasa: ${optText(langSel)}`, () => { lang = 'all'; langSel.value = 'all'; }],
    cat !== 'all' && [`Kategori: ${cat}`, () => { cat = 'all'; catSel.value = 'all'; }],
    fn !== 'any' && [optText(fnSel), () => { fn = 'any'; fnSel.value = 'any'; }],
    mode !== 'loose' && [optText(modeSel).split(' (')[0], () => { mode = 'loose'; modeSel.value = 'loose'; }],
  ].filter(Boolean);
  const chips = h('div', { class: 'chips' }), fbadge = h('span', { class: 'count', hidden: '' }), showBtn = h('button', { class: 'pri', onclick: () => sheet.close() }, 'Tampilkan');
  const sheet = h('dialog', { class: 'sheet', 'aria-label': 'Filter' });
  paintChips = () => {
    const act = activeFilters();
    fbadge.textContent = String(act.length); fbadge.hidden = !act.length;
    showBtn.textContent = `Tampilkan ${count} teks`;
    chips.replaceChildren(...act.map(([t, clear]) => h('button', { class: 'chip', 'aria-label': `Hapus filter ${t}`, onclick: () => { clear(); setQuery(qRaw); } }, `${t} ×`)));
  };
  const resetFilters = () => { filter = 'all'; lang = 'all'; langSel.value = 'all'; cat = 'all'; fn = 'any'; mode = 'loose'; sel.value = 'all'; catSel.value = 'all'; fnSel.value = 'any'; modeSel.value = 'loose'; setQuery(qRaw); };
  sheet.append(
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Filter'), h('button', { class: 'sm', onclick: () => sheet.close() }, 'Tutup')),
    h('div', { class: 'sheet-body' }, h('label', {}, 'Status'), sel, h('label', {}, 'Bahasa terjemahan'), langSel, h('label', {}, 'Kategori'), catSel, h('label', {}, 'Kode atau fungsi'), fnSel, h('label', {}, 'Mode pencarian'), modeSel),
    h('div', { class: 'sheet-foot row' }, h('button', { onclick: resetFilters }, 'Atur ulang'), showBtn));
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
  const fbtn = h('button', { class: 'filterbtn', 'aria-haspopup': 'dialog', onclick: () => sheet.showModal() }, 'Filter', fbadge);
  // Pulihkan filter terakhir (per proyek); nilai yang sudah tidak ada diabaikan.
  try {
    const sv = JSON.parse(uiGet('filters:' + p.id, 'null'));
    if (sv) {
      const ok = (s, v) => [...s.options].some((o) => o.value === v);
      if (ok(sel, sv.filter)) { filter = sv.filter; sel.value = filter; }
      if (ok(langSel, sv.lang)) { lang = sv.lang; langSel.value = lang; }
      if (ok(catSel, sv.cat)) { cat = sv.cat; catSel.value = cat; }
      if (ok(fnSel, sv.fn)) { fn = sv.fn; fnSel.value = fn; }
      if (ok(modeSel, sv.mode)) { mode = sv.mode; modeSel.value = mode; }
      if (typeof sv.q === 'string' && sv.q) { find.value = sv.q; setQuery(sv.q); return [h('div', { class: 'searchbar' }, find, fbtn), h('div', { class: 'meta' }, info, chips), catCard, replCard, bulkCard, box, sheet, fdlg]; }
    }
  } catch { /* abaikan */ }
  fill();
  return [h('div', { class: 'searchbar' }, find, fbtn), h('div', { class: 'meta' }, info, chips), catCard, replCard, bulkCard, box, sheet, fdlg];
}
let exportUrl = '', rgUrl = '';
/** Nama file patch: "<judul game> - ke <n>.zip". Judul diambil dari System (terjemahan kalau ada, kalau tidak aslinya); nomor naik tiap ekspor sukses per proyek. */
async function patchFileName(p) {
  const es = await dbQuery('entries', 'projectId', p.id);
  const t = es.find((e) => e.category === 'system' && /^\["(gameTitle|game_title)"\]$/.test(e.path));
  const raw = t ? ((t.status === 'done' || t.status === 'edited') && t.translation?.trim() ? t.translation : t.original) : '';
  const title = String(raw || '').replace(ESC, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 80).trim() || `rpgtl-patch-${p.id}`;
  const key = 'exportCount:' + p.id, n = ((await dbGet('settings', key))?.value || 0) + 1;
  await dbPut('settings', { key, value: n });
  return `${title} - ke ${n}.zip`;
}
async function viewEkspor() {
  const p = await currentProject();
  if (!p) return [card(h('p', { class: 'mut' }, UI.none))];
  const cfg = await loadConfig(), rows = await dbQuery('entries', 'projectId', p.id);
  await skipKeyOnly(rows);
  const n = (f) => rows.filter(f).length, out = h('div');
  const ready = n((e) => (e.status === 'done' || e.status === 'edited') && e.translation.trim()), pend = n((e) => e.status === 'pending' || e.status === 'translating'), err = n((e) => e.status === 'error');
  const rgMsg = h('p', { class: 'mut' }), rgOut = h('div');
  const todoBy = syncCatSel(p, rows), catBox = h('div');
  const chatCats = todoBy.size ? h('div', {}, h('label', {}, 'Kategori yang dikirim ke chat AI'),
    h('p', { class: 'mut' }, 'Sama dengan pilihan di tab Translate. Hanya teks belum selesai di kategori yang dicentang yang masuk ke bagian.'),
    catBox, h('div', { class: 'row' },
      h('button', { onclick: () => { catSel.set = new Set(todoBy.keys()); catBox.querySelectorAll('input').forEach((i) => { i.checked = true; }); } }, 'Pilih semua'),
      h('button', { onclick: () => { catSel.set = new Set(); catBox.querySelectorAll('input').forEach((i) => { i.checked = false; }); } }, 'Kosongkan'))) : '';
  if (todoBy.size) catBox.replaceChildren(...[...todoBy].sort((a, b) => b[1] - a[1]).map(([k, c]) => h('label', { class: 'row' },
    h('input', { type: 'checkbox', ...(catSel.set.has(k) ? { checked: '' } : {}), onchange: (e) => { e.target.checked ? catSel.set.add(k) : catSel.set.delete(k); } }), ` ${k} (${c})`)));
  // Entri yang posisinya tidak cocok: tampilkan peringatan saja
  const warnCard = (r) => {
    if (!r.bad?.length) return '';
    return card(h('h2', {}, `${r.bad.length} teks dilewati`),
      h('p', { class: 'mut' }, 'Posisinya tidak cocok dengan file asli proyek sekarang, jadi teks ini tetap asli di patch. Teks lainnya tetap ikut diekspor.'),
      r.warnings.slice(0, 10).map((x) => h('p', { class: 'mut' }, x)), r.warnings.length > 10 ? h('p', { class: 'mut' }, `…dan ${r.warnings.length - 10} lainnya (lengkap di patch-report.txt)`) : '');
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
        const dlName = await patchFileName(p);
        const risky = (await dbQuery('entries', 'projectId', p.id)).filter((e) => (e.status === 'done' || e.status === 'edited') && codeDiff(e));
        out.replaceChildren(card(h('h2', {}, 'Patch siap'), h('p', { class: 'mut' }, r.report),
          risky.length ? h('p', { class: 'err' }, `Peringatan: ${risky.length} teks kodenya berbeda dari aslinya (id ${risky.slice(0, 8).map((e) => e.id).join(', ')}${risky.length > 8 ? ', …' : ''}). Buka Review, filter "Kode berubah (audit)", perbaiki, lalu buat patch ulang`) : '',
          h('a', { class: 'file', href: exportUrl, download: dlName }, 'Unduh zip'),
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
  let chatUrls = [];
  const chatOut = h('div'), chatMsg = h('p', { class: 'mut' }), perPart = h('input', { type: 'number', value: '150', min: '10', max: '100000' }), perChars = h('input', { type: 'number', value: '6000', min: '1000', max: '1000000' });
  const paste = h('textarea', { rows: '5', spellcheck: 'false', placeholder: 'Tempel balasan AI di sini…' });
  const fmtIds = (a) => (a.length ? ` (id ${a.slice(0, 8).join(', ')}${a.length > 8 ? ', …' : ''})` : '');
  const prepare = async () => {
    chatUrls.forEach((u) => URL.revokeObjectURL(u)); chatUrls = [];
    // Pakai pilihan kategori dari tab Translate (kalau sudah dibuka); teks yang sudah selesai tidak terpengaruh.
    const allEntries = await dbQuery('entries', 'projectId', p.id); await skipKeyOnly(allEntries);
    const sel = catSel.pid === p.id && catSel.set ? catSel.set : null;
    const parts = buildChatParts(p, sel ? allEntries.filter((e) => !TODO.has(e.status) || sel.has(e.category)) : allEntries, await loadConfig(), Number(perPart.value) || 150, Number(perChars.value) || 6000);
    chatMsg.className = 'mut'; chatMsg.textContent = '';
    if (!parts.length) { chatOut.replaceChildren(h('p', { class: 'mut' }, todoBy.size && !catSel.set.size ? 'Pilih minimal satu kategori dulu.' : 'Tidak ada teks yang belum selesai.')); return; }
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
        `Masih ada kata Portugis/Spanyol (ditolak): ${r.foreign.length}${fmtIds(r.foreign)}`, `Terjemahan kosong: ${r.empty.length}${fmtIds(r.empty)}`, `id tidak dikenal: ${r.unknown.length}${fmtIds(r.unknown)}`, `Duplikat diabaikan: ${r.dup}`, `Baris tanpa nomor di awal atau akhir diabaikan: ${ignored}`].join('\n');
      return r.updates.length > 0;
    } catch (e) { chatMsg.className = 'err'; chatMsg.textContent = e.message; return false; }
  };
  return [card(h('h2', {}, 'Ekspor'), h('p', { class: 'mut' }, `Siap diekspor: ${ready}\nBelum diterjemahkan (tetap asli): ${pend}\nError (tetap asli): ${err}`), btn), out,
    fold('Terjemah lewat chat AI', h('p', { class: 'mut' }, 'Untuk menerjemahkan di aplikasi AI lain tanpa API. Teks yang belum selesai dipecah jadi bagian-bagian berisi instruksi, gaya, dan glosarium. Kirim satu bagian ke AI (tempel atau unggah file), lalu tempel balasannya di bawah. Pilih kategori yang mau dikirim di bawah (sama dengan pilihan di tab Translate). Bagian dihitung ulang dari teks yang belum selesai tiap kali kamu menyiapkannya.'),
      chatCats, h('label', {}, 'Teks per bagian'), perPart, h('label', {}, 'Maks karakter per bagian'), perChars, h('button', { class: 'pri', onclick: prepare }, 'Siapkan bagian'), chatOut,
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
  let nodes;
  try { nodes = await (routes[name] || viewProyek)(); }
  catch (e) { nodes = [card(h('p', { class: 'err' }, e.message))]; }
  app().style.removeProperty('--bar-h');
  app().replaceChildren(...nodes);
  paintProject();
}
/** Nama proyek aktif di header, supaya jelas yang dikerjakan di tab mana pun. */
async function paintProject() {
  const el = document.getElementById('proj'); if (!el) return;
  try { const p = await currentProject(); el.textContent = p ? `${p.engine}, ${p.total.toLocaleString('id-ID')} teks` : 'Belum ada proyek'; } catch { el.textContent = ''; }
}
if (!globalThis.__RPGTL_TEST__) {
  addEventListener('hashchange', render);
  render();
  // Keyboard layar terbuka: sembunyikan nav dan bar aksi supaya tidak melayang di atas kolom isian.
  if (window.visualViewport) visualViewport.addEventListener('resize', () => document.body.classList.toggle('kb', visualViewport.scale <= 1.01 && visualViewport.height < innerHeight * 0.75));
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}