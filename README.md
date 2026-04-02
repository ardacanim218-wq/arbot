# ArBot

ArBot, WhatsApp gruplari icin hazirlanmis profesyonel bir moderasyon botudur. Ana hedefi grup yonetimini kolaylastirmak, yetkileri kontrol altina almak ve uyeleri duzenli sekilde yonetmektir.

## Temel kurallar

- Bot adi `ArBot`
- Sahip `Arda Gurbuz`
- Sahip numarasi `905319678514`
- Bot kimseye kendiliginden ozel mesaj baslatmaz
- Ozelden yazan kisiye cevap verebilir
- Grup komutlarini sadece grup adminleri, owner veya owner tarafindan eklenen bot yetkilileri kullanabilir
- Istersen sadece belirli gruplarda calisacak sekilde sinirlandirilabilir

## Komutlar

- `!yardim`
- `!owner`
- `!durum`
- `!kurallar`
- `!adminler`
- `!uyar @kullanici sebep`
- `!sustur @kullanici 30dk sebep`
- `!ac @kullanici`
- `!ban @kullanici sebep`
- `!cezalar @kullanici`
- `!yetkiliekle @kullanici`
- `!yetkilisil @kullanici`
- `!yetkililer`
- `!grupbilgi`

## Susturma mantigi

WhatsApp gruplarinda klasik anlamda sunucu tarafli `mute` yoktur. ArBot susturulan kisiyi kayda alir; susturma suresi devam ederken gruba yazdiginda mesaji silmeyi dener ve uyari verir.

## Kurulum

```powershell
npm install
```

Sonra ortam degiskenlerini ayarlayin:

```powershell
Copy-Item .env.example .env
```

Ardindan botu baslatin:

```powershell
npm start
```

Ilk acilista terminalde bir QR kod gorunur. WhatsApp bagli cihazlar ekranindan kodu okutup giris yapabilirsiniz.

Belirli gruplarda calistirmak istersen `.env` icine su alanlardan birini yaz:

```powershell
ALLOWED_GROUP_IDS=1203634....@g.us
```

veya

```powershell
ALLOWED_GROUP_NAMES=Osmaniye 2. El Alim Satim
```

`!grupbilgi` komutu ile grup adini ve grup ID bilgisini gorebilirsin.

## Notlar

- `!ban` komutunun calismasi icin botun ilgili grupta admin olmasi gerekir.
- `!sustur` sirasinda mesaj silme isleminin basarili olmasi icin botun grup yoneticisi olmasi onerilir.
- Owner numarasini `.env` icinde degistirerek baska bir hesaba tasiyabilirsiniz.

## 7/24 Calisma

Bilgisayarin kapaliyken de botun calismasi icin projeyi bir VPS'e tasiman gerekir. Hazir sunucu kurulumu icin [DEPLOY_VPS.md](C:/Users/cenne/OneDrive/Belgeler/New%20project/DEPLOY_VPS.md) dosyasini kullanabilirsin.
