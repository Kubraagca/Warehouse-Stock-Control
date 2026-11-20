# Telefon ve el terminali kullanımı

## Telefon

Telefon aynı Wi-Fi ağına bağlıyken `http://<bilgisayar-ip>:5173` adresini açar. Tüm ilgili ekranlarda bulunan tek **Kamerayla okut** düğmesi canlı kamera akışını açar ve QR/barkodu sürekli tarar.

## El terminali / USB okuyucu

El terminali veya USB okuyucu klavye gibi çalışır. Formdaki `QR / barkod (el terminali veya telefon)` alanı otomatik odaklanır; okuyucu kodu yazıp Enter gönderdiğinde değer hareket kaydına eklenir. Bu nedenle özel bir marka/model sürücüsü gerekmez.

## Ağ ve backend

- Node.js backend `0.0.0.0:4000` üzerinde dinler.
- React geliştirme sunucusu `0.0.0.0:5173` üzerinde dinler.
- Arayüz API adresini cihazın açtığı hostname üzerinden otomatik üretir; telefonda `localhost` yerine bilgisayarın LAN IP'sini kullanır.
- CORS geliştirme ortamında tüm ağ originlerine açıktır. Canlı yayında `ALLOW_ALL_ORIGINS=false` yapılıp izin verilen origin ayrıca tanımlanmalıdır.

Her iki okuyucu tipi de aynı `/api/movements` endpoint'ine gider; stok mantığı ve hareket günlüğü cihazdan bağımsızdır.
