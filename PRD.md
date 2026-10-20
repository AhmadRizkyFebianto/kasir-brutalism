# PRD — Kopi & Space Hub POS

**Status:** Implementasi bertahap — irisan 1 (autentikasi/katalog), 2 (bon), dan 3 (pembayaran)  
**Platform:** Web responsif, Next.js + TypeScript + Tailwind CSS + Framer Motion  
**Backend/data:** Supabase (Postgres, Auth, Storage)  
**Pembayaran:** Midtrans

## 1. Ringkasan
Kopi & Space Hub membutuhkan terminal kasir untuk satu gerai yang menjual minuman/makanan dan menyewakan ruang. Kasir perlu mengelola meja dan reservasi, membuat bon campuran produk serta ruang, menghitung tagihan, menerima pembayaran, lalu mencetak bukti transaksi. Pengalaman kasir menekankan kecepatan, keterbacaan, dan status operasional yang jelas.

## 2. Masalah dan tujuan
**Masalah:** transaksi produk, penggunaan meja, reservasi ruang, dan pembayaran sering berada pada alur terpisah; kasir sulit melihat ketersediaan dan nilai bon secara serentak.

**Tujuan MVP:**
- Menampilkan katalog produk dan space dalam satu terminal.
- Memungkinkan kasir memilih meja/ruang, menambahkan item, mengubah jumlah/durasi, dan menghitung total.
- Menyimpan transaksi dan status pembayaran dengan aman.
- Mendukung pembayaran tunai dan QRIS/kanal Midtrans yang diaktifkan untuk akun merchant.
- Memiliki otorisasi peran kasir dan admin serta jejak perubahan transaksi.

## 3. Pengguna dan peran
- **Kasir:** masuk shift, membuat/mengubah bon aktif, menetapkan meja, memproses pembayaran, cetak/resend struk.
- **Admin/Owner:** kelola katalog, harga, stok, area/meja/ruang, pajak/layanan/diskon, pengguna, dan laporan.
- **Webhook Midtrans:** layanan sistem yang memperbarui status pembayaran setelah memverifikasi notifikasi.

## 4. Lingkup MVP
### Termasuk
- Login dan pembatasan akses berdasarkan gerai/peran.
- Dashboard POS dengan pencarian/filter produk dan space.
- Manajemen meja/ruang: available, reserved, occupied; waktu dan kapasitas reservasi.
- Keranjang satu bon dengan produk dan biaya sewa space, kuantitas/durasi, diskon dan pajak yang dapat dikonfigurasi.
- Checkout: tunai serta Midtrans Snap/QRIS sesuai konfigurasi merchant; status pending, paid, failed, expired, refunded.
- Webhook Midtrans terverifikasi, idempotensi notifikasi, catatan pembayaran dan audit dasar.
- Riwayat transaksi dasar dan cetak struk browser.
- Animasi transisi ringan; keadaan loading, kosong, gagal, dan sukses.

### Tidak termasuk pada MVP
- Akuntansi/pembukuan penuh, payroll, loyalty point, multi-gerai kompleks, offline-first, kitchen display, split bill tingkat lanjut, integrasi printer thermal khusus, dan rekonsiliasi otomatis bank.

## 5. Alur utama
1. Kasir login dan membuka shift.
2. Kasir memilih meja/ruang atau membuat order take-away.
3. Kasir mencari dan menambahkan menu serta reservasi ruang.
4. Kasir mengatur jumlah/durasi; sistem menghitung subtotal, pajak, biaya layanan, diskon, dan total dari konfigurasi server.
5. Kasir memilih tunai atau pembayaran Midtrans. Untuk kanal online, server membuat transaksi; UI menampilkan instruksi Snap/QRIS.
6. Sistem menandai transaksi lunas hanya setelah notifikasi server Midtrans valid atau pembayaran tunai dikonfirmasi oleh kasir.
7. Kasir mencetak/mengirim struk; status meja dan stok diperbarui secara konsisten.

## 6. Kebutuhan fungsional
- **POS-01:** pencarian berdasarkan nama, SKU, atau kode ruang; filter kategori dan ketersediaan.
- **POS-02:** bon memvalidasi stok dan jadwal/kapasitas ruang sebelum konfirmasi.
- **POS-03:** penghapusan/void setelah pembayaran memerlukan otorisasi dan alasan.
- **ORD-01:** nomor bon unik, item snapshot harga/pajak, kasir, gerai, meja, waktu, serta audit.
- **PAY-01:** total dihitung ulang di server; browser tidak menjadi sumber nilai tagihan.
- **PAY-02:** callback Midtrans memvalidasi signature, environment, nominal, order ID, dan status; callback berulang tidak menggandakan efek.
- **PAY-03:** kunci server dan kredensial service role tidak pernah dikirim ke browser.
- **PAY-04:** Snap dibuat di server dengan total bon yang tersimpan; status akhir hanya berasal dari callback terverifikasi atau pemeriksaan status Midtrans.
- **PAY-05:** pembayaran tunai menandai lunas secara atomik dan memperbarui stok dalam transaksi database.
- **ORD-02:** harga dan total bon dihitung ulang melalui RPC database; aplikasi hanya mengirim product ID dan jumlah.
- **ORD-03:** bon draft tersimpan dengan snapshot harga, dapat diedit oleh kasir pembuat, dan tetap terlihat setelah terminal dimuat ulang.
- **INV-01:** stok berkurang secara atomik setelah transaksi dibayar sesuai kebijakan yang disepakati.
- **SPACE-01:** reservasi menolak bentrok jadwal; aturan buffer, pembatalan, dan durasi minimum masih perlu dipastikan.
- **RPT-01:** laporan MVP menampilkan total per hari, metode pembayaran, dan transaksi yang perlu ditindaklanjuti.

## 7. Data inti (konseptual)
`stores`, `profiles`, `products`, `categories`, `inventory_movements`, `spaces`, `space_reservations`, `orders`, `order_items`, `payments`, `shifts`, `audit_logs`.

Setiap tabel operasional membawa `store_id`; kebijakan Row Level Security membatasi data menurut keanggotaan gerai. Simpan nominal rupiah sebagai integer, waktu dalam UTC, lalu tampilkan menurut zona waktu gerai. Snapshot nama/harga/pajak item disimpan pada order agar histori tidak berubah saat katalog diedit.

## 8. Persyaratan nonfungsional
- Responsif pada desktop kasir, tablet, dan ponsel.
- Perubahan penting transaksi dapat diaudit.
- RLS aktif untuk data tenant; mutasi sensitif dilakukan melalui server/Edge Function.
- Webhook tahan retry dan order ganda.
- Kontras teks dan indikator status memadai; setiap status memakai teks selain warna.
- Target awal: tampilan katalog siap dalam <2 detik pada koneksi normal; checkout memberi respons status yang jelas.

## 9. Kriteria penerimaan MVP
- Kasir berotorisasi dapat menyelesaikan order campuran minuman dan ruang.
- Harga, pajak, diskon, dan total pada struk sama dengan hasil validasi server.
- Dua pembayaran online simultan atau callback berulang tidak membuat order dibayar/ditagih ganda.
- Ruang tidak dapat dipesan pada rentang waktu yang bertabrakan.
- Kasir tidak dapat membaca atau mengubah data gerai lain.
- Notifikasi Midtrans ganda tidak menggandakan perubahan stok atau pelunasan.
- UI memiliki empty/loading/error/success states dan tetap bisa dipakai pada layar tablet.

## 10. Keputusan yang perlu disepakati sebelum transaksi nyata
1. Negara/entitas merchant dan kanal Midtrans yang diaktifkan (QRIS, kartu, transfer, tunai); sandbox dan produksi.
2. Definisi pajak, service charge, diskon member, pembulatan, dan apakah diskon mengurangi basis pajak.
3. Aturan stok: kapan reservasi/penjualan mengurangi stok dan bagaimana void/refund mengembalikan stok.
4. Durasi, harga, buffer, deposit, pembatalan, dan no-show untuk setiap ruang.
5. Bentuk struk, perangkat/printer, nomor urut, retensi data, dan kebijakan refund.
6. Peran, alur tutup shift, serta rekonsiliasi kas.

**Perilaku implementasi sementara:** tarif pajak, layanan, dan diskon dimulai dari 0 basis point. Jika tarif disetel, diskon saat ini mengurangi basis pajak dan layanan; setiap biaya dibulatkan ke rupiah terdekat. Owner perlu mengonfirmasi rumus pajak dan kebijakan diskon sebelum pembayaran produksi diaktifkan.

## 11. Tahapan
1. Validasi aturan bisnis dan akun sandbox.
2. Skema Supabase, Auth/RLS, katalog, ruang, order dan shift.
3. API server untuk kalkulasi, checkout Midtrans, webhook dan audit.
4. Hubungkan UI POS ke data nyata, lalu riwayat dan laporan.
5. Uji sandbox dan operasional gerai, review keamanan, baru siapkan rilis produksi.
