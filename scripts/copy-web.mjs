import { cp, mkdir, rm } from 'node:fs/promises';

const out = new URL('../www/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of ['index.html', 'app.css', 'app.js', 'native.js', 'import-worker.js', 'lang-vocab.js', 'manifest.json', 'sw.js']) {
  await cp(new URL('../' + f, import.meta.url), new URL(f, out));
}
console.log('www/ siap');
