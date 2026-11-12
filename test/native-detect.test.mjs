import assert from 'node:assert/strict';

let listener = null;
const calls = [];
const fake = {
  addListener: (event, cb) => { calls.push(event); listener = cb; return { remove() {} }; },
  start: async (o) => { calls.push(['start', o]); return {}; },
  update: async (o) => { calls.push(['update', o]); return {}; },
  stop: async () => { calls.push(['stop']); return {}; },
  requestNotifications: async () => ({ granted: true }),
  requestIgnoreBatteryOptimizations: async () => ({}),
};

globalThis.Capacitor = {
  Plugins: { KeepAlive: fake },
  isPluginAvailable: (n) => n === 'KeepAlive',
  getPlatform: () => 'android',
};

const { native, KeepAlive, nativeDiag } = await import('../native.js');

assert.equal(native, true, 'plugin dari Capacitor.Plugins harus terdeteksi native');
assert.deepEqual(calls, ['stopClicked'], 'listener Stop harus didaftarkan sekali');
assert.equal(nativeDiag().available, true);

let stopped = false;
KeepAlive.onStop(() => { stopped = true; });
listener();
assert.equal(stopped, true, 'event stopClicked harus memanggil callback');

await KeepAlive.start({ title: 'Tes', progress: 0 });
await KeepAlive.update({ progress: 50 });
await KeepAlive.stop();
assert.deepEqual(calls.slice(1), [['start', { title: 'Tes', progress: 0 }], ['update', { progress: 50 }], ['stop']]);

assert.deepEqual(await KeepAlive.requestNotifications(), { granted: true });

console.log('PASS native-detect');
