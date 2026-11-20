# Barfas Depo Yönetimi

React arayüzü, Node.js API'si ve MySQL veri tabanı ile geliştirilen yeni depo kontrol uygulaması.

Eski SQL Server yedeği kaynak veri olarak korunur. Yedek dosyalarını bu projeye kopyalamayın; dönüşüm ayrı bir MySQL kopyası üzerinde yapılacaktır.

## Başlatma

1. `docker compose up -d` ile MySQL'i başlatın. Bu komut temel, geçmiş-veri ve yönetim tablolarını ilk açılışta oluşturur.
2. Eski SQL Server dışa aktarımını dönüştürün: `node scripts/convert-sqlserver-export.mjs "C:\\...\\2108StokDb.sql" "database/imports/legacy-import.sql"`.
3. Oluşan `database/imports/legacy-import.sql` dosyasını MySQL'de çalıştırın; sonra `database/mysql/003_promote_legacy_inventory.sql` ve `database/mysql/007_promote_legacy_orders.sql` dosyalarını çalıştırın.
4. `npm run dev` komutunu kullanın.

Yerel Docker MySQL bağlantısı `127.0.0.1:3307` üzerinden çalışır. API için gerekli ayarlar `backend/.env` dosyasında hazırdır. Bu parolalar yalnızca yerel geliştirme içindir; canlı ortama taşınmaz.

Telefon ve el terminali/USB okuyucu kullanımı için [okuyucu ve ağ erişimi](docs/OKUYUCU_VE_AG_ERISIMI.md) belgesine bakın.

Web arayüzü `http://localhost:5173`, API ise `http://localhost:4000` adresinde çalışır.

## Kullanıcı girişi

Uygulama artık kişisel hesapla kullanılır. Giriş ekranındaki `Hesap oluşturun` bağlantısından her depo çalışanı kendi hesabını açabilir. Parolalar hash'lenerek saklanır; giriş yapan kullanıcıya ait oturum olmadan stok ve yönetim API'larına erişilemez.

Yeni stok hareketlerinde işlemi yapan kullanıcı otomatik olarak kaydedilir ve panelde görünür. Eski sistemden aktarılan hareketlerde kullanıcı bilgisi bulunmadığı için `Eski kayıt` gösterilir. Oturumlar 30 gün geçerlidir ve `auth_sessions` tablosu API başlarken otomatik oluşturulur; ayrıca `database/mysql/009_auth_sessions.sql` migration dosyası da eklenmiştir.

Paket ve modül karşılıkları için [teknoloji ve özellik eşleşmesi](docs/TEKNOLOJI_VE_OZELLIK_ESLESMESI.md) belgesine bakın.
