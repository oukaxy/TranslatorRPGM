// Pembaca RAR tanpa dependensi, antarmukanya sengaja mirip readZip: { entries, read(e) }.
// Didukung: RAR5 (disimpan maupun terkompresi, termasuk arsip solid dan filter E8/E8E9/ARM/Delta) dan RAR4 (hanya disimpan/tanpa kompresi).
// Tidak didukung: arsip terenkripsi, multi-volume, RAR4 terkompresi (PPMd/VM), SFX. Setiap file diverifikasi dengan CRC-32 setelah diekstrak.

export class RarError extends Error {}
const MSG = {
  bad: 'RAR tidak bisa dibaca atau rusak. Ekstrak dulu lalu pilih folder data',
  enc: 'RAR berpassword tidak didukung. Ekstrak dulu lalu pilih folder data',
  vol: 'RAR multi-volume tidak didukung. Ekstrak dulu lalu pilih folder data',
  old: 'RAR versi lama (RAR4) dengan kompresi belum didukung. Simpan ulang sebagai RAR5 atau zip, atau ekstrak dulu lalu pilih folder data',
  big: 'Kamus kompresi RAR terlalu besar untuk browser. Ekstrak dulu lalu pilih folder data',
  crc: 'Isi RAR tidak cocok dengan CRC-nya (rusak atau gagal dibuka). Ekstrak dulu lalu pilih folder data',
};
const fail = (k) => { throw new RarError(MSG[k]); };

const CRC_T = new Uint32Array(256);
for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[i] = c >>> 0; }
export function crc32(u8, c = 0) {
  c = ~c;
  for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
/** vint RAR5: 7 bit per byte, little-endian. Mengembalikan [nilai, indeks berikutnya]. */
function vint(b, o) {
  let v = 0, m = 1;
  for (let i = 0; i < 10; i++) {
    if (o >= b.length) fail('bad');
    const x = b[o++]; v += (x & 127) * m; m *= 128;
    if (!(x & 128)) return [v, o];
  }
  return fail('bad');
}
const SIG = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07];
const startsWith = (b, a) => a.every((x, i) => b[i] === x);
/** 'rar' bila berkas diawali tanda tangan RAR, 'zip' bila PK, selain itu null. */
export function sniffArchive(head) {
  if (head.length >= 7 && startsWith(head, SIG) && (head[6] === 0 || (head[6] === 1 && head[7] === 0))) return 'rar';
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) return 'zip';
  return null;
}

/** Pembaca berpenyangga: mengambil Blob per potongan besar supaya ratusan header kecil tidak membuat ratusan slice. */
function makeSrc(blob) {
  let off = 0, buf = new Uint8Array(0);
  return async (pos, n) => {
    n = Math.max(0, Math.min(n, blob.size - pos));
    if (pos >= off && pos + n <= off + buf.length) return buf.subarray(pos - off, pos - off + n);
    buf = new Uint8Array(await blob.slice(pos, Math.min(blob.size, pos + Math.max(n, 1 << 18))).arrayBuffer()); off = pos;
    return buf.subarray(0, n);
  };
}

// ===== Kontainer RAR5 =====
async function parse5(src, size) {
  const files = []; let pos = 8;
  while (pos + 8 <= size) {
    const head = await src(pos, 16);
    const want = u32(head, 0), [hsz, p] = vint(head, 4);
    if (hsz < 2 || pos + p + hsz > size) fail('bad');
    const body = await src(pos + 4, p - 4 + hsz);
    if (crc32(body) !== want) fail('bad');
    const h = body.subarray(p - 4);
    let q = 0; const V = () => { const r = vint(h, q); q = r[1]; return r[0]; };
    const type = V(), fl = V(); let extra = 0, dsz = 0;
    if (fl & 1) extra = V();
    if (fl & 2) dsz = V();
    const dataAt = pos + p + hsz;
    if (type === 4) fail('enc');
    if (type === 1) { if (V() & 1) fail('vol'); }
    if (type === 2 || type === 3) {
      if (fl & 0x18) fail('vol');
      const ff = V(), usize = V(); V();
      if (ff & 2) q += 4;
      let crc = null; if (ff & 4) { crc = u32(h, q); q += 4; }
      const ci = V(); V();
      const nl = V(), name = new TextDecoder().decode(h.subarray(q, q + nl)); q += nl;
      let skip = false, encd = false;
      for (let x = h.length - extra; x < h.length;) {
        const sz = vint(h, x); const end = sz[1] + sz[0], t = vint(h, sz[1])[0];
        if (t === 1) encd = true; else if (t === 5) skip = true;
        x = end;
      }
      if (type === 2 && !(ff & 1) && !skip) {
        if (encd) fail('enc');
        if (ff & 8) fail('bad');
        files.push({ name, size: usize, csize: dsz, off: dataAt, crc, method: (ci >> 7) & 7, solid: !!(ci & 64), dict: 0x20000 * 2 ** ((ci >> 10) & 15), ver: ci & 63 });
      }
    }
    pos = dataAt + dsz;
    if (type === 5) break;
  }
  return files;
}

// ===== Kontainer RAR4 =====
/** Nama berkode Unicode ala RAR: bagian ASCII, byte nol, lalu aliran kode yang menambal bagian ASCII itu. */
function decodeName4(raw) {
  const z = raw.indexOf(0);
  if (z < 0) return raw;
  const asc = raw.subarray(0, z), enc = raw.subarray(z + 1), out = [];
  let ep = 0, dp = 0, hi = enc[ep++], fb = 0, fl = 0;
  while (ep < enc.length) {
    if (!fb) { fl = enc[ep++]; fb = 8; }
    switch (fl >> 6) {
      case 0: out.push(enc[ep++]); dp++; break;
      case 1: out.push(enc[ep++] + (hi << 8)); dp++; break;
      case 2: out.push(enc[ep] + (enc[ep + 1] << 8)); ep += 2; dp++; break;
      default: {
        let n = enc[ep++];
        if (n & 0x80) { const c = enc[ep++]; for (n = (n & 0x7f) + 2; n > 0 && dp < asc.length; n--, dp++) out.push(((asc[dp] + c) & 0xff) + (hi << 8)); }
        else for (n += 2; n > 0 && dp < asc.length; n--, dp++) out.push(asc[dp]);
      }
    }
    fl = (fl << 2) & 0xff; fb -= 2;
  }
  let s = ''; for (const c of out) s += String.fromCharCode(c);
  return s;
}
async function parse4(src, size) {
  const files = []; let pos = 7;
  while (pos + 7 <= size) {
    const h = await src(pos, 64);
    if (h.length < 7) break;
    const type = h[2], fl = u16(h, 3), hs = u16(h, 5);
    if (hs < 7) fail('bad');
    let add = 0;
    if (type === 0x73) { if (fl & 1) fail('vol'); if (fl & 0x80) fail('enc'); }
    if (type === 0x74) {
      const big = !!(fl & 0x100), nl = u16(h, 26);
      const full = await src(pos, hs), pk = u32(full, 7) + (big ? u32(full, 32) * 2 ** 32 : 0), us = u32(full, 11) + (big ? u32(full, 36) * 2 ** 32 : 0);
      if (fl & 4) fail('enc');
      if (fl & 3) fail('vol');
      const raw = full.slice(big ? 40 : 32, (big ? 40 : 32) + nl);
      let name;
      if (fl & 0x200) name = decodeName4(raw);
      else { try { name = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { name = new TextDecoder('windows-1252').decode(raw); } }
      if ((fl & 0xe0) !== 0xe0) files.push({ name: name.replace(/\\/g, '/'), size: us, csize: pk, off: pos + hs, crc: u32(full, 16), method: full[25] - 0x30, solid: !!(fl & 0x10), dict: 0, ver: 4 });
      add = pk;
    } else if (fl & 0x8000) add = u32(h, 7);
    pos += hs + add;
    if (type === 0x7b) break;
  }
  return files;
}

// ===== Dekompresi RAR5 =====
const NC = 306, DC = 64, LDC = 16, RC = 44, BC = 20, TABLE = NC + DC + LDC + RC;

/** Tabel Huffman kanonik (panjang naik, lalu nomor simbol naik), disimpan sebagai tabel cari 15 bit: simbol << 4 | panjang. */
function makeTable(lens, off, n) {
  const cnt = new Uint16Array(16), tab = new Uint16Array(1 << 15);
  for (let i = 0; i < n; i++) cnt[lens[off + i]]++;
  cnt[0] = 0;
  const next = new Uint32Array(17); let code = 0;
  for (let l = 1; l <= 15; l++) { code = (code + cnt[l - 1]) << 1; next[l] = code; }
  for (let i = 0; i < n; i++) {
    const l = lens[off + i]; if (!l) continue;
    const c = next[l]++; if (c >= 1 << l) fail('bad');
    const lo = c << (15 - l), hi = (c + 1) << (15 - l), v = (i << 4) | l;
    for (let k = lo; k < hi; k++) tab[k] = v;
  }
  return tab;
}

function applyFilter(f, out) {
  const d = out.subarray(f.start, f.start + f.len), n = d.length;
  if (f.type === 1 || f.type === 2) {
    const cmp2 = f.type === 2 ? 0xe9 : 0xe8, FS = 0x1000000;
    for (let cur = 0; cur + 4 < n;) {
      const b = d[cur++];
      if (b === 0xe8 || b === cmp2) {
        const off = (cur + f.start) % FS, addr = u32(d, cur);
        let w = -1;
        if (addr & 0x80000000) { if (!((addr + off) & 0x80000000)) w = (addr + FS) >>> 0; }
        else if ((addr - FS) & 0x80000000) w = (addr - off) >>> 0;
        if (w >= 0) { d[cur] = w; d[cur + 1] = w >>> 8; d[cur + 2] = w >>> 16; d[cur + 3] = w >>> 24; }
        cur += 4;
      }
    }
  } else if (f.type === 3) {
    for (let cur = 0; cur + 3 < n; cur += 4) {
      if (d[cur + 3] === 0xeb) {
        let o = d[cur] + d[cur + 1] * 0x100 + d[cur + 2] * 0x10000;
        o = (o - Math.floor((f.start + cur) / 4)) & 0xffffff;
        d[cur] = o; d[cur + 1] = o >>> 8; d[cur + 2] = o >>> 16;
      }
    }
  } else if (f.type === 0) {
    const src = d.slice(); let sp = 0;
    for (let ch = 0; ch < f.ch; ch++) { let prev = 0; for (let dp = ch; dp < n; dp += f.ch) { prev = (prev - src[sp++]) & 255; d[dp] = prev; } }
  } else fail('bad');
}

class Unpack5 {
  constructor(winSize) { this.win = new Uint8Array(winSize); this.mask = winSize - 1; this.reset(); }
  reset() { this.wp = 0; this.old = [0, 0, 0, 0]; this.lastLen = 0; this.tabs = null; }
  /** Dekompres satu file. out=false: hanya memajukan jendela (arsip solid), hasil dibuang. */
  run(buf, usize, wantOut) {
    const win = this.win, mask = this.mask, W = win.length, old = this.old;
    const out = wantOut ? new Uint8Array(usize) : null, filters = [];
    let bp = 0, op = 0, wp = this.wp, lastLen = this.lastLen, tabs = this.tabs, blockEnd = -1, last = false;
    const peek = (n) => { const i = bp >>> 3; return (((((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) << (bp & 7)) >>> 0) >>> (32 - n)); };
    const bits = (n) => { if (n > 16) { const a = bits(n - 16); return a * 65536 + bits(16); } if (!n) return 0; const v = peek(n); bp += n; return v; };
    const sym = (t) => { const e = t[peek(15)], l = e & 15; if (!l) fail('bad'); bp += l; return e >>> 4; };
    const put = (b) => { win[wp & mask] = b; wp++; if (op >= usize) fail('bad'); if (out) out[op] = b; op++; };
    const readTables = () => {
      const bl = new Uint8Array(BC);
      for (let i = 0; i < BC; i++) {
        const l = bits(4);
        if (l === 15) { let z = bits(4); if (!z) bl[i] = 15; else { z += 2; while (z-- > 0 && i < BC) bl[i++] = 0; i--; } } else bl[i] = l;
      }
      const bd = makeTable(bl, 0, BC), t = new Uint8Array(TABLE);
      for (let i = 0; i < TABLE;) {
        const n = sym(bd);
        if (n < 16) t[i++] = n;
        else {
          let c; if (n === 16 || n === 18) c = bits(3) + 3; else c = bits(7) + 11;
          if (n < 18) { if (!i) fail('bad'); while (c-- > 0 && i < TABLE) { t[i] = t[i - 1]; i++; } } else while (c-- > 0 && i < TABLE) t[i++] = 0;
        }
      }
      tabs = { ld: makeTable(t, 0, NC), dd: makeTable(t, NC, DC), ldd: makeTable(t, NC + DC, LDC), rd: makeTable(t, NC + DC + LDC, RC) };
    };
    const readBlock = () => {
      bp = (bp + 7) & ~7;
      if ((bp >>> 3) + 3 > buf.length) fail('bad');
      const fl = bits(8), sum = bits(8), bc = ((fl >> 3) & 3) + 1;
      if (bc === 4) fail('bad');
      let size = 0; for (let i = 0; i < bc; i++) size += bits(8) * 2 ** (8 * i);
      if (((0x5a ^ fl ^ size ^ (size >> 8) ^ (size >> 16)) & 255) !== sum) fail('bad');
      const start = bp >>> 3; blockEnd = (start + size - 1) * 8 + (fl & 7) + 1; last = !!(fl & 0x40);
      if (fl & 0x80) readTables(); else if (!tabs) fail('bad');
    };
    const slotLen = (s) => {
      if (s < 8) return 2 + s;
      const lb = (s >> 2) - 1; return 2 + ((4 | (s & 3)) << lb) + bits(lb);
    };
    const copy = (len, dist) => {
      if (dist < 1 || dist > wp || dist > W) fail('bad');
      for (let i = 0, s = wp - dist; i < len; i++) put(win[(s + i) & mask]);
    };
    const fdata = () => { const n = bits(2) + 1; let v = 0; for (let i = 0; i < n; i++) v += bits(8) * 2 ** (8 * i); return v; };
    readBlock();
    for (;;) {
      let done = false;
      while (bp >= blockEnd) { if (last) { done = true; break; } readBlock(); }
      if (done) break;
      if ((bp >>> 3) > buf.length + 8) fail('bad');
      const s = sym(tabs.ld);
      if (s < 256) { put(s); continue; }
      if (s >= 262) {
        let len = slotLen(s - 262);
        const ds = sym(tabs.dd); let dbits, dist = 1;
        if (ds < 4) { dbits = 0; dist += ds; } else { dbits = (ds >> 1) - 1; dist += (2 | (ds & 1)) * 2 ** dbits; }
        if (dbits >= 4) { if (dbits > 4) dist += bits(dbits - 4) * 16; dist += sym(tabs.ldd); } else if (dbits) dist += bits(dbits);
        if (dist > 0x100) { len++; if (dist > 0x2000) { len++; if (dist > 0x40000) len++; } }
        old[3] = old[2]; old[2] = old[1]; old[1] = old[0]; old[0] = dist; lastLen = len;
        copy(len, dist); continue;
      }
      if (s === 256) {
        const start = fdata(), len = fdata(), type = bits(3);
        filters.push({ start: op + start, len, type, ch: type === 0 ? bits(5) + 1 : 0 });
        continue;
      }
      if (s === 257) { if (lastLen) copy(lastLen, old[0]); continue; }
      const k = s - 258, dist = old[k];
      for (let i = k; i > 0; i--) old[i] = old[i - 1];
      old[0] = dist; lastLen = slotLen(sym(tabs.rd));
      copy(lastLen, dist);
    }
    if (op !== usize) fail('bad');
    this.wp = wp; this.lastLen = lastLen; this.tabs = tabs;
    if (out) for (const f of filters.sort((a, b) => a.start - b.start)) { if (f.start + f.len > usize) fail('bad'); applyFilter(f, out); }
    return out;
  }
}

const KEEP = /\.(json|js|rvdata2?|rxdata|txt|csv)$/i;
const pow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(n, 1 << 16)));

/**
 * Baca RAR (RAR4 atau RAR5) dari Blob/File.
 * keep: untuk arsip solid, file yang bukan target tapi harus didekompres di tengah jalan hanya disimpan bila namanya lolos tes ini.
 */
export async function readRar(blob, { keep = (name) => KEEP.test(name) } = {}) {
  const src = makeSrc(blob), sig = await src(0, 8);
  if (sniffArchive(sig) !== 'rar') fail('bad');
  const v5 = sig[6] === 1, entries = v5 ? await parse5(src, blob.size) : await parse4(src, blob.size);
  const comp = entries.filter((e) => e.method !== 0);
  comp.forEach((e, i) => { e.c = i; });
  let unp = null, st = null; const cache = new Map();
  const slice = async (e) => new Uint8Array(await blob.slice(e.off, e.off + e.csize).arrayBuffer());
  const check = (e, d) => { if (e.crc !== null && crc32(d) !== e.crc) fail('crc'); return d; };
  return {
    entries,
    async read(e) {
      if (e.method === 0) return check(e, await slice(e));
      if (!v5) fail('old');
      if (cache.has(e)) return cache.get(e);
      if (!unp) {
        const total = comp.reduce((a, x) => a + x.size, 0), dict = Math.max(...comp.map((x) => x.dict)), w = Math.min(dict, pow2(total));
        if (w > 2 ** 30) fail('big');
        unp = new Unpack5(w);
      }
      if (!st || st.c > e.c) { let k = e.c; while (k > 0 && comp[k].solid) k--; st = { c: k }; unp.reset(); }
      try {
        while (st.c <= e.c) {
          const x = comp[st.c]; if (!x.solid) unp.reset();
          const want = x === e || keep(x.name);
          const d = x.size ? unp.run(await slice(x), x.size, want) : new Uint8Array(0);
          st.c++;
          if (want) { check(x, d); cache.set(x, d); }
        }
      } catch (err) { st = null; throw err; }
      return cache.get(e);
    },
  };
}
