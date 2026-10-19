# RPG Maker Translator

Aplikasi web (PWA) untuk menerjemahkan game **RPG Maker MV, MZ, dan VX Ace** dengan LLM, langsung dari browser. Tanpa backend, tanpa build step, dan tanpa dependensi: semuanya HTML, CSS, dan JavaScript murni.

Antarmukanya berbahasa Indonesia dan dirancang mobile-first, jadi nyaman dipakai dari HP maupun desktop.

## Daftar Isi

- [Fitur](#fitur)
- [Engine dan Format yang Didukung](#engine-dan-format-yang-didukung)
- [Cara Pakai](#cara-pakai)
- [Pengaturan](#pengaturan)
- [Aksi Massal di Review](#aksi-massal-di-review)
- [Cadangan dan Pemulihan](#cadangan-dan-pemulihan)
- [Terjemah Lewat Chat AI (Tanpa API)](#terjemah-lewat-chat-ai-tanpa-api)
- [Keamanan Hasil Terjemahan](#keamanan-hasil-terjemahan)
- [Privasi dan Penyimpanan Data](#privasi-dan-penyimpanan-data)
- [Menjalankan Secara Lokal](#menjalankan-secara-lokal)
- [Deploy ke Vercel](#deploy-ke-vercel)
- [Struktur Proyek](#struktur-proyek)
- [Catatan Teknis](#catatan-teknis)
- [Lisensi](#lisensi)

## Fitur

- **Impor fleksibel**: folder `data`, file zip game, atau arsip terenkripsi `Game.rgss3a` (VX Ace) tanpa perlu diekstrak dulu.
- **Deteksi bahasa sumber**: mode Otomatis (Jepang/Inggris campur), Jepang, Inggris, atau Semua teks (bahasa apa pun). Teks yang sudah berbahasa Indonesia dikenali dan tidak diterjemahkan ulang.
- **Provider LLM bebas**: memakai format *chat completions* yang kompatibel dengan OpenAI. Bawaannya OpenRouter, tetapi base URL bisa diganti ke provider lain atau server lokal.
- **Terjemahan per batch** dengan konkurensi otomatis, retry dengan backoff, penghormatan terhadap `Retry-After`, batas waktu per request, dan lanjut dari titik berhenti.
- **Cache terjemahan** untuk teks yang sama persis, plus **perkiraan token dan biaya** sebelum mulai.
- **Pilih kategori** yang diterjemahkan (dialog, pilihan, nama, sistem, deskripsi item, dan seterusnya).
- **Gaya bahasa, catatan per karakter, dan glosarium** yang dikirim ke model di setiap batch.
- **Review**: edit manual, terjemah ulang per teks, filter status, pencarian (longgar, persis, atau regex), filter jenis kode escape, audit "kode berubah", dan ganti kata massal yang tidak menyentuh kode escape.
- **Filter temuan masalah**: "Kata asing Portugis/Spanyol" (semua status, termasuk hasil edit) dan "Belum diterjemahkan (sama dengan asli)" untuk teks Jepang atau bahasa lain yang lolos tanpa diterjemahkan.
- **Filter bahasa terjemahan**: di panel Filter, pilih *Masih ada Jepang/aksara asing*, *Ada kata Inggris (ketat)*, *Dominan Inggris*, *Spanyol/Portugis*, atau *Bahasa Indonesia* untuk menemukan kosakata yang terlewat. Memakai `lang-vocab.js`; bila ada salah tangkap atau yang lolos, tambah katanya di file itu.
- **Aksi massal untuk hasil filter**: terjemah ulang atau tandai untuk nanti, sekaligus untuk semua teks yang tampil, dengan konfirmasi dua ketukan.
- **Ekspor patch** berupa zip berisi file data yang sudah diterjemahkan, dilengkapi `patch-report.txt`.
- **Diff guard**: hasil ekspor diperiksa terhadap file asli sehingga hanya teks yang berubah. Bila ada yang janggal, ekspor dibatalkan.
- **Pemecahan baris otomatis** agar teks muat di kotak pesan (lebar bisa diatur, otomatis mati bila terdeteksi plugin message).
- **Cadangan dan pemulihan** proyek (terjemahan, file data asli, glosarium, gaya) dalam satu file zip, plus permintaan penyimpanan permanen ke browser.
- **Bisa offline** setelah dibuka sekali (service worker) dan **bisa dipasang** ke layar utama.

## Engine dan Format yang Didukung

| Engine | Sumber yang bisa diimpor | Format keluaran |
| --- | --- | --- |
| RPG Maker MV | Folder `data`, zip game | JSON |
| RPG Maker MZ | Folder `data`, zip game | JSON |
| RPG Maker VX Ace | Folder `Data`, zip game, `Game.rgss3a` | `.rvdata2` (bisa dibangun ulang menjadi `Game.rgss3a`) |

Engine dideteksi otomatis dari file yang ada (`rmmz_core.js`, `rpg_core.js`, atau file `.rvdata2`). Menyertakan `js/plugins.js` membantu aplikasi mendeteksi plugin message.

Teks yang diekstrak meliputi: dialog (Show Text), Scroll Text, pilihan, nama pembicara, nama aktor, istilah sistem, nama peta, dan field database (Actors, Classes, Skills, Items, Weapons, Armors, Enemies, States). Komentar, teks di dalam script, tag note, serta perintah dan parameter plugin bersifat opsional dan hanya diambil bila ada di *daftar aman*.

## Cara Pakai

Navigasi memakai empat tab di bawah layar, dengan Pengaturan di pojok kanan atas.

1. **Pengaturan**: isi base URL, API key, dan model. Tekan **Tes koneksi** untuk memastikan semuanya benar.
2. **Proyek**: pilih bahasa sumber, lalu impor folder data, zip game, atau `Game.rgss3a`. Ringkasan dan diagnostik impor muncul setelahnya.
3. **Translate**: pilih bahasa target (Indonesia atau Inggris) dan kategori, cek perkiraan biaya, lalu tekan **Mulai translate**. Proses bisa dihentikan dan dilanjutkan kapan saja.
4. **Review**: periksa hasil, edit, atau terjemah ulang. Gunakan filter *Error*, *Kode berubah*, *Kata asing*, dan *Belum diterjemahkan* untuk menemukan masalah lebih cepat. Saat ada filter aktif, kartu **Aksi untuk hasil filter** muncul (lihat [Aksi Massal di Review](#aksi-massal-di-review)).
5. **Ekspor**: tekan **Buat patch**, unduh zip, **backup folder data asli**, lalu timpa isinya dengan file di dalam zip. Untuk game VX Ace yang memakai `Game.rgss3a`, pilih arsip aslinya agar aplikasi membuat `Game.rgss3a` baru.

## Pengaturan

| Pengaturan | Keterangan | Bawaan |
| --- | --- | --- |
| Base URL | Endpoint API yang kompatibel dengan OpenAI. Harus `https`, kecuali `localhost` atau `127.0.0.1` | `https://openrouter.ai/api/v1` |
| API key | Hanya dikirim ke base URL di atas | kosong |
| Model | Nama model di provider | `google/gemini-2.5-flash` |
| Body tambahan JSON | Objek JSON yang digabung ke body request | kosong |
| Temperature | 0 sampai 2 | `0.3` |
| Atur kecepatan otomatis | Ukuran batch dan konkurensi diatur sendiri | aktif |
| Ukuran batch, batas karakter, konkurensi, jeda | Dipakai bila mode otomatis dimatikan | 30, 4000, 4, 100 ms |
| Batas waktu per request | Dalam detik | `120` |
| Lebar baris maks | Dengan face dan tanpa face (0 = mati) | 38 dan 48 |
| Harga token masuk/keluar | Per 1 juta token, untuk perkiraan biaya | 0 |
| Matikan mode berpikir | Khusus OpenRouter, agar lebih cepat | mati |
| Gaya bahasa | Instruksi gaya untuk model | santai ala dialog game |
| Catatan karakter | Format `nama: gaya bicara` | kosong |
| Glosarium | Format `sumber = terjemahan`, satu per baris | kosong |
| Daftar aman plugin | Menentukan perintah/parameter plugin yang boleh diterjemahkan | kosong |

**Daftar aman plugin** memakai tiga bentuk entri (satu per baris). Impor ulang proyek setelah mengubahnya:

```text
mz NamaPlugin.namaPerintah.namaArgumen
mv NamaPerintah
param NamaPlugin.namaParameter
```

Contoh glosarium dan catatan karakter:

```text
# Glosarium
アリス = Alice
ポーション = Ramuan

# Catatan karakter
アリス: sopan, pakai saya/Anda
バルト: preman, pakai gue/lo, kasar
```

## Aksi Massal di Review

Setelah memilih filter atau mencari sesuatu, kartu **Aksi untuk hasil filter** menampilkan dua tombol yang berlaku untuk **semua** teks di daftar (bukan hanya halaman yang terlihat). Keduanya memakai konfirmasi dua ketukan, dan peringatannya menyebut berapa teks yang merupakan hasil edit manual.

- **Terjemah ulang sekarang**: menandai teks-teks itu, membuang cache-nya, lalu langsung menerjemahkan **hanya** teks tersebut di tab Translate. Peringatan menampilkan perkiraan token. Teks pending lain tidak ikut diterjemahkan. Butuh API key.
- **Tandai untuk diterjemah ulang**: hanya mengubah status menjadi Error dan membuang cache. Terjemahan lama tetap terlihat sebagai acuan, tetapi tidak ikut ekspor sampai diterjemahkan ulang. Lanjutkan nanti lewat tombol *Lanjutkan* di tab Translate atau lewat chat AI di tab Ekspor.

Cache teks yang ditandai dibuang supaya hasil lama yang sama tidak dipakai lagi. Cache teks lain tetap dipakai, sehingga tidak ada token yang terbuang.

Filter **Belum diterjemahkan (sama dengan asli)** menampilkan teks yang terjemahannya identik dengan aslinya padahal bahasanya bukan bahasa target (misalnya Jepang atau Inggris tak tersentuh). Teks pendek atau meragukan, seperti nama dan istilah, sengaja tidak dihitung. Teks yang sudah berbahasa Indonesia tetapi memuat kata Portugis/Spanyol ditangkap oleh filter **Kata asing**, bukan filter ini.

## Cadangan dan Pemulihan

Semua data tersimpan di browser, dan browser boleh menghapusnya bila memori penuh atau data situs dibersihkan. Karena itu buat cadangan secara berkala.

Di tab **Proyek**, buka bagian **Cadangan dan pemulihan**:

- **Buat cadangan**: mengunduh file zip berisi data proyek, semua teks dan terjemahannya, file data asli (supaya proyek langsung bisa diekspor lagi), serta glosarium, gaya bahasa, catatan karakter, dan daftar aman plugin. **API key dan cache tidak ikut.**
- **Pulihkan dari cadangan**: memilih file zip tadi. Bila proyek yang sama sudah ada di perangkat, aplikasi menampilkan perbandingan jumlah teks yang sudah diterjemahkan dan meminta konfirmasi sebelum menimpa.
- **Penyimpanan permanen**: aplikasi meminta browser agar datanya tidak dihapus otomatis (setelah impor atau lewat tombol di bagian yang sama). Browser boleh menolak, jadi file cadangan tetap pengaman yang sebenarnya. Memasang aplikasi ke layar utama biasanya membantu permintaan ini dikabulkan.

File cadangan divalidasi sebelum dipakai: struktur, jumlah entri, id proyek, dan path file. Bila ada yang tidak cocok, tidak ada data yang diubah.

## Terjemah Lewat Chat AI (Tanpa API)

Tidak punya API key? Buka tab **Ekspor** lalu bagian **Terjemah lewat chat AI**:

1. Pilih kategori dan ukuran bagian, lalu tekan **Siapkan bagian**.
2. Salin atau unduh satu bagian (sudah berisi instruksi, gaya, catatan karakter, dan glosarium), lalu kirim ke aplikasi AI favoritmu.
3. Tempel balasannya (atau unggah sebagai `.txt`) dan tekan **Impor tempelan**.

Balasan harus berformat `[id] terjemahan`, satu baris per teks. Baris yang kodenya rusak atau hilang otomatis ditolak dan dilaporkan.

## Keamanan Hasil Terjemahan

Menerjemahkan teks game berarti harus menjaga kode di dalamnya agar game tidak rusak. Aplikasi ini melakukan beberapa lapis perlindungan:

- **Masking kode escape**: kode seperti `\C[2]`, `\V[1]`, `\N[1]`, tag `<...>`, `%1`, dan `$game...` diganti token sebelum dikirim ke model, lalu dikembalikan setelahnya.
- **Validasi token**: terjemahan ditolak bila token hilang, berubah, atau model menulis kode sendiri.
- **Deteksi kata kunci kode**: kata seperti `if`, `else`, atau `true` yang hilang atau ikut diterjemahkan akan ditandai.
- **Deteksi teks setengah terjemah**: hasil yang masih bercampur huruf Jepang atau aksara asing ditandai error.
- **Diff guard saat ekspor**: file hasil dibandingkan dengan file asli. Bila ada perubahan di luar teks, tidak ada zip yang dibuat. Entri yang posisinya tidak cocok dilewati dan tetap asli.
- **Verifikasi `.rvdata2`**: hasil penulisan ulang format Marshal dibaca balik dan dibandingkan dengan data yang diterjemahkan.

## Privasi dan Penyimpanan Data

- Semua pemrosesan terjadi **di browser**. Tidak ada server milik aplikasi ini yang menerima data game.
- Teks yang diterjemahkan dikirim **hanya ke base URL** yang kamu atur.
- API key **tidak disimpan** secara bawaan dan hanya hidup di memori tab. Key baru tersimpan bila kamu mencentang *Ingat key di perangkat ini*. Jangan aktifkan di perangkat bersama.
- Proyek, terjemahan, cache, dan pengaturan disimpan di **IndexedDB** (`rpgtl-db`). Tombol **Hapus semua data** di Pengaturan menghapus semuanya tanpa menyentuh data lain di situs yang sama.
- Karena berjalan di browser, provider harus mengizinkan request lintas-origin (CORS). Sebagian besar API LLM publik sudah mengizinkannya.

## Menjalankan Secara Lokal

Aplikasi memakai ES module dan service worker, jadi harus dibuka lewat server HTTP (bukan `file://`). Cukup layani folder proyek dengan server statis apa pun, misalnya:

```bash
# Python
python3 -m http.server 8080

# atau Node.js
npx serve .
```

Lalu buka `http://localhost:8080`. `localhost` dianggap konteks aman, jadi hashing (`crypto.subtle`) dan service worker tetap berfungsi.

## Deploy ke Vercel

Proyek ini siap dideploy sebagai situs statis. Tidak perlu framework preset, build command, maupun output directory khusus.

`vercel.json` sudah mengatur:

- `cleanUrls`.
- Header keamanan: `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Content-Security-Policy** ketat: skrip dan gaya hanya dari origin sendiri, tanpa inline script. `connect-src` hanya mengizinkan `https:` serta `localhost` dan `127.0.0.1` (untuk LLM lokal).
- Cache `no-cache` untuk `sw.js`, `manifest.json`, `app.js`, `app.css`, dan `index.html` agar deploy baru langsung terpakai.

Bila kamu memakai hosting lain, terapkan header yang setara.

## Struktur Proyek

```text
.
├── index.html       # Kerangka halaman, navigasi, dan ikon (SVG inline)
├── app.js           # Seluruh logika aplikasi (ES module)
├── app.css          # Gaya, termasuk mode gelap otomatis
├── lang-vocab.js    # Kosakata untuk deteksi bahasa Indonesia/Inggris
├── sw.js            # Service worker (cache app shell, mode offline)
├── manifest.json    # Manifest PWA
└── vercel.json      # Konfigurasi deploy dan header keamanan
```

Bagian utama `app.js`:

| Bagian | Isi |
| --- | --- |
| 1. Config dan string UI | Konstanta dan pesan antarmuka |
| 2. Storage | Wrapper IndexedDB, hash SHA-256, hapus data |
| 3. Parser dan extractor | Zip, Marshal (`.rvdata2`), `.rgss3a`, ekstraksi teks, masking kode |
| 4. Impor dan ekspor | Impor proyek, `buildPatch`, diff guard, penulisan zip |
| 5. Translate | Klien LLM, batch, cache, retry, resume, estimasi biaya, mode chat AI |
| 6. Tampilan | Proyek, Translate, Pengaturan, Review, Ekspor |
| 7. Bootstrap | Router berbasis hash dan pendaftaran service worker |

## Catatan Teknis

- Routing memakai hash: `#/proyek`, `#/translate`, `#/review`, `#/ekspor`, `#/pengaturan`.
- Service worker memakai strategi *network first*: halaman dan aset selalu diambil dari jaringan, dan cache dipakai hanya saat offline. Panggilan ke provider LLM tidak pernah dicegat. Naikkan `VERSION` di `sw.js` bila kamu ingin memaksa pembersihan cache lama.
- Mode tes: bila `globalThis.__RPGTL_TEST__` diset sebelum modul dimuat, aplikasi memakai database terpisah (`rpgtl-db-test`) dan tidak menjalankan bootstrap, sehingga fungsi yang diekspor bisa diuji langsung.
- Menambah kosakata deteksi bahasa cukup dengan mengedit `lang-vocab.js`. Semua huruf kecil, dipisah spasi atau baris baru.

## Lisensi

Belum ditentukan. Tambahkan file `LICENSE` dan perbarui bagian ini sesuai lisensi yang kamu pilih.
