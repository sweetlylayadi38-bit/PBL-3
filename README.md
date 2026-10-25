# PBL 3: LUTS pada BPH

Halaman web Lembar Tugas Mandiri PBL ke-3, Modul Ginjal dan Cairan Tubuh: definisi, epidemiologi, etiologi, dan faktor risiko LUTS.

Isi halaman:
- Animasi 2:40 yang diputar mengikuti gulir (GSAP ScrollTrigger).
- Mindmap LUTS dengan kaitan ke kasus Pemicu 3.
- Daftar referensi.

## Video

`video/luts-bph.mp4` adalah video asli 1920x1080 30 fps yang di-encode ulang sekali dengan keyframe tiap 1 detik
(SSIM 0,9989 terhadap aslinya, secara visual sama). Video asli punya keyframe tiap 8,3 detik, jadi tiap seek harus
men-decode sampai 250 frame; itu penyebab utama video tersendat saat digulir, terutama saat gulir mundur.

Cara memuat:
1. Video langsung di-stream supaya bisa digulir sejak awal.
2. Sambil itu berkas diunduh utuh ke memori. Begitu selesai, pemutar pindah ke salinan memori tanpa berkedip,
   dan setelahnya menggulir tidak butuh jaringan sama sekali.
3. Tombol "Pakai berkas itu" di kotak memuat bisa memakai `luts-bph.mp4` yang sudah ada di perangkat (tanpa unduhan).

GSAP (3.12.5) disimpan di `js/`, tidak bergantung CDN.

Encode ulang video dari berkas asli:

```
ffmpeg -i asli.mp4 -an -c:v libx264 -preset slow -tune animation -crf 18 -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart video/luts-bph.mp4
```

## Menjalankan

GitHub Pages, server lokal (`python3 -m http.server`), atau buka `index.html` langsung dari folder.

Uji kelancaran gulir (butuh Node + Playwright): `node tools/scrub-check.js . 6000`
(angka terakhir = kecepatan jaringan dalam kbps).
