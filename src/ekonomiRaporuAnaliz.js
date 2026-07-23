// Danismanin WhatsApp'tan "BES Fonları" > "Ekonomiye Göre Fon" secenegini
// sectiginde calisir. besFonVerileri.js'teki SABIT fon listesini (kod/ad/
// risk/ana varlik yapisi) baglam olarak verip, Anthropic'in CANLI WEB
// ARAMASI ozelligini (server-side "web_search" tool - bkz. anthropicMesaj.js)
// kullanarak o ANKI (istek zamanindaki) guncel ekonomik durumu
// arastirmasini ve secilen risk profiline uygun, GUNCEL kosullara gore
// dinamik bir fon sepeti onerisi hazirlamasini istiyoruz.
//
// NEDEN CANLI ARAMA (statik/kopyalanmis sayilar yerine)?
// Kullanicinin actikca istedigi sey ("güncel ekonomik verileri ışığında
// özet ekonomi raporu" + "güncel ekonomiye göre dinamik fon sepeti") zaten
// zaman icinde degisen bir seydir - PDF'ten kopyalanacak herhangi bir
// getiri/faiz/kur sayisi bir kac hafta icinde eskir. Bu yuzden fon
// KIMLIKLERI (kod, ad, risk seviyesi, strateji) sabit veriden gelirken,
// EKONOMIK YORUM VE ONERI her istek aninda YENIDEN uretilir.
//
// ONEMLI - 22.07.2026 tarihli "fon sepeti hic gelmiyor, sadece ekonomi
// yorumu var" geri bildirimi ve DUZELTME:
// Eskiden TEK bir API cagrisinda hem "web arastirmasi yap + ekonomi ozeti
// yaz" HEM DE "fon sepeti oner" isteniyordu. Web aramasi + arastirma +
// uzun bir ekonomi yorumu, cagrinin cikti butcesini (max_tokens) once
// tuketebiliyor - bu durumda model Gorev 1'i (ekonomi ozeti) yazip Gorev
// 2'ye (fon sepeti) hic gelemeden "max_tokens" sebebiyle kesiliyordu ve
// pause_turn DEGIL, dogrudan yarim/eksik bir metin donuyordu.
//
// COZUM: iki gorevi birbirinden TAMAMEN BAGIMSIZ iki ayri API cagrisina
// boldum:
//   1) ekonomiOzetiUret(): SADECE web aramasi + kisa ekonomi ozeti ister
//      (kucuk cikti butcesi yeterli, fon sepetiyle yarismiyor).
//   2) fonSepetiUret(): web aramasi ARACI KULLANMAZ (deterministik, hizli,
//      ucuz) - 1. adimdaki ekonomi ozetini baglam olarak alip SADECE fon
//      sepeti onerisini uretir.
// Boylece fon sepeti onerisi, ekonomi ozetinin ne kadar uzun/kisa
// oldugundan BAGIMSIZ olarak HER ZAMAN ayri ve garantili uretilir. Nihai
// mesaj metni de (basliklar dahil) burada, JS tarafinda birlestirilir -
// modelin format talimatina uyup uymamasina birakilmaz.
//
// ANTHROPIC_API_KEY ortam degiskeni gerektirir (diger analiz dosyalariyla
// - ruhsatAnaliz.js, belgeAnaliz.js, satisSozlesmesiAnaliz.js - AYNI
// gereksinim). Tanimli degilse ya da API bir hata donerse hata firlatir;
// cagiran taraf (advisorEngine.js) kullaniciya "şu an hazırlayamadım"
// tarzi guvenli bir mesajla geri donmeli.
//
// Bu, kesinlikle bir YATIRIM TAVSIYESI degildir - hem promptlarda hem de
// asagidaki YASAL_UYARI sabitiyle (donen metnin SONUNA HER ZAMAN, modelin
// ne yazdigina bakilmaksizin programatik olarak eklenir) bu acikca
// belirtilir.

const { mesajGonder } = require("./anthropicMesaj");

const YASAL_UYARI =
  "\n\n⚠️ Bu içerik yapay zeka tarafından, istek anındaki güncel web verileri kullanılarak otomatik oluşturulmuştur. " +
  "Genel bilgilendirme amaçlıdır, yatırım danışmanlığı ya da kesin getiri taahhüdü niteliği taşımaz. " +
  "Kesin işlem kararından önce güncel fon fiyatlarını ve resmi verileri Garanti Emeklilik/KAP üzerinden teyit ediniz.";

// ADIM 1: SADECE guncel ekonomi ozeti (web aramasi ile). Kucuk cikti
// butcesi (maxTokens) bilerek dar tutuluyor ki fon sepeti adimiyla asla
// "yer" icin yarismasin.
async function ekonomiOzetiUret(apiKey, bugun) {
  const prompt =
    `Bugünün tarihi: ${bugun}. Web araması yaparak bugüne en yakın güncel verilerle Türkiye ekonomisindeki durumu ` +
    `özetle: TCMB politika faizi/son faiz kararı, TÜFE (enflasyon) son durumu ve trendi, USD/TRY ve EUR/TRY ` +
    `kurunun durumu, BIST 100 endeksinin son durumu/trendi, ve varsa piyasaları etkileyebilecek önemli küresel/` +
    `jeopolitik gelişmeler.\n\n` +
    `SADECE 4-6 cümlelik, WhatsApp'ta okunacak sade bir Türkçe özet metni yaz - madde imi/liste/başlık KULLANMA, ` +
    `akıcı bir paragraf yaz, başında/sonunda başka açıklama ekleme.`;

  return mesajGonder(apiKey, prompt, { aramaAktif: true, maxTokens: 1024 });
}

// ADIM 2: SADECE fon sepeti onerisi - web aramasi KULLANMAZ, adim 1'in
// ekonomi ozetini baglam olarak alir. Bu adim aramadan bagimsiz oldugu
// icin hizli ve deterministiktir, cikti butcesi sorunu yasama ihtimali
// cok dusuktur.
async function fonSepetiUret(apiKey, riskProfili, fonListesi, ekonomiOzeti) {
  const fonListesiMetni = fonListesi
    .map((f) => `- ${f.kod} (${f.ad}) | Risk: ${f.riskDegeri}/7 | ${f.anaVarlikYapisi}`)
    .join("\n");

  const prompt =
    `Aşağıda Garanti Emeklilik'in BES fonlarının SABİT listesi var (kod, ad, risk seviyesi 1-7, ana varlık yapısı):\n\n` +
    `${fonListesiMetni}\n\n` +
    `Güncel ekonomik durum özeti (az önce ayrıca araştırıldı, doğru kabul et):\n"${ekonomiOzeti}"\n\n` +
    `Danışmanın müşterisi için seçtiği risk profili: "${riskProfili}".\n\n` +
    `SADECE yukarıdaki listede yer alan fon KODLARINI kullanarak (yeni/uydurma kod ÜRETME), bu risk profiline VE ` +
    `yukarıdaki güncel ekonomik duruma uygun 2-4 fonluk bir sepet öner (yüzdeler toplamı %100 olmalı).\n\n` +
    `YANIT FORMATI (düz metin, başında/sonunda başka açıklama olmadan, HER FON İÇİN AYRI BİR SATIR):\n` +
    `• KOD (%yüzde) - güncel ekonomik duruma atıfta bulunan 1 cümlelik gerekçe\n\n` +
    `Örnek bir satır: "• GEK (%50) - Politika faizinin sabit kalması tahvil/bono getirisini destekliyor."`;

  return mesajGonder(apiKey, prompt, { aramaAktif: false, maxTokens: 800 });
}

// ONEMLI - 22.07.2026 tarihli "hala fon sepeti gelmiyor" geri bildirimi ve
// IKINCI DUZELTME:
// Iki adimi ayri API cagrilarina bolmek (yukaridaki not) tek basina yeterli
// olmadi - cunku iki adimin metni yine de TEK bir WhatsApp mesajinda
// birlestirilip gonderiliyordu. Ekonomi ozeti (4-6 cumle, arama sonuclarina
// gore bazen uzun) + fon sepeti + yasal uyari bir araya gelince, WhatsApp'in
// tek mesaj karakter sinirina (~4096) yaklasip mesajin gonderimde kesilmesi/
// reddedilmesi mumkundu - bu da "sadece ekonomi ozeti goruluyor, fon sepeti
// hic gelmiyor" olarak yansiyordu (fon sepeti mesajin İKİNCİ yarisinda
// oldugu icin kesintiden ilk etkilenen kisimdi).
//
// COZUM: bu fonksiyon artik TEK bir birlesik metin degil, BIRBIRINDEN
// BAGIMSIZ IKI AYRI MESAJ metni doner - cagiran taraf (advisorEngine.js)
// bunlari IKI AYRI sendText cagrisiyla gonderir. Boylece ekonomi ozeti ne
// kadar uzun olursa olsun, fon sepeti mesaji KENDI BASINA (kisa ve sabit
// bir uzunlukta) her zaman ayakta kalir.
async function ekonomiRaporuVeFonSepetiUret(riskProfili, fonListesi) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil - ekonomi raporu/fon sepeti ozelligi devre disi.");
  }

  const bugun = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", year: "numeric", month: "long", day: "numeric" });

  const ekonomiOzeti = await ekonomiOzetiUret(apiKey, bugun);
  const fonSepeti = await fonSepetiUret(apiKey, riskProfili, fonListesi, ekonomiOzeti);

  return {
    ekonomiMesaji: `📊 *Güncel Ekonomi Özeti* (${bugun})\n${ekonomiOzeti}`,
    fonSepetiMesaji: `💼 *${riskProfili} Risk Profili İçin Fon Sepeti Önerisi*\n${fonSepeti}${YASAL_UYARI}`
  };
}

module.exports = { ekonomiRaporuVeFonSepetiUret };
