// Kosakata untuk deteksi bahasa (dipakai langInfo di app.js). Tambah kata di sini; pemisah spasi atau baris baru.
// Semua huruf kecil. JANGAN masukkan kata yang juga umum di Inggris/nama game: mana, main, item, helm, air, api, cat,
// naga, monster, slime, goblin, status, level, skill, gold, oke, hal, pun.
const words = (s) => new Set(s.trim().split(/\s+/));

// ---- Indonesia: kata fungsi & percakapan ----
export const ID_W = words(`
yang dan di ke dari untuk dengan tidak ini itu ada saya aku kamu kau kita kami mereka akan sudah belum bisa dapat
pada adalah atau juga tapi tetapi karena jika kalau apa siapa bagaimana mengapa kenapa sebuah para oleh lagi saja
hanya sangat sekali harus mau ingin punya anda dia ia lebih semua setiap masih telah dalam tentang seperti setelah
sebelum ketika saat sini situ sana bukan jangan tolong terima kasih maaf selamat ya dong deh kok
agar antara atas bagi bahkan bahwa baik bagus banyak barang bawah belakang benar bersama biar bila buat cuma dulu
 depan dua tiga empat lima enam tujuh delapan sembilan sepuluh satu hari ini kapan dimana kemana darimana
entah harap hingga ingat jadi jangan kalian kemudian kepada kembali  lalu langsung  lewat maka masuk
melihat mungkin nanti namun pasti pergi pernah pula sambil sampai sebuah secara sedang segera sehingga sekarang
selalu sempat sendiri seorang serta sesuatu sudah supaya tadi tahu tau tak tanpa tentu terus tiap udah untuk
waktu walau walaupun yaitu yakin yuk ayo ayolah kayak kayaknya banget nggak enggak gak gue sih nih lho loh tuh
dong deh kok kan wah aduh astaga sayang kasihan syukur selamat datang sampai jumpa permisi silakan silahkan
apakah bagaimana mengapa kenapa kapan berapa mana-mana siapapun apapun dimanapun tidaklah bukanlah
kemarin besok malam pagi siang  hari minggu bulan tahun orang teman kakek nenek ayah ibu bapak kakak adik
tuan nona nyonya anak   ratu pahlawan musuh
rumah desa kota hutan gua kastil istana kerajaan penjara kuil menara ruang tanah jalan pintu jendela kamar
`);

// ---- Indonesia: istilah UI/game (sering muncul sebagai teks pendek 1-2 kata) ----
export const ID_X = words(`
serang serangan pertahanan pertahankan kecepatan keberuntungan kekuatan ketahanan kelincahan kecerdasan akurasi
menghindar kritikal kerusakan sihir mantra kutukan berkah berkat kemampuan keahlian tingkat pengalaman nyawa darah
pertarungan bertarung pertempuran lari kabur melarikan menang kalah kemenangan kekalahan giliran musuh
simpan muat keluar mulai pilihan pilih lanjut lanjutkan kembali tutup buka batal beli jual jumlah harga uang emas perak
peralatan perlengkapan formasi pengaturan permainan baru judul layar penuh tombol suara musik efek  bahasa
tas bahan ramuan obat tonik penawar racun senjata zirah baju topi cincin kalung jubah sepatu perisai pedang tongkat
busur panah pisau belati tombak kapak palu kunci peta surat buku koin permata kristal
pendekar penyihir prajurit pemanah pendeta pencuri ksatria kesatria tabib pemain
tertidur lumpuh bingung terbakar membeku keracunan terkena pulih sembuh mati hidup kelelahan
iblis setan hantu raksasa serigala kelelawar ular tikus kucing anjing burung ikan
mendapatkan menerima menggunakan digunakan diperoleh ditemukan dimiliki terjual dibeli dijual
peringatan berhasil gagal terkunci terbuka selesai tersedia
`);

// ---- Inggris: kata fungsi & percakapan ----
export const EN_W = words(`
the and to of a is are was were you i it that this in on for with not be have has had will would can could my your we
he she they them his her but if so what who how why do don't did no yes at as from by an me us just all there here
now then when up out about i'm it's you're
am been being our their its which while because before after again also than too very into over under only some any
more most other such both each few many much should must shall might may get got go going come see know think want
need let let's please thank thanks sorry hello hi hey okay well oh yeah what's that's there's can't won't isn't
i'll i've we're they're he's she's didn't doesn't wasn't couldn't wouldn't shouldn't haven't hasn't aren't
`);

// Kata Indonesia yang juga nama/romaji Jepang (Dan, Kami, Sana, Kita, Aku, Hari, Lima). Hanya dihitung bila ditulis huruf kecil.
export const ID_AMBIG = words('dan kami sana kita aku hari lima');
