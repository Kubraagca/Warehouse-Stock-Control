# Teknoloji ve özellik eşleşmesi

Bu projede eklenen her araç doğrudan bir iş ihtiyacına bağlanır. Kullanılmayan teknoloji eklenmez.

| Eklenen araç | Projedeki karşılığı | Neden gerekli |
| --- | --- | --- |
| React | Operasyon ekranları: panel, ürünler, giriş/çıkış, QR/barkod, sayım | Hızlı ve sade, tek sayfa iş akışı |
| Vite | React geliştirme ve üretim paketi | React arayüzünün derlenmesi ve yerelde çalışması |
| Node.js + Express | `/api/health`, `/api/dashboard`, `/api/products` uçları | Arayüz ve MySQL arasında güvenli iş katmanı |
| MySQL + mysql2 | Ürün, cihaz, depo/raf, hareket ve eski veri tabloları | Kalıcı veri ve hareket geçmişi |
| dotenv | `backend/.env` bağlantı ayarları | Şifre ve bağlantı bilgisini koddan ayırır |
| cors | Web arayüzünün API'ye erişimi | React ve API yerelde farklı portlarda çalışır |
| zod | Ürün oluşturma ve hareket formu doğrulaması | Eksik/hatalı stok verisinin kaydedilmesini önler |
| qrcode | QR/barkod ekranında QR etiketi üretme | Cihaz veya ürün etiketinin basılması |
| @zxing/browser | QR/barkod ekranında kamera ile okutma | Depo giriş/çıkışında hızlı ürün bulma |
| lucide-react | Buton ve menü ikonları | Metin ağırlığını azaltan, anlaşılır arayüz |
| concurrently | Tek `npm run dev` ile API + web'i başlatma | Yerel geliştirme kolaylığı |

## İş akışı karşılıkları

| İş akışı | Arayüz karşılığı | API / veri karşılığı |
| --- | --- | --- |
| Stok kartı | Ürünler | `products` |
| Tekil cihaz / seri no | Cihazlar | `inventory_units` |
| Depo konumu | Depolar ve raflar | `warehouses`, `locations` |
| Mal kabul | Stok girişi | `inventory_movements` (`IN`) |
| Sevk / kullanım / zimmet | Stok çıkışı | `inventory_movements` (`OUT`) + çıkış nedeni / teslim alan |
| Depolar arası aktarım | Transfer | `inventory_movements` (`TRANSFER_OUT`, `TRANSFER_IN`) |
| İade | İade kabulü | `inventory_movements` (`RETURN`) |
| Sayım | Sayım | `inventory_movements` (`COUNT_ADJUSTMENT`) |
| QR/barkod | Etiket merkezi | `inventory_units.code_value` |
| Eski sipariş / iade / tedarik geçmişi | Geçmiş kayıtlar | `legacy_*` tabloları |
| Yönetim | Kategori, tedarikçi, müşteri, sipariş, emanet ve rapor alt sekmeleri | `categories`, `suppliers`, `customers`, `orders`, `loan_records` |
