// Impor berjalan di worker supaya UI tidak tersendat. Memakai modul app.js yang sama.
self.onmessage = async (e) => {
  const { test, kind, files, src, allow } = e.data || {};
  const post = (m) => self.postMessage(m);
  try {
    if (test) globalThis.__RPGTL_TEST__ = true;
    const mod = await import('./app.js');
    const onProgress = (text, done, total) => post({ type: 'progress', text, done, total });
    const project = kind === 'lang'
      ? await mod.importLangFiles(files, src, onProgress)
      : await mod.importProject(files, src, onProgress, { allow: allow || '' });
    post({ type: 'done', project });
  } catch (err) {
    post({ type: 'error', message: err?.message || String(err) });
  }
};
