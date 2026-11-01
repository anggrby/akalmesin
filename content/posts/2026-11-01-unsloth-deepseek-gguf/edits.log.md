# Edit log

Every change to copy or design, newest last. Times are WIB.

## 2026-11-01 19:44 WIB — design build

Design revision 1dc955abb564 · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 19:45 WIB — design build

Design revision 8f781ff898d5 · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 19:49 WIB — design build

Design revision f0e252776714 · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 20:41 WIB — design build

Design revision bf1634fec3ae · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 20:42 WIB — design build

Design revision dc52a4d685bb · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 20:43 WIB — design build

Design revision 7530bc1cd7ff · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 20:43 WIB — Angger edits (review)

Who: Angger · mode: review · file: `owner-review-chat-2026-11-01.json` · saved 2026-11-01 20:40 WIB
Revision a5fca705e8c7 → 8db71328f245

### 01-main · headline

```diff
- Unsloth rilis GGUF
+ Unsloth Rilis GGUF
  words: −"rilis" +"Rilis"
- DeepSeek Flash lokal
+ DeepSeek Flash Lokal
  words: −"lokal" +"Lokal"
```

### 01-main · summary

```diff
- Dynamic V3.1 diklaim unggul di banyak benchmark—1-bit dari ~128 GB RAM
+ Kuantisasi Dynamic V3.1 ini diklaim unggul di berbagai benchmark dan bisa dijalankan mulai dari ~128 GB RAM, meski klaim skornya masih menunggu verifikasi independen.
  words: +"Kuantisasi" · +"ini" · −"banyak benchmark—1-bit" +"berbagai benchmark dan bisa dijalankan mulai" · −"RAM" +"RAM, meski klaim skornya masih menunggu verifikasi independen."
```

### title

```diff
- Unsloth rilis GGUF DeepSeek Flash lokal
+ Unsloth Rilis GGUF DeepSeek Flash Lokal
  words: −"rilis" +"Rilis" · −"lokal" +"Lokal"
```

### 02-rilis · paragraph-0

```diff
- Pada 30 Oktober 2026 Unsloth merilis GGUF Dynamic V3.1 (preview) untuk **DeepSeek-V4.1-Flash-1017**, model terbuka yang mereka posisikan kuat untuk coding dan tugas agentik.
+ Pada 30 Oktober 2026, Unsloth merilis format GGUF Dynamic V3.1 (preview) untuk **DeepSeek-V4.1-Flash-1017, model open-weights yang dirancang khusus untuk coding dan tugas agentic**.
  words: −"2026" +"2026," · +"format" · −"**DeepSeek-V4.1-Flash-1017**," +"**DeepSeek-V4.1-Flash-1017," · −"terbuka" +"open-weights" · −"mereka posisikan kuat" +"dirancang khusus" · −"agentik." +"agentic**."
- File ada di Hugging Face.
+ File model ini sudah tersedia di Hugging Face.
  words: −"ada" +"model ini sudah tersedia"
- Model aslinya punya konteks 1 juta token, tulang punggung 552B plus tabel Engram ~196B yang bisa di-SSD supaya RAM tidak menahan semuanya.
+ Versi aslinya memiliki context window 1 juta token dengan arsitektur utama 552B parameter, ditambah tabel Engram ~196B yang bisa dialihkan (offload) ke SSD agar tidak membebani kapasitas RAM sepenuhnya.
  words: −"Model" +"Versi" · −"punya konteks" +"memiliki context window" · −"token, tulang punggung" +"token dengan arsitektur utama" · −"plus" +"parameter, ditambah" · −"di-SSD supaya RAM" +"dialihkan (offload) ke SSD agar" · −"menahan semuanya." +"membebani kapasitas RAM sepenuhnya."
```

### 03-benchmark · paragraph-0

```diff
- Menurut tabel Unsloth, **UD-Q2_K_XL (334,8 GB) meraih rata-rata 87,49** di enam benchmark—nyaris menyamai referensi Q8 (87,68)—dengan AIME25 97,50, GPQA Diamond 89,58, dan LiveCodeBench v6 84,76.
+ Unsloth mengklaim varian **UD-Q2_K_XL (334,8 GB) berhasil meraih skor rata-rata 87,49 di enam benchmark**—nyaris menyamai presisi referensi Q8 (87,68)—dengan rincian skor AIME25 97,50, GPQA Diamond 89,58, dan LiveCodeBench v6 84,76.
  words: −"Menurut tabel Unsloth," +"Unsloth mengklaim varian" · +"berhasil" · +"skor" · −"87,49**" +"87,49" · −"benchmark—nyaris" +"benchmark**—nyaris" · +"presisi" · +"rincian skor"
- Varian 1-bit UD-IQ1_S (233 GB) masih 92,92 di AIME25.
+ Bahkan, varian 1-bit UD-IQ1_S (233 GB) disebut masih mampu mencetak skor 92,92 di AIME25.
  words: −"Varian" +"Bahkan, varian" · +"disebut" · +"mampu mencetak skor"
- Angka ini dari Unsloth, belum diverifikasi independen.
+ Seluruh angka ini berasal dari pengujian internal Unsloth dan masih menunggu verifikasi independen.
  words: −"Angka" +"Seluruh angka" · +"berasal" · −"Unsloth, belum diverifikasi" +"pengujian internal Unsloth dan masih menunggu verifikasi"
```

### 04-ram · paragraph-0

```diff
- Untuk yang ingin menjalankan di rumah: Unsloth bilang **varian 1-bit butuh sekitar 128–145 GB** RAM/VRAM jika Engram di-mmap di SSD; 2-bit sekitar 176–205 GB.
+ Bagi yang ingin menjalankannya secara lokal, Unsloth menyebut **varian 1-bit membutuhkan sekitar 128–145 GB RAM/VRAM** jika tabel Engram dipetakan (mmap) ke SSD, sementara varian 2-bit butuh 176–205 GB.
  words: −"Untuk" +"Bagi" · −"menjalankan di rumah:" +"menjalankannya secara lokal," · −"bilang" +"menyebut" · −"butuh" +"membutuhkan" · −"GB** RAM/VRAM" +"GB RAM/VRAM**" · +"tabel" · −"di-mmap di SSD;" +"dipetakan (mmap) ke SSD, sementara varian" · −"sekitar" +"butuh"
- Disk tetap gemuk—UD-IQ1_S saja 233 GB.
+ Kebutuhan ruang penyimpanannya pun tetap masif—file UD-IQ1_S saja berukuran 233 GB.
  words: −"Disk" +"Kebutuhan ruang penyimpanannya pun" · −"gemuk—UD-IQ1_S" +"masif—file UD-IQ1_S" · +"berukuran"
- Setup 64 GB disebut bisa, tapi lebih lambat.
+ Konfigurasi 64 GB RAM disebut tetap bisa berjalan meski jauh lebih lambat, menandakan model coding open-weights kelas frontier kini mulai menuntut spesifikasi workstation, bukan lagi laptop tipis.
  words: −"Setup" +"Konfigurasi" · +"RAM" · −"bisa, tapi" +"tetap bisa berjalan meski jauh" · −"lambat." +"lambat, menandakan model coding open-weights kelas frontier kini mulai menuntut spesifikasi workstation, bukan lagi laptop tipis."
- Frontier coding open-weight mulai masuk workstation, bukan laptop tipis.
```

### 05-batas · paragraph-0

```diff
- Unsloth juga menantang klaim GSQ-RCO (ISTA) yang bilang semua kuantisasinya 100% di AIME25—**mereka tidak bisa mereproduksi angka itu** dan melihat degradasi saat diuji ulang.
+ Unsloth turut mematahkan klaim GSQ-RCO (ISTA) yang menyebut seluruh kuantisasinya meraih skor sempurna 100% di AIME25—**mereka gagal mereproduksi angka tersebut dan justru menemukan penurunan performa saat diuji ulang**.
  words: −"juga menantang" +"turut mematahkan" · −"bilang semua" +"menyebut seluruh" · +"meraih skor sempurna" · −"tidak bisa" +"gagal" · −"itu**" +"tersebut" · −"melihat degradasi" +"justru menemukan penurunan performa" · −"ulang." +"ulang**."
- Catatan lain: bit lebih rendah cenderung berpikir lebih panjang dan lebih sering kena batas token.
+ Catatan lainnya, kuantisasi bit rendah cenderung menghasilkan rantai penalaran (reasoning) yang lebih bertele-tele sehingga lebih sering membentur batas maksimal token.
  words: −"lain:" +"lainnya, kuantisasi" · −"lebih" · −"berpikir" +"menghasilkan rantai penalaran (reasoning) yang" · −"panjang dan" +"bertele-tele sehingga" · −"kena" +"membentur" · +"maksimal"
- Jadi file lebih kecil datang dengan trade-off, bukan salinan sempurna.
+ Artinya, ukuran file yang lebih ramping tetap hadir dengan trade-off, bukan salinan sempurna.
  words: −"Jadi" +"Artinya, ukuran" · +"yang" · −"kecil datang" +"ramping tetap hadir"
```

### caption ¶1

```diff
- Model coding raksasa biasanya hanya hidup di cloud—kecuali kamu punya RAM setara workstation gemuk.
+ Menjalankan model AI kelas frontier di komputer lokal kini makin menantang, tapi bukan mustahil.
  words: −"Model coding raksasa biasanya hanya hidup" +"Menjalankan model AI kelas frontier" · −"cloud—kecuali kamu punya RAM setara workstation gemuk." +"komputer lokal kini makin menantang, tapi bukan mustahil."
- Unsloth merilis kuantisasi Dynamic V3.1 untuk DeepSeek-V4.1-Flash-1017 pada 30 Oktober 2026, file GGUF yang mereka klaim unggul di banyak benchmark dan bisa dijalankan lokal lewat Hugging Face.
+ Pada 30 Oktober 2026, Unsloth resmi merilis kuantisasi GGUF Dynamic V3.1 (preview) untuk DeepSeek-V4.1-Flash-1017, sebuah model open-weights raksasa yang dirancang untuk kebutuhan coding dan tugas agentic.
  words: +"Pada 30 Oktober 2026," · +"resmi" · +"GGUF" · +"(preview)" · −"DeepSeek-V4.1-Flash-1017 pada 30 Oktober 2026, file GGUF" +"DeepSeek-V4.1-Flash-1017, sebuah model open-weights raksasa" · −"mereka klaim unggul di banyak benchmark" +"dirancang untuk kebutuhan coding" · −"bisa dijalankan lokal lewat Hugging Face." +"tugas agentic."
+ Unsloth mengklaim metode kuantisasi terbaru mereka mampu memangkas ukuran model secara ekstrem tanpa mengorbankan akurasi secara signifikan.
```

### caption ¶2

```diff
- Menurut tabel Unsloth, UD-Q2_K_XL (334,8 GB) nyaris menyamai skor rata-rata referensi 8-bit di enam benchmark, termasuk AIME25, GPQA Diamond, dan LiveCodeBench v6.
+ Dalam pengujian internalnya, varian 2-bit (334,8 GB) diklaim mencatat rata-rata skor 87,49 di enam benchmark utama, nyaris menyamai presisi Q8 (87,68).
  words: −"Menurut tabel Unsloth, UD-Q2_K_XL" +"Dalam pengujian internalnya, varian 2-bit" · −"nyaris menyamai skor" +"diklaim mencatat" · −"referensi 8-bit" +"skor 87,49" · −"benchmark, termasuk AIME25, GPQA Diamond, dan LiveCodeBench v6." +"benchmark utama, nyaris menyamai presisi Q8 (87,68)."
- Varian 1-bit sekitar 233 GB diklaim cukup dengan 128–145 GB RAM jika tabel Engram ditaruh di SSD.
+ Uniknya, arsitektur utama 552B parameter pada model ini dilengkapi tabel Engram ~196B yang bisa dialihkan (offload) ke SSD menggunakan fitur mmap, sehingga varian 1-bit (233 GB) sudah bisa dijalankan dengan kombinasi 128–145 GB RAM/VRAM, atau minimal 64 GB RAM dengan konsekuensi kecepatan inference yang lebih lambat.
  words: −"Varian" +"Uniknya, arsitektur utama 552B parameter pada model ini dilengkapi tabel Engram ~196B yang bisa dialihkan (offload) ke SSD menggunakan fitur mmap, sehingga varian" · −"sekitar 233 GB diklaim cukup" +"(233 GB) sudah bisa dijalankan" · +"kombinasi" · +"RAM/VRAM, atau minimal 64 GB" · −"jika tabel Engram ditaruh di SSD." +"dengan konsekuensi kecepatan inference yang lebih lambat."
- Tetap bukan urusan laptop tipis—tapi frontier open-weight mulai masuk mesin lokal.
```

### caption ¶3

```diff
- Semua angka itu dari pengujian Unsloth sendiri.
+ Meski begitu, seluruh skor di atas masih berupa klaim internal yang menunggu verifikasi independen, apalagi varian bit rendah terbukti cenderung berpikir lebih bertele-tele hingga rawan membentur batas token.
  words: −"Semua angka itu dari pengujian Unsloth sendiri." +"Meski begitu, seluruh skor di atas masih berupa klaim internal yang menunggu verifikasi independen, apalagi varian bit rendah terbukti cenderung berpikir lebih bertele-tele hingga rawan membentur batas token."
- Mereka juga menolak klaim kompetitor yang bilang kuantisasi tertentu tetap 100% di AIME25, karena tidak bisa direproduksi.
+ Dengan ukuran file dan syarat RAM sebesar ini, apakah merakit PC/workstation lokal untuk AI masih worth it, atau mending sewa cloud GPU saja?
  words: −"Mereka juga menolak klaim kompetitor yang bilang kuantisasi tertentu tetap 100% di AIME25, karena tidak bisa direproduksi." +"Dengan ukuran file dan syarat RAM sebesar ini, apakah merakit PC/workstation lokal untuk AI masih worth it, atau mending sewa cloud GPU saja?"
- Menurutmu, seberapa penting bisa menjalankan model coding sekelas ini di mesin sendiri dibanding tetap di API?
```

### caption ¶4

```diff
- Sumber: Unsloth, Hugging Face / Foto: Unsloth, Hugging Face
+ Sumber: Unsloth, Hugging Face / Foto: Unsloth
  words: −"Unsloth, Hugging Face" +"Unsloth"
- #akalmesin #Unsloth #DeepSeek #GGUF #Programming
+ #akalmesin #DeepSeek #Unsloth #LocalLLM #OpenWeights
  words: −"#Unsloth" · −"#GGUF #Programming" +"#Unsloth #LocalLLM #OpenWeights"
```

## 2026-11-01 20:43 WIB — design build

Design revision 62a0ebfec08f · 5 PNGs · blue ink from originals (crop/pad in post.json).

## 2026-11-01 20:43 WIB — review save approved

Saved in review editor 2026-11-01T13:40:00.000Z · owner-review-chat-2026-11-01.json · copy 8db71328f245 · design 62a0ebfec08f
