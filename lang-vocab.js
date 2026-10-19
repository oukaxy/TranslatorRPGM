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

// ---- Indonesia: kosakata dewasa/sensual, makian, dan bahasa gaul (dipakai agar teks dewasa tidak salah terdeteksi) ----
// JANGAN masukkan kata yang sama di Inggris: penis, vagina, anal, oral, sex, anus, dildo, bra.
const ID_ADULT = words(`
payudara dada puting tetek toket susu bokong pantat paha pinggul selangkangan kemaluan kelamin kejantanan klitoris rahim
telanjang bugil birahi nafsu gairah rangsang rangsangan merangsang bercinta bersetubuh persetubuhan senggama bersenggama
orgasme klimaks ejakulasi sperma ereksi tegang mengeras basah becek licin sempit ketat nikmat geli lubang perawan keperawanan
mesum cabul genit nakal menggoda godaan merayu rayuan sayang manja malu mendesah desah desahan mengerang erang gemetar
bergetar menggeliat sentuh menyentuh sentuhan elus mengelus belai membelai peluk memeluk pelukan cium mencium ciuman
kecup mengecup jilat menjilat hisap menghisap isap mengisap gigit menggigit remas meremas lidah bibir mulut leher pipi
tubuh badan kulit keringat ranjang kasur selimut mandi celana rok gaun stoking kemben hamil mengandung
pelacur jalang sundal lonte budak majikan hukuman cambuk diikat ikat belenggu rantai tunduk patuh
kontol memek pepek ngentot entot ngewe colmek bangsat bajingan brengsek sialan keparat kampret tolol bodoh goblok sinting gila
bangke bacot anjir anjrit njir buset
gimana gitu gini emang emangnya soalnya pokoknya bentar sebentar aja doang yaudah yasudah
`);
ID_ADULT.forEach((w) => ID_X.add(w));

// ---- Inggris: kata fungsi & percakapan ----
const EN_BASE = words(`
the and to of a is are was were you i it that this in on for with not be have has had will would can could my your we
he she they them his her but if so what who how why do don't did no yes at as from by an me us just all there here
now then when up out about i'm it's you're
am been being our their its which while because before after again also than too very into over under only some any
more most other such both each few many much should must shall might may get got go going come see know think want
need let let's please thank thanks sorry hello hi hey okay well oh yeah what's that's there's can't won't isn't
i'll i've we're they're he's she's didn't doesn't wasn't couldn't wouldn't shouldn't haven't hasn't aren't
`);

// Tambahan kata Inggris umum (kata kerja, benda, sifat, istilah UI/game) agar filter "Ada kata Inggris" menangkap teks yang tertinggal.
// JANGAN masukkan kata yang juga dipakai di Indonesia/game: game menu film data bank radio hotel volume master power cool real color
// item level status skill monster gold mana main air cat. Kata Spanyol/Portugis ada di FOREIGN_W, bukan di sini.
const EN_MORE = words(`
these those where whose whom whether although though unless until since during without within between through against
around across along behind beside beyond above below near every everyone everything anything nothing something someone
anyone nobody always never sometimes often maybe perhaps still already yet even ever once twice another others same
different myself yourself himself herself itself ourselves themselves mine yours hers ours theirs him welcome goodbye
bye sir madam find found finding look looking take took taken give gave given tell told say said speak spoke talk walk
walking run ran running stop stay wait help hold keep bring brought send open close use used make made build live
leave left return follow move turn pull push throw catch break fix save lose lost win won die died dead kill killed
fight fought fighting attack defend protect call called ask asked answer try tried trying feel felt hear heard learn
teach read write wrote play played start begin began end finish buy bought sell sold pay paid eat drink sleep wake
dream dreams remember forget believe trust love hate hope wish fear meet met visit enter escape search choose pick
drop carry cut burn freeze shock poison heal cure restore recover equip unequip cast summon defeat explore travel
arrive reach coming taking making giving getting having doing saying seeing waiting working work works worked continue
options quit exit cancel confirm back next previous select settings setting sound music screen window button accept
decline discard inventory equipment sword shield armor armour weapon weapons staff bow arrow arrows axe spear dagger
knife helmet boots gloves necklace potion potions elixir scroll book books letter key keys chest door gate wall floor
room house home village town city castle palace tower dungeon cave forest mountain river lake sea ocean island desert
field road bridge street market shop inn church temple graveyard tomb ruins world kingdom empire king queen prince
princess lord lady knight warrior mage wizard witch priest thief hunter archer soldier guard captain teacher student
child children boy girl woman women people friend friends enemy enemies demon devil angel god gods goddess spirit
ghost dragon beast wolf bear snake spider rat bird fish horse sheep cow pig dog fire water earth wind lightning
thunder ice snow rain storm light dark darkness shadow night morning evening day days week month year time hour minute
moment life death soul heart mind blood strength luck wisdom courage pain voice word words name story tale legend
secret truth lie lies memory money coin coins silver treasure gift reward quest mission battle war peace victory
danger trouble problem question reason way place thing things men magic damage health agility intelligence critical
evade evasion accuracy resist resistance weakness defense speed good bad great small little long short high low fast
slow strong weak young old new big large huge tiny hot cold warm bright beautiful ugly strange weird dangerous safe
true false free full empty heavy sharp broken hidden ancient sacred holy evil wicked brave kind cruel happy sad angry
afraid tired sick hungry thirsty alive ready sure certain right wrong first second third last own whole half enough
almost quite really truly soon later away down forward together alone one two three four five six seven eight nine ten
`);
export const EN_W = new Set([...EN_BASE, ...EN_MORE]);

// Kata Indonesia yang juga nama/romaji Jepang (Dan, Kami, Sana, Kita, Aku, Hari, Lima). Hanya dihitung bila ditulis huruf kecil.
export const ID_AMBIG = words('dan kami sana kita aku hari lima');

// Kata khas Portugis/Spanyol yang sering tertinggal di teks hasil terjemahan mesin (dipakai foreignWords di app.js).
// Hanya kata yang tidak ada di Indonesia/Inggris. JANGAN masukkan: para, mas, nada, las, com, bom, una, casa, seu, sua (umum di Indonesia atau nama).
export const FOREIGN_W = words(`
mesmo você vocês voce também tambem então entao ainda porque porquê obrigado obrigada estou estão estamos nós
nosso nossa minha muito muita muitos aqui agora sempre tudo pelo pela isso isto vamos desculpa desculpe hoje ontem
amanhã tenho quero posso preciso ninguém alguém coisa coisas porém embora apesar enquanto depois
gracias también pero estoy están nosotros nosotras usted ustedes muy aquí ahora siempre hola adiós señor señora
nuestro nuestra quiero puedo tengo hacer mucho mucha cuando donde pues entonces todavía aunque tiene había estás
eres somos bueno buenas
gostoso gostosa buceta boceta tesão safada safado putaria caralho porra merda puta foda foder gozar gozando peitos rabo
delícia querida querido linda lindo gemido molhada senhor senhora
coño joder mierda carajo culo polla verga tetas puto cabrón cabrona pendejo cariño bonita guapa señorita caliente
`);

// Kata Indonesia yang juga kata/nama Inggris (Mantra, Dada, Gila monster...). Hanya dihitung bila ditulis huruf kecil.
'mantra dada gila pipi rok ikat susu paha topi kota surat'.split(' ').forEach((w) => ID_AMBIG.add(w));

// ---- Inggris: bahasa gaul/lisan dan kosakata dewasa (membantu baris pendek seperti "Harder..." atau "Fuck you.") ----
const EN_EXTRA = words(`
gonna wanna gotta ain't gimme lemme dunno nope yep nah y'all
fuck fucking fucked shit damn bitch dick cock pussy cum ass tits boobs naked horny suck sucking lick licking moan moaning
harder deeper faster wet hard inside kiss kisses kissing touch touching stroke thrust
`);
EN_EXTRA.forEach((w) => EN_W.add(w));
