# Design System — Kopi & Space Hub POS

## Arah visual
Antarmuka terminal kasir desktop yang padat, cepat dibaca, dan terasa seperti alat kerja. Arah **neo-brutalism** datang dari outline navy tebal, bayangan keras, sudut tegas membulat, tombol biru elektrik, dan label monospace. Susunan dan kepadatan mengacu pada gambar referensi yang diberikan: katalog di tengah, konteks meja di kiri, dan bon/pembayaran selalu terlihat di kanan.

## Prinsip UX
- Kasir dapat menemukan item, memilih meja, mengubah jumlah, dan menuju pembayaran tanpa kehilangan konteks bon.
- Informasi ketersediaan ruang memakai status Ready, Booked, dan Terpakai; produk menampilkan stok.
- Pintasan keyboard ditampilkan sebagai affordance visual; implementasi shortcut sungguhan menjadi kebutuhan tahap berikutnya.
- Desktop memakai tiga kolom; tablet dan ponsel menumpuk katalog di atas bon dan menyembunyikan panel denah yang tidak muat.
- Framer Motion hanya memberi transisi masuk, perubahan jumlah/layout, dan toast; gerak singkat (sekitar 200–250 ms) agar tidak menghambat kerja kasir.

## Token
| Token | Nilai | Penggunaan |
|---|---|---|
| Ink | `#172033` | Teks dan outline |
| Action blue | `#2864E8` | Aksi utama, item terpilih |
| Paper | `#FFFFFF` | Kartu dan panel |
| Soft | `#F4F7FB` | Area bon dan kontrol sekunder |
| Line | `#C9D3E1` | Pemisah halus |
| Success | `#16C784` | Ready / stok tersedia |
| Warning | `#FFD335` | Booked / perhatian |
| Danger | `#FF505C` | Terpakai / hapus |
| UI font | DM Sans | Label, tombol, heading |
| Data font | DM Mono | Harga, kode, status, shortcut |

Outline utama 2–3 px dengan shadow offset 2–3 px tanpa blur. Kartu konten memakai radius 10–12 px; tombol 7–9 px. Biru dipakai khusus aksi, bukan bidang dekoratif besar.

## Kerangka halaman
1. **Header global:** identitas gerai, status terminal, shift, notifikasi, profil.
2. **Rail kiri:** status terminal, buka meja, kategori menu/space, denah meja cepat, bantuan.
3. **Area katalog:** pencarian, tombol tindakan/pintasan, filter, legenda status, kartu produk dan ruang.
4. **Panel bon:** meja/reservasi aktif, daftar item dan kuantitas, rincian pajak/layanan/diskon, total, bayar, cetak/pisah bon.

## Komponen dan keadaan
- Kartu katalog: foto, stok/status ruang, kategori, nama, harga, aksi tambah atau pesan.
- Baris bon: nama, opsi hapus, stepper jumlah, subtotal baris. Untuk space tampil durasi/jadwal.
- Kartu meja: kode, kapasitas, dan status berwarna plus teks agar warna bukan satu-satunya pembeda.
- Keadaan perlu didesain lanjut: kosong, loading/skeleton, stok habis, ruang bentrok, pembayaran pending/gagal/berhasil, koneksi offline, shift ditutup.

## Catatan implementasi
- Komponen halaman sekarang berada di `src/app/page.tsx`; aturan visual di `src/app/globals.css`.
- Foto demonstrasi memakai URL Unsplash. Ganti dengan aset katalog milik gerai sebelum rilis.
- Angka pajak, layanan, diskon, reservasi, serta keranjang awal saat ini hanya fixture UI; jangan dipakai sebagai nilai transaksi produksi.
- Integrasi Supabase dan Midtrans harus memakai server-side validation, idempotensi, dan callback/webhook terverifikasi.
