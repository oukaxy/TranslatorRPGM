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
// Tambahan 2: kosakata dialog/RPG (tubuh, aksi, tempat, benda, gelar). Bentuk turunan (-s, -ed, -ing, -ly, -er) dikenali otomatis
// oleh englishWords() di app.js, jadi cukup tulis bentuk dasarnya.
const EN_MORE2 = words(`
adventurer adventure adventurers request requests switch guild party leader experience price sale buyer seller
merchant trader customer owner worker servant maid butler slave mistress sister brother mother father daughter son
wife husband family parent uncle aunt cousin kid lover stranger neighbor pirate thug criminal prisoner prison jail
cell judge court crime law police officer sheriff doctor nurse patient hospital medicine illness disease curse
blessing prayer bible saint monk nun face hair eye eyes nose mouth lip lips tongue tooth teeth neck shoulder shoulders
arm arms hand hands finger fingers belly waist hip hips leg legs thigh thighs foot feet skin head brain bone bones
breast breasts nipple nipples butt nude touches moans scream screams sweat soft tight deep rough gentle slowly quickly
suddenly gently softly tightly deeply hungrily slide slides slid part parted parting cleavage drops tears tear cry
cries laugh laughs smile smiles blush blushes shake shakes tremble trembles shiver shivers breathe breath breathing
panting gasp gasps whisper whispers shout shouts yell yells sigh sighs grin grins stare stares glare glares onto upon
toward towards outside beneath among except instead rather either neither nor whenever wherever whatever whoever
however therefore otherwise anyway anyways besides meanwhile afterwards finally actually basically honestly seriously
exactly probably definitely absolutely completely totally simply merely nearly barely hardly nowadays today tonight
tomorrow yesterday forever ought shoot shoots shot shooting fires aim aims hit hits strike strikes slash slashes stab
stabs pierce pierces crush crushes smash smashes swing swings block blocks dodge dodges parry parries counter counters
charge charges blast blasts explode explodes explosion burst bursts fall falls fell rise rises rose jump jumps climb
climbs fly flies flew swim swims dive dives crawl crawls sneak sneaks hide hides hid seek seeks sought chase chases
hunt hunts capture captures trap traps lock locks locked unlock unlocks seal seals sealed release releases frees
create creates created destroy destroys destroyed ruin ruined repair repairs forge forges craft crafts crafted brew
brews cook cooks bake bakes mix mixes combine combines upgrade upgrades enhance enhances improve improves increase
increases decrease decreases raise raises lower lowers gain gains gained earn earns earned spend spends spent cost
costs owe owes lend lends borrow borrows steal steals stole rob robs accepts accepted refuse refuses refused agree
agrees agreed disagree promise promises promised swear swears vow vows betray betrays forgive forgives apologize
apologizes greet greets welcomes invite invites introduce introduces check checks checked confirms cancels selects
chooses chosen change changes changed quits exits resume pause pauses automatic easy sounds screens windows buttons
controller control controls option language english japanese chinese korean version chapter scene prologue epilogue
title credits director producer artist writer author designer noon afternoon midnight dawn dusk sunrise sunset spring
summer autumn winter monday tuesday wednesday thursday friday saturday sunday january february march april june july
august september october november december north south east west front center middle corner edge side bottom red blue
green yellow orange purple pink black white gray grey brown golden crimson scarlet round square circle triangle line
lines point points dot dots star stars moon sun sky cloud clouds tree trees flower flowers grass leaf leaves seed
seeds root roots stone stones rock rocks sand dirt mud ash ashes smoke flame flames hill hills valley plains swamp
marsh jungle volcano canyon cliff beach coast harbor ship ships boat boats sail sails roads path paths trail gates
fence yard garden farm farmer fields barn mill pond stream waterfall rooms hall halls kitchen bedroom bathroom
basement attic cellar stairs stair ladder roof doors table chair bed beds desk shelf shelves lamp candle torch lantern
mirror clock bell bells drum flute harp violin song songs sing sings dance dances danced bread cheese meat fruit apple
apples berry berries vegetable vegetables soup rice milk wine beer tea coffee juice cake candy sugar salt swords
shields axes spears bows daggers blade blades hammer hammers whip whips wand wands staves helmets glove belt belts
cloak cloaks robe robes dress dresses skirt skirts shirt shirts pants shoes hat hats cap mask masks earring earrings
bracelet bracelets crown crowns jewel jewels gem gems diamond diamonds ruby emerald crystal crystals pearl pearls herb
herbs antidote scrolls map maps letters note notes paper ink diary journal chests box boxes bag bags barrel barrels
bottle bottles cup cups bowl bowls plate plates knives spoon fork poisons poisoned paralysis paralyzed sleeping asleep
awake blind blinded silence silenced stun stunned confuse confused charm charmed cursed bless blessed healed healing
revive revived resurrect resurrected rest rested recovered energy dexterity vitality charisma defence offense attacks
physical magical elemental minion minions guards commander soldiers army armies knights troop troops orc orcs elf
elves dwarf dwarves giant giants undead zombie zombies skeleton skeletons vampire vampires werewolf demons devils
angels dragons beasts thieves witches wizards sorcerer sorceress priestess lords ladies kings queens emperor empress
hero heroes heroine villain villains legends myth myths prophecy prophet oracle fate destiny kingdoms empires realm
realms land lands country countries nation nations cities towns villages castles fortress fortresses towers temples
shrine shrines tombs caves dungeons labyrinth maze floors ground layer layers entrance entrances bridges treasures
loot wealth fortune rewards prize prizes strangers traveler travelers visitor visitors guest guests loves loved hates
hated like likes liked wants wanted needs needed knows knew thinks thought feels believes hopes wishes wished dreamed
fears feared worry worries worried trusts trusted remembers remembered forgets forgot forgotten understand understands
understood learns learned teaches taught listen listens listened watch watches watched waits waited stays stayed
arrives arrived returns returned begins starts started finishes finished continues continued stops stopped tells asks
answers answered calls names named
`);
export const EN_W = new Set([...EN_BASE, ...EN_MORE, ...EN_MORE2]);

// Kata Inggris yang SENGAJA dibiarkan (nama tokoh, tempat, istilah). Tidak dihitung di filter Review. Tulis huruf kecil, pisah spasi.
// Contoh: cayenne ghost
export const EN_SKIP = words(`
`);

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

// Kata khas Prancis/Jerman/Italia yang muncul bila model salah keluar bahasa (halusinasi bahasa).
// Dicek otomatis terhadap kamus Indonesia/Inggris saat dimuat; kata yang bentrok dibuang.
const FOREIGN_MORE = words(`
je nous vous ils elles est sont suis sommes avec pour dans mais donc alors aussi très même mes leur leurs cette ces ceux
comment pourquoi quand parce voulais voulait veux veut peux peut pouvoir devoir faut faire toujours jamais rien tout tous
toute toutes beaucoup trop merci bonjour bonsoir salut monsieur madame mademoiselle encore déjà hors perdraient valeur
embêter qui que quoi chez sans sous entre vers depuis pendant
ich nicht und ist mit für aber auch wenn dann noch schon sehr kann habe danke bitte wir ihr euch
che questo questa anche molto grazie ciao sono perché
`);
FOREIGN_MORE.forEach((w) => { if (!ID_W.has(w) && !ID_X.has(w) && !EN_W.has(w) && !EN_SKIP.has(w) && !ID_AMBIG.has(w)) FOREIGN_W.add(w); });
