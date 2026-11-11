import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';

globalThis.__RPGTL_TEST__ = true;
const messages = [];
globalThis.self = { postMessage: (m) => messages.push(m) };
await import('../import-worker.js');

const mk = (path, body) => ({ file: new File([JSON.stringify(body)], path.split('/').pop(), { type: 'application/json' }), path });
const files = [
  mk('data/System.json', { gameTitle: 'テストゲーム', terms: { basic: ['経験値', 'レベル'] } }),
  mk('data/Map001.json', { events: [null, { pages: [{ list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2] }, { code: 401, indent: 0, parameters: ['こんにちは、世界'] }] }] }] }),
];

await globalThis.self.onmessage({ data: { test: true, kind: 'project', files, src: 'ja', allow: '' } });
const done = messages.find((m) => m.type === 'done');
const err = messages.find((m) => m.type === 'error');
assert.ok(!err, err?.message);
assert.ok(done, 'worker tidak mengirim hasil');

const app = await import('../app.js');
const ents = await app.dbQuery('entries', 'projectId', done.project.id);
assert.ok(done.project.total > 0, 'tidak ada teks diekstrak');
assert.equal(ents.length, done.project.total, 'jumlah IndexedDB tidak sama dengan total');
assert.ok(ents.some((e) => e.original.includes('こんにちは')), 'dialog tidak ikut');
await app.deleteProject(done.project.id);
console.log(`PASS total=${done.project.total} db=${ents.length} files=${done.project.files}`);
