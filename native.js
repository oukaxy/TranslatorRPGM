// Jembatan Android (Capacitor). Di web semua fungsi di sini menjadi no-op.
const Cap = globalThis.Capacitor;
const plugin = Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform() && Cap.registerPlugin ? Cap.registerPlugin('KeepAlive') : null;
export const native = !!plugin;

let stopCb = null, lastError = '';
const fail = (e) => { lastError = String(e?.message || e); throw e; };
if (plugin) plugin.addListener('stopClicked', () => stopCb?.()).catch(() => {});

/** Status jembatan native untuk ditampilkan di Pengaturan (diagnosa). */
export function nativeDiag() {
  return {
    capacitor: !!Cap,
    native,
    plugin: !!plugin,
    platform: (Cap && Cap.getPlatform && Cap.getPlatform()) || 'web',
    available: !!(Cap && Cap.isPluginAvailable && Cap.isPluginAvailable('KeepAlive')),
    error: lastError,
  };
}

const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Simpan Blob ke folder pilihan lewat SAF; di web jatuh ke unduhan biasa. */
export async function saveBlob(blob, name) {
  if (!plugin) {
    const a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
    return true;
  }
  const r = await plugin.saveStart({ name, mime: blob.type || 'application/octet-stream' });
  if (!r || r.cancelled || !r.token) return false;
  const buf = new Uint8Array(await blob.arrayBuffer()), CH = 256 * 1024;
  for (let i = 0; i < buf.length; i += CH) await plugin.saveChunk({ token: r.token, data: b64(buf.subarray(i, i + CH)) });
  await plugin.saveEnd({ token: r.token });
  return true;
}

export const KeepAlive = {
  start: (o) => (plugin ? plugin.start(o).catch(fail) : Promise.reject(new Error('Plugin KeepAlive tidak tersedia'))),
  update: (o) => (plugin ? plugin.update(o).catch((e) => { lastError = String(e?.message || e); }) : Promise.resolve()),
  stop: () => (plugin ? plugin.stop().catch(() => {}) : Promise.resolve()),
  onStop: (cb) => { stopCb = cb; },
  requestNotifications: () => plugin?.requestNotifications().catch(() => {}),
  requestBattery: () => plugin?.requestIgnoreBatteryOptimizations().catch(() => {}),
  pickFolder: async () => {
    if (!plugin) return [];
    const r = await plugin.pickFolder();
    return (r?.files || []).map((f) => ({ path: f.path, url: globalThis.Capacitor.convertFileSrc(f.uri) }));
  },
};

// Unduhan berbasis blob (patch, cadangan, Game.rgss3a) dialihkan ke pemilih file Android.
if (plugin && typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a[download]') : null;
    if (!a || !a.href.startsWith('blob:')) return;
    e.preventDefault();
    fetch(a.href).then((r) => r.blob()).then((b) => saveBlob(b, a.download || 'berkas')).catch(() => {});
  }, true);
}
