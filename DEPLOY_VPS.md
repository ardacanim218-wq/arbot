# ArBot VPS Kurulumu

Bilgisayar kapaliyken de botun acik kalmasi icin ArBot'u bir VPS uzerinde calistirman gerekir. En pratik yol Ubuntu tabanli bir sunucu ve PM2 kullanmaktir.

## Onerilen yapi

- Ubuntu 22.04 veya 24.04
- En az 2 GB RAM
- Node.js 20+
- Chromium
- PM2

## 1. Sunucuya baglan

```bash
ssh root@SUNUCU_IP
```

## 2. Sistem paketlerini kur

```bash
apt update && apt upgrade -y
apt install -y git curl unzip ca-certificates fonts-liberation libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libu2f-udev libvulkan1 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 xdg-utils
```

## 3. Node.js kur

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

## 4. PM2 kur

```bash
npm install -g pm2
```

## 5. Projeyi sunucuya al

```bash
mkdir -p /opt/arbot
cd /opt/arbot
```

Buraya projeyi `git clone` ile cekebilir veya dosyalari yukleyebilirsin.

## 6. Projeyi kur

```bash
cd /opt/arbot
npm install
```

`.env` dosyasinin kopyalandigindan emin ol.

## 7. PM2 ile baslat

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

`pm2 startup` komutu sana bir ek komut verir. Onu da calistirirsan sunucu yeniden basladiginda bot otomatik acilir.

## 8. QR ile WhatsApp bagla

Ilk kurulumda QR gorebilmek icin gecici olarak:

```bash
pm2 logs arbot
```

veya daha guvenli yontemle ilk baglantiyi bir ekran oturumunda yap:

```bash
pm2 stop arbot
node src/index.js
```

QR okutulduktan sonra `Ctrl + C` ile cik ve tekrar PM2 ile baslat:

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Notlar

- Bot oturumu `.wwebjs_auth` klasorunde tutulur. Bu klasoru silme.
- Sunucu kapanip acilsa bile PM2 botu tekrar kaldirir.
- Gercek 7/24 calisma icin VPS'in surekli acik ve internete bagli olmasi gerekir.
