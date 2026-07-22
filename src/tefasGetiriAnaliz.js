// "BES Fonları" > "Fon Listesini Gör" secildiginde, besFonVerileri.js'teki
// SABIT fon kodlarinin GUNCEL getiri yuzdelerini arastirmak icin
// Anthropic'in CANLI WEB ARAMASI ozelligini kullanir (bkz. anthropicMesaj.js).
// Oncelikli kaynak olarak Garanti BBVA Emeklilik'in KENDI resmi "BES Fon
// Getirileri" sayfasi (garantibbvaemeklilik.com.tr) verilir - bu fonlarin
// dogrudan ihraccisi/yoneticisi oldugu icin en yetkili kaynak budur. Ikincil
// kaynak olarak www.tefas.gov.tr (Türkiye Elektronik Fon Alım Satım
// Platformu - tum Türkiye fonlarinin resmi/guncel fiyat ve getiri
// bilgilerinin yayinlandigi devlet destekli platform) ve bu veriyi yansitan
// diger guvenilir finans kaynaklari kullanilir.
//
// ONEMLI - BU KESIN/DOGRULANMIS BIR VERI DEGILDIR:
// Hem Garanti'nin hem TEFAS'in kendi sitelerindeki getiri tablolari
// genellikle kullanicinin fon secip tarih araligi belirledigi ETKILESIMLI
// (JavaScript ile calisan) araclardir - dogrudan bir "sayfayi getir"
// istegiyle bu tablolarin icini okuyamayiz (web_search araci sayfalari
// CALISTIRMAZ, sadece indekslenmis/taranmis icerikte arama yapar). Bunun
// yerine web aramasi ile "en iyi caba" (best-effort) bir tahmin
// uretiyoruz - arama sonuclarina dayanir, bazen eksik/yaklasik olabilir.
// Bu yuzden:
// - Cagiran taraf (advisorEngine.js), bu fonksiyon hata verirse ya da hic
//   getiri bulamazsa FON LISTESINI YINE DE GOSTERMEYE DEVAM ETMELI - getiri
//   verisi "olursa iyi olur" bir ek, olmazsa olmaz degil.
// - Danismana gosterilen metinde HER ZAMAN "yaklasik/AI kaynakli, kesin
//   rakam icin Garanti/TEFAS sitesini kontrol edin" notu bulunmali (bkz.
//   advisorEngine.js besFonListesiGoster).
// - Prompt, modelin bilmedigi fonlar icin sayi UYDURMAMASINI acikca ister.

const { mesajGonder } = require("./anthropicMesaj");

async function fonGetirileriniGetir(fonKodlari) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil - fon getirisi arama ozelligi devre disi.");
  }

  const prompt =
    `Önce https://www.garantibbvaemeklilik.com.tr/urunler/emeklilik-yatirim-fonlarimiz/bes-fon-getirileri sayfasına ` +
    `(Garanti BBVA Emeklilik'in kendi resmi BES fon getirileri sayfası) bak; orada bulamazsan www.tefas.gov.tr ` +
    `(Türkiye Elektronik Fon Alım Satım Platformu) sitesine ve/veya bu veriyi yansıtan güvenilir finans ` +
    `kaynaklarına bak. Aşağıdaki Garanti Emeklilik BES fon kodlarının GÜNCEL getiri yüzdelerini ara (mümkünse ` +
    `son 1 yıllık getiri, bulamazsan yıl başından bugüne/YBB getiri kullan):\n\n` +
    `${fonKodlari.join(", ")}\n\n` +
    `SADECE aşağıdaki formatta, HER FON İÇİN AYRI BİR SATIRDA cevap ver, başka açıklama/başlık ekleme:\n` +
    `KOD: %getiri (dönem)\n` +
    `Örnek: "GEL: %38.2 (son 1 yıl)"\n\n` +
    `Bir fon için güvenilir bir sayı bulamazsan KESİNLİKLE UYDURMA - o satırda "KOD: veri yok" yaz.`;

  const metin = await mesajGonder(apiKey, prompt, { aramaAktif: true, maxTokens: 1200, maxAramaKullanimi: 8 });

  const getiriHaritasi = {};
  const satirRegex = /^([A-ZÇĞİÖŞÜ]{2,5})\s*:\s*(.+)$/gm;
  let eslesme;
  while ((eslesme = satirRegex.exec(metin)) !== null) {
    const kod = eslesme[1].trim();
    const deger = eslesme[2].trim();
    if (fonKodlari.includes(kod) && !/veri yok/i.test(deger)) {
      getiriHaritasi[kod] = deger;
    }
  }
  return getiriHaritasi;
}

module.exports = { fonGetirileriniGetir };
