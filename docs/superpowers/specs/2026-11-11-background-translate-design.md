# Terjemahan latar belakang Android + impor lancar

Tanggal: 2026-11-11
Status: disetujui (percakapan)

## Intent

Pengguna ingin terjemahan terus berjalan saat aplikasi berada di latar belakang:
pindah ke aplikasi lain, menekan Home, dan saat layar mati. Android saja. Selain itu
impor file harus lebih stabil dan tidak membuat UI tersendat.

## Tujuan

- Terjemahan berlanjut saat app tidak terlihat dan layar mati.
- Progres terlihat dari notifikasi, dengan tombol Stop.
- Impor folder/zip tidak membekukan UI dan progresnya terlihat.
- Versi web/PWA tetap berfungsi penuh seperti sekarang.

## Non-goal

- iOS.
- Terjemahan tetap jalan setelah app di-swipe dari Recent atau Force stop.
- Port mesin terjemahan ke Kotlin (hanya jika wrapper terbukti gagal).
- Backend/server untuk antrean terjemahan.

## Batasan

- Web murni tidak bisa menjalankan proses panjang di latar belakang; Android membekukan
  WebView/tab yang tidak terlihat.
- Foreground service Android wajib menampilkan notifikasi; Android 14 mewajibkan tipe
  service, Android 15 membatasi `dataSync` sekitar 6 jam per 24 jam.
- Pembunuh background OEM (Xiaomi/Oppo/Samsung) bisa menghentikan service; perlu
  pengecualian optimasi baterai.
- `webkitdirectory` tidak didukung di WebView Android, jadi impor folder butuh pemilih
  folder native (SAF) di APK.

## Pendekatan yang dipertimbangkan

1. **Web murni + worker.** Impor lebih lancar, tetapi latar belakang tetap tidak bisa.
   Ditolak untuk kebutuhan utama, tetap dipakai untuk bagian impor.
2. **Capacitor + foreground service yang menjaga WebView tetap hidup.** Kode aplikasi
   hampir tidak berubah. Dipilih.
3. **Port native penuh atau server/Cloudflare queue.** Paling andal (tahan app ditutup),
   tetapi butuh port besar atau backend + penyimpanan API key di server. Ditunda; hanya
   dipakai bila (2) gagal di perangkat pengguna.

## Desain

### Impor (berlaku untuk web dan APK)

- Modul `app.js` sudah memisahkan pipeline dari UI. Bootstrap diubah agar tidak jalan di
  lingkungan tanpa `document`, sehingga worker bisa meng-import modul yang sama.
- Worker modul `import-worker.js` menjalankan `importProject`/`importLangFiles` di luar
  main thread: baca zip, dekompresi, `JSON.parse`, ekstraksi, SHA-256, dan tulis
  IndexedDB. Progres dikirim lewat `postMessage`.
- `collectSources` menerima entri `{ file, path }` karena `webkitRelativePath` tidak ikut
  ter-clone ke worker.
- `sw.js` menambahkan worker ke cache shell dan menaikkan `VERSION`.

### Shell Android (Capacitor, sideload)

- Aset web disalin ke `www/` lewat skrip Node; sumber kebenaran tetap file di root.
- Plugin lokal `KeepAlive` (Kotlin):
  - foreground service tipe `dataSync` + notifikasi progres dan tombol Stop;
  - `PARTIAL_WAKE_LOCK` agar CPU tetap hidup saat layar mati;
  - memastikan timer WebView tetap berjalan saat activity tidak terlihat.
- `app.js` hanya memakai plugin saat `Capacitor.isNativePlatform()`; di web semua jalur
  native tidak aktif.
- Impor folder di APK memakai pemilih folder native (SAF); zip dan `.rgss3a` tetap lewat
  input file biasa.
- Ekspor dan cadangan disimpan lewat pemilih folder/dokumen Android.
- Intent filter untuk membuka `.zip`, `.rgss3a`, dan `.json` dari file manager.
- Tombol back hardware mengikuti navigasi tab.
- Prompt pengecualian optimasi baterai dan panduan autostart.

### Data

Data PWA lama tidak pindah otomatis. Pengguna memakai Cadangan zip di PWA lalu Pulihkan
di APK.

## Risiko

- Timer WebView bisa tetap dibatasi saat layar mati pada sebagian perangkat. Uji di
  perangkat nyata; bila gagal, naik ke opsi 3.
- Swipe-away/Force stop menghentikan proses; hasil per batch sudah checkpoint dan bisa
  dilanjutkan.
- Dua jalur rilis (web dan APK) perlu dijaga; `www/` hanya hasil copy.
- APK perlu signing dan pembaruan manual; sideload dipilih, bukan Play Store.

## Verifikasi

- Impor zip besar: UI tetap responsif, progres naik, jumlah entri sama.
- Mulai terjemahan, tekan Home, pindah app, matikan layar 10 menit: jumlah selesai naik.
- Tutup dari Recent lalu buka: proses berhenti, tombol Lanjutkan meneruskan tanpa
  kehilangan hasil.
- Notifikasi progres dan Stop berfungsi.
- Versi web tetap memuat, mengimpor, menerjemahkan, dan mengekspor.
