# Sigorta Acentesi WhatsApp Bilgi Toplama Botu

Bu bot, WhatsApp uzerinden gelen sigorta urun taleplerini otomatik karsilar:
1. Musteriye hangi urunle ilgilendigi sorulur (Kasko, Trafik, Saglik, DASK, Konut, Seyahat).
2. Secilen urune ozel sorular sirayla sorulur.
3. Tum cevaplar toplandiginda musteriye ozet gonderilir ve ayni ozet otomatik olarak
   sizin/ekibinizin WhatsApp numarasina iletilir, boylece teklif hazirlamaya hemen baslayabilirsiniz.
4. Musteri istedigi an "temsilci" yazarak botu durdurup bir insanla gorusme talep edebilir.
5. Ekibiniz `/panel` adresinden (orn. https://numaraniz.up.railway.app/panel) tum konusmalari
   gorebilir, botu konusma bazinda duraklatip devam ettirebilir ve musteriye elle mesaj yazabilir.
   Bu, telefonda WhatsApp Business App'e ihtiyac duymadan, sirf tarayicidan calisir.

Not: Bu bot sadece **bilgi toplama** adimini otomatiklestirir. Teklif hesaplama/hazirlama
adimi bu surumde manuel kalir (istersen ilerleyen asamada sigorta sirketlerinin teklif
API'lerine baglayip bu kismi da otomatiklestirebiliriz).

## Kullanilan Teknoloji

- **Meta WhatsApp Business Cloud API** (resmi, ucretsiz test kotasi var, ticari kullanima uygun)
- Node.js + Express (webhook sunucusu)

Neden resmi API? whatsapp-web.js / Baileys gibi gayriresmi kutuphaneler numaranizin
banlanma riski tasir ve ticari/kurumsal kullanim icin uygun degildir. Sigorta gibi
regule bir sektorde resmi API kullanmaniz onemle tavsiye edilir.

## Kurulum Adimlari

### 1. Meta Business hesabi ve WhatsApp API erisimi

1. https://developers.facebook.com adresinden bir Meta Developer hesabi acin.
2. "My Apps" > "Create App" > "Business" turunde bir uygulama olusturun.
3. Uygulamaya **WhatsApp** urununu ekleyin.
4. Test icin Meta size ucretsiz bir test telefon numarasi verir. Gercek kullanim icin
   kendi isletme numaranizi (WhatsApp Business hesabiniza kayitli) dogrulamaniz gerekir.
5. "API Setup" sayfasindan asagidaki bilgileri not edin:
   - **Temporary/Permanent Access Token** -> `.env` dosyasinda `WHATSAPP_TOKEN`
   - **Phone Number ID** -> `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** -> `WHATSAPP_BUSINESS_ACCOUNT_ID`
6. Kalici token icin System User olusturup uzun omurlu bir token uretmeniz onerilir
   (gecici token 24 saatte bir yenilenir).

### 2. Projeyi kurun

```bash
npm install
cp .env.example .env
```

`.env` dosyasini kendi bilgilerinizle doldurun. `VERIFY_TOKEN` alanina kendi
belirleyeceginiz herhangi guclu bir rastgele metni yazabilirsiniz (webhook
dogrulamasinda kullanilacak). `AGENT_WHATSAPP_NUMBER` alanina toplanan
bilgilerin iletilecegi ekip/acente numarasini yazin (basinda ulke kodu ile,
orn: 905551234567).

### 3. Sunucuyu calistirin

```bash
npm start
```

Sunucu varsayilan olarak `3000` portunda calisir.

### 4. Yerelde test icin ngrok kullanin

Meta'nin webhook'u erisebilmesi icin sunucunuzun internetten erisilebilir bir
URL'i olmasi gerekir. Gelistirme asamasinda ngrok kullanabilirsiniz:

```bash
ngrok http 3000
```

ngrok size `https://xxxx.ngrok-free.app` gibi bir adres verecek.

### 5. Webhook'u Meta panelinde kaydedin

1. Meta App > WhatsApp > Configuration > Webhook bolumune gidin.
2. Callback URL: `https://xxxx.ngrok-free.app/webhook`
3. Verify Token: `.env` dosyasindaki `VERIFY_TOKEN` ile ayni degeri girin.
4. "Verify and Save" tiklayin.
5. Webhook Fields kisminda `messages` alanini abone edin (subscribe).

### 6. Canliya alma (production)

Yerel bilgisayar + ngrok sadece test icindir. Gercek kullanimda sunucuyu
Railway, Render, DigitalOcean, veya kendi VPS'inize deploy edip, sabit bir
HTTPS domain'i webhook URL'i olarak Meta'ya kaydetmeniz gerekir. Ortam
degiskenlerini (`.env` icerigini) sunucu saglayicinizin "Environment
Variables" bolumune girin.

## Yeni urun / soru eklemek

`src/flows.js` dosyasini acin, mevcut urunlerdeki gibi yeni bir key ve
`questions` dizisi ekleyin. Kod tarafinda baska hicbir degisiklik gerekmez,
bot yeni urunu otomatik olarak listede gosterir.

## Ileride eklenebilecekler

- Toplanan verileri bir Google Sheet / CRM'e otomatik kaydetme
- Musteriye dosya/gorsel yukletme (orn. ruhsat fotografi)
- Anlik teklif hesaplama entegrasyonu (sigorta sirketi API'leri ile)
- Kalici oturum deposu (Redis) - su an bellek icinde tutuluyor, sunucu
  yeniden baslarsa yarim kalan konusmalar sifirlanir.
