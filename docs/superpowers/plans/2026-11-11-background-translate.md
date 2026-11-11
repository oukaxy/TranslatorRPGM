# Background Translate + Smooth Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Terjemahan tetap berjalan saat app Android di latar belakang/layar mati, dan impor tidak membekukan UI.

**Architecture:** Impor dipindah ke Web Worker yang meng-import modul `app.js` yang sama. Android dibungkus Capacitor dengan plugin lokal foreground service; versi web tidak memakai jalur native.

**Tech Stack:** ES modules tanpa build step, Web Worker, Capacitor 8 (Android), Kotlin foreground service.

**Spec:** `docs/superpowers/specs/2026-11-11-background-translate-design.md`

## Global Constraints

- Versi web/PWA harus tetap berfungsi tanpa dependensi build.
- Tidak ada backend; API key tetap di perangkat.
- Android saja; sideload APK.
- Proses tidak harus bertahan setelah swipe-away/Force stop.
- Java/Android SDK tidak tersedia di lingkungan kerja ini; build APK diverifikasi di mesin dengan SDK.

## Review Focus

- Folder berisi ribuan file: daftar file dan progres harus tetap terlihat dan UI responsif.
- Worker gagal (zip rusak, DB terkunci): pesan error tampil dan tidak meninggalkan UI macet.
- App di latar belakang saat layar mati: progres harus naik, bukan berhenti.
- Stop dari notifikasi: proses berhenti dan hasil batch terakhir tetap tersimpan.
- Versi web: tidak ada pemanggilan plugin native saat `Capacitor` tidak ada.

---

### Task 1: Modul aman untuk Worker

**Files:**
- Modify: `app.js` (bootstrap guard, `collectSources`)
- Test: `test/worker-selfcheck.html` (baru)

**Interfaces:**
- Produces: `collectSources(files)` menerima `File` atau `{ file: File, path: string }`.

- [x] Ubah guard bootstrap menjadi `if (!globalThis.__RPGTL_TEST__ && typeof document !== 'undefined')`.
- [x] Normalisasi input di `collectSources` menjadi `{ file, path }`; semua pemakaian memakai `f.file` dan `f.path`.
- [x] Verifikasi: `node --check app.js`.

### Task 2: Worker impor + wiring UI

**Files:**
- Create: `import-worker.js`
- Modify: `app.js` (`viewProyek` memanggil worker), `sw.js` (cache + VERSION)
- Test: `test/worker-selfcheck.html`

**Interfaces:**
- `import-worker.js` menerima `{ test, kind: 'project'|'lang', files, src, allow }`; membalas `{ type: 'progress'|'done'|'error', ... }`.

- [x] Tulis `import-worker.js` yang set `__RPGTL_TEST__` bila diminta, lalu dynamic import `./app.js`.
- [x] Tambah helper `runImportWorker(kind, files, src, allow, onProgress)` di `viewProyek`, pakai di dua jalur impor.
- [x] Tambah `import-worker.js` dan `native.js` ke `SHELL`, naikkan `VERSION` di `sw.js`.
- [ ] Verifikasi: self-check di browser menghasilkan PASS. (diblokir: WebView devtools socket tidak tersedia; diganti uji Node `npm run test:worker` yang PASS)

### Task 3: Scaffold Capacitor

**Files:**
- Create: `package.json`, `capacitor.config.json`, `scripts/copy-web.mjs`, `.gitignore`
- Create: `www/` hanya hasil copy (tidak disunting)

- [x] `package.json`: scripts `copy:web`, `sync:android`, deps `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`.
- [x] `capacitor.config.json`: `appId`, `appName`, `webDir: "www"`, `android.allowMixedContent: false`.
- [x] `scripts/copy-web.mjs`: salin `index.html`, `app.css`, `app.js`, `native.js`, `import-worker.js`, `lang-vocab.js`, `manifest.json`, `sw.js`.
- [x] Verifikasi: `npm run copy:web` lalu daftar isi `www/`.

### Task 4: Foreground service + notifikasi

**Files:**
- Create: `android/app/src/main/java/id/rpgtranslator/app/KeepAlivePlugin.kt`, `KeepAliveService.kt`, `MainActivity.java`, `AndroidManifest.xml`, `native.js` (dipilih: langsung di proyek hasil `cap add`)
- Modify: `app.js` (start/stop service, progres notifikasi)

**Interfaces:**
- JS: `KeepAlive.start({title, body, progress})`, `update(...)`, `stop()`; event `stopClicked`.

- [x] Tulis plugin Kotlin: start/update/stop, `dataSync`, `PARTIAL_WAKE_LOCK`, `resumeTimers`, notifikasi dengan aksi Stop.
- [x] Tulis `native.js` yang memakai `registerPlugin` bila ada, dan no-op di web (termasuk deteksi `document` agar aman di Worker).
- [x] `startJob`: mulai service; kirim update maksimal tiap 5 detik; event stop → `job.ctl.abort()`; hentikan service di akhir.
- [ ] Verifikasi: build di mesin ber-SDK; uji Home/layar mati 10 menit. (diblokir: JDK/Android SDK tidak ada di lingkungan ini)

### Task 5: Ekstra Android (SAF, intent, back, baterai)

**Files:**
- Modify: `native/android/KeepAlivePlugin.kt`, `manifest-additions.xml`, `app.js`

- [x] Tombol back hardware mengikuti router.
- [x] Prompt pengecualian optimasi baterai.
- [x] Pemilih folder SAF untuk impor folder di APK.
- [x] Simpan ekspor/cadangan lewat SAF.
- [ ] Intent filter `.zip`/`.rgss3a`/`.json`. (ditunda: butuh penyalinan berkas native + alur impor otomatis; belum masuk APK)
- [ ] Verifikasi: build + uji manual. (diblokir: JDK/Android SDK tidak ada di lingkungan ini)

### Task 6: Dokumentasi

**Files:**
- Modify: `README.md`

- [x] Bagian "Versi Android (APK)": cara build, izin, batasan, cara pindah data dari PWA.
