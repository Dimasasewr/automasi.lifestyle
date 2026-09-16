# KARSA Finance — Mobile First / Responsive

Finance system PT Karsa Lifestyle Nusantara dengan Supabase Auth + PostgreSQL + double-entry journal.

## V4 perubahan utama
- Mobile-first: layar kecil/HP/tablet tetap dapat digunakan.
- Menu hamburger berisi kelompok Keuangan, Operasional, Akuntansi, Master.
- Dashboard tidak lagi muncul di menu hamburger; Dashboard tetap tersedia di navigasi utama dan menjadi halaman awal.
- Navigasi utama: Dashboard, + Transaksi, Saldo Awal, Penjualan, Pembelian.
- Input nominal otomatis memakai format Indonesia: `1.000`, `25.000`, `1.000.000`.
- Koreksi input tersedia melalui tombol **Edit** pada transaksi, penjualan, pembelian, dan produk.
- Koreksi transaksi memperbarui jurnal pasangan terkait melalui RPC Supabase.
- Export CSV UTF-8 untuk pertukaran data Excel/Google Sheets.
- Workbook XLSX profesional berisi Petunjuk, Transaksi, Penjualan, Pembelian, Piutang, Hutang, Produk/HPP, Stok, Jurnal Profesional, Akun, Kas/Bank, rumus Kas, HPP, Laba/Rugi dan Arus Kas.
- Sheet jurnal dan laporan dibuat siap filter, freeze header, dan perhitungan formula.
- Tidak ada pendaftaran publik. User dibuat melalui Supabase Authentication.

## Instalasi
1. Jalankan **supabase-schema.sql** di Supabase SQL Editor. **Ini satu-satunya file SQL yang diperlukan.**
2. Pastikan user Finance sudah dibuat di Supabase Authentication.
3. Isi `config.js` dengan Project URL + Publishable key.
4. Deploy folder ini ke Vercel/hosting statis.

## Catatan akuntansi
Sistem melakukan double-entry pada transaksi yang diposting. Koreksi transaksi dilakukan melalui RPC agar data transaksi dan jurnal tetap sinkron. Untuk pembukuan resmi, pajak, dan kebijakan saldo awal, tetap lakukan review dengan akuntan/penanggung jawab keuangan perusahaan.
