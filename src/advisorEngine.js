// Danismanlarin, panele hic girmeden, dogrudan WhatsApp uzerinden:
// 1) Kendi taleplerini gormesini, not eklemesini, durum degistirmesini,
//    hatirlatma kurmasini,
// 2) Musteri (sigortali) adina YENI bir talep olusturmasini
// saglar. Bir mesaj bilinen bir danisman numarasindan geldiginde, server.js
// bu modulu cagirir - musteri akisina (conversationEngine) hic girmez,
// tamamen ayri bir menu sistemidir.

const fs = require("fs");
const path = require("path");
const { getSession } = require("./sessionStore");
const { sendText, sendButtons, sendList, sendDocument, mediaIndir } = require("./loggedWhatsapp");
const leadStore = require("./leadStore");
const yenilemeStore = require("./yenilemeStore");
const dokumanStore = require("./dokumanStore");
const { dosyaTuruIzinliMi } = require("./izinliDosyaTurleri");
const { garantiEmekliligeGonder } = require("./eposta");
const {
  tcKimlikGecerliMi,
  tarihGecerliMi,
  plakaGecerliMi,
  yenilemeTarihiGecerliMi,
  tarihiMsYap,
  bosDegilMi,
  adSoyadGecerliMi,
  telefonGecerliMi,
  epostaGecerliMi,
  primTutariGecerliMi,
  saatAraligiGecerliMi
} = require("./validators");
const flows = require("./flows");
const conversationEngine = require("./conversationEngine");
const { belgeleriTekPdfeBirlestir } = require("./pdfBirlestir");
const { belgeFotografiAnalizEt } = require("./belgeAnaliz");

// Elinde "Trafik Sigortası" ya da "Kasko Sigortası" gecen urun etiketleri
// icin, yenileme eklerken ayrica plaka soruyoruz (diger urunlerde anlamsiz).
const PLAKA_ISTENEN_URUN_ETIKETLERI = ["Trafik Sigortası", "Kasko Sigortası"];

// Bir talebin/kaydin "urun" alanindaki serbest metinden (orn. "Standart Prim
// İadeli Hayat Sigortası") hangi flows.js urunune ait oldugunu bulur -
// Satis Kaydi gibi akislarda urun adi paket ismiyle birlestirilip
// kaydedildigi icin tam esitlik yerine "icerir mi" kontrolu yapiyoruz.
function flowBulUrunAdindan(urunAdi) {
  if (!urunAdi) return null;
  return Object.values(flows).find((f) => urunAdi.includes(f.label)) || null;
}

// --- Satis Kaydi: Prim Iadeli Hayat Sigortasi / BES (Yeni Is) ---
// Musteri urunu satin almaya karar verdikten SONRA (satis asamasi) doldurulan,
// Garanti Emeklilik'in bekledigi tam formatta bilgi toplayan ayri bir akis.
// Mevcut "Yeni İş Talebi" (teklif talebi) akisindan tamamen bagimsizdir.
// NOT: BES'te "Aktarım" henuz desteklenmiyor - sadece "Yeni İş" calisiyor,
// Aktarım secilirse yakinda eklenecegi soylenip ana menuye donuluyor.
// Belgeler adimina gelindiginde, danismanin musteriye yazdirip imzalatmasi
// icin Garanti'nin bos sablon formlarini (Acik Riza Metni + Imza Karti)
// otomatik olarak gonderiyoruz - boylece danisman bunlari ayrica aramak
// zorunda kalmiyor.
const SABIT_SABLONLAR = [
  { dosyaYolu: path.join(__dirname, "sablonlar", "acik_riza_metni.pdf"), dosyaAdi: "Garanti Açık Rıza Metni.pdf" },
  { dosyaYolu: path.join(__dirname, "sablonlar", "imza_karti.pdf"), dosyaAdi: "İletişim Bilgileri ve Islak İmza Kartı.pdf" }
];

async function sabitSablonlariGonder(from) {
  for (const sablon of SABIT_SABLONLAR) {
    try {
      const buffer = fs.readFileSync(sablon.dosyaYolu);
      await sendDocument(from, buffer, "application/pdf", sablon.dosyaAdi);
    } catch (err) {
      console.error(`Sabit sablon gonderilemedi (${sablon.dosyaAdi}):`, err.message);
    }
  }
}

const SATIS_SORULARI_HAYAT = [
  { id: "paket", text: "Hangi paket için satış kaydı oluşturuyorsunuz?", type: "choice", options: ["Standart", "Premium"] },
  {
    id: "musteri_ad_soyad",
    text: "Müşterinin adını ve soyadını paylaşır mısınız?",
    type: "text",
    validate: adSoyadGecerliMi,
    validationError: "Lütfen adı ve soyadı birlikte yazar mısınız? (Örn: Ahmet Yılmaz)"
  },
  {
    id: "sigortali_tck",
    text: "Sigortalının T.C. kimlik numarasını paylaşır mısınız?",
    type: "text",
    validate: tcKimlikGecerliMi,
    validationError: "Girilen T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
  },
  {
    id: "sigortali_dogum_tarihi",
    text: "Sigortalının doğum tarihini paylaşır mısınız? (GG.AA.YYYY)",
    type: "text",
    validate: tarihGecerliMi,
    validationError: "Lütfen tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 04.08.1997)"
  },
  {
    id: "sigortali_cinsiyet",
    text: "Sigortalının cinsiyeti nedir?",
    type: "choice",
    options: ["Kadın", "Erkek"]
  },
  {
    id: "sigortali_uyruk",
    text: "Sigortalının uyruğunu paylaşır mısınız? (Örn: T.C.)",
    type: "text",
    validate: bosDegilMi,
    validationError: "Bu alanı boş bırakamayız, lütfen sigortalının uyruğunu paylaşır mısınız?"
  },
  {
    id: "sigortali_dogum_yeri",
    text: "Sigortalının doğum yerini paylaşır mısınız? (Örn: Adana)",
    type: "text",
    validate: bosDegilMi,
    validationError: "Bu alanı boş bırakamayız, lütfen sigortalının doğum yerini paylaşır mısınız?"
  },
  {
    id: "odeyen_farkli_mi",
    text: "Primi ödeyecek kişi sigortalının kendisi mi?",
    type: "choice",
    options: ["Evet, Kendisi", "Hayır, Farklı Biri"]
  },
  {
    id: "odeyen_ad_soyad",
    text: "Ödeyecek kişinin adını ve soyadını paylaşır mısınız?",
    type: "text",
    validate: adSoyadGecerliMi,
    validationError: "Lütfen adı ve soyadı birlikte yazar mısınız? (Örn: Ahmet Yılmaz)",
    skipIf: (a) => a.odeyen_farkli_mi !== "Hayır, Farklı Biri"
  },
  {
    id: "odeyen_tck",
    text: "Ödeyecek kişinin T.C. kimlik numarasını paylaşır mısınız?",
    type: "text",
    validate: tcKimlikGecerliMi,
    validationError: "Girilen T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?",
    skipIf: (a) => a.odeyen_farkli_mi !== "Hayır, Farklı Biri"
  },
  { id: "odeme_araci", text: "Ödeme aracı nedir?", type: "choice", options: ["Kredi Kartı", "Garanti Bankası Hesabı"] },
  {
    id: "odeme_donemi",
    text: "Ödeme dönemi nedir? (Poliçe süresi boyunca değiştirilemeyecek, dikkatli seçin)",
    type: "choice",
    options: ["Aylık", "Üç Aylık", "Altı Aylık", "Yıllık"]
  },
  {
    id: "prim_tutari",
    text: (a) => `Hesaplayıcıdan bulduğunuz ${a.odeme_donemi || ""} prim tutarını paylaşır mısınız? (Örn: USD 450,00)`,
    type: "text",
    validate: primTutariGecerliMi,
    validationError: "Bu bir prim tutarı gibi görünmüyor, lütfen rakamla birlikte tekrar yazar mısınız? (Örn: USD 450,00)"
  },
  // Sadece Hayat'ta soruluyor (BES listesine dahil edilmiyor, asagida
  // SATIS_SORULARI_BES_YENI_IS filtrelemesine bakin) - vefat teminatini
  // artik ekip degil, danisman kendisi (web sitemizden) hesaplayip giriyor.
  {
    id: "vefat_teminati",
    text: "Prim tutarına göre web sitemizden hesapladığınız vefat teminatını paylaşır mısınız?",
    type: "text",
    validate: primTutariGecerliMi,
    validationError: "Bu bir tutar gibi görünmüyor, lütfen vefat teminatını rakamla birlikte tekrar yazar mısınız?"
  },
  {
    id: "sigortali_cep",
    text: "Sigortalının cep telefonu numarasını paylaşır mısınız?",
    type: "text",
    validate: telefonGecerliMi,
    validationError: "Girilen cep telefonu numarası geçerli görünmüyor, lütfen tekrar yazar mısınız? (Örn: 0555 123 45 67)"
  },
  {
    id: "sigortali_eposta",
    text: "Sigortalının e-posta adresini paylaşır mısınız?",
    type: "text",
    validate: epostaGecerliMi,
    validationError: "Girilen e-posta adresi geçerli görünmüyor, lütfen tekrar yazar mısınız?"
  },
  {
    id: "odeyen_cep",
    text: "Ödeyecek kişinin cep telefonu numarasını paylaşır mısınız?",
    type: "text",
    validate: telefonGecerliMi,
    validationError: "Girilen cep telefonu numarası geçerli görünmüyor, lütfen tekrar yazar mısınız? (Örn: 0555 123 45 67)",
    skipIf: (a) => a.odeyen_farkli_mi !== "Hayır, Farklı Biri"
  },
  {
    id: "odeyen_eposta",
    text: "Ödeyecek kişinin e-posta adresini paylaşır mısınız?",
    type: "text",
    validate: epostaGecerliMi,
    validationError: "Girilen e-posta adresi geçerli görünmüyor, lütfen tekrar yazar mısınız?",
    skipIf: (a) => a.odeyen_farkli_mi !== "Hayır, Farklı Biri"
  },
  // Garanti Emeklilik'in cagri merkezi musteriyi bu tarih/saat araliginda
  // arayacak - mailin en ustunde bir cumle olarak ozetleniyor (bkz.
  // satisTamamla'daki acilisMetni).
  {
    id: "arama_tarihi",
    text: "Müşterinin hangi tarihte aranmasını istersiniz? (GG.AA.YYYY)",
    type: "text",
    validate: yenilemeTarihiGecerliMi,
    validationError: "Lütfen tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 21.07.2026)"
  },
  {
    id: "arama_saat_araligi",
    text: "Hangi saat aralığında aranmasını istersiniz? (08:00-18:00 arası, Örn: 14:00-16:00)",
    type: "text",
    validate: saatAraligiGecerliMi,
    validationError:
      "Aramalar sadece 08:00-18:00 arasında yapılabiliyor, lütfen bu aralıkta bir saat aralığı yazar mısınız? (Örn: 14:00-16:00)"
  },
  // Son 5 soru: her biri tek bir belgenin FOTOĞRAFINI sırasıyla ister (PDF/
  // döküman değil - kamera ya da galeriden seçilen bir fotoğraf her zaman
  // WhatsApp'ın kendi "fotoğraf ekle" arayüzünden gönderilebiliyor). Her
  // fotoğraf gönderildiğinde Claude görsel analiziyle hem netlik hem de
  // doğru belge olup olmadığı kontrol ediliyor (bkz. belgeAnaliz.js).
  {
    id: "belge_acik_riza",
    type: "tekli_foto_belge",
    text:
      "Şimdi sırasıyla birkaç belgenin fotoğrafını rica edeceğim.\n\n" +
      "📄 İlk olarak, imzalı *Açık Rıza Beyanı'nın (KVKK metni)* fotoğrafını gönderir misiniz? " +
      "(Yukarıda gönderdiğim şablonu müşteriye yazdırıp imzalatabilirsiniz)",
    beklenenBelge:
      "İmzalı bir Açık Rıza Beyanı / KVKK aydınlatma-rıza metni. Üzerinde yazılı metin ve belgenin altında " +
      "el yazısıyla atılmış bir imza olmalı.",
    dosyaAdi: "acik_riza_beyani.jpg",
    sablonGonder: true
  },
  {
    id: "belge_imza_karti",
    type: "tekli_foto_belge",
    text: "📄 Şimdi imzalı *İletişim Bilgileri ve Islak İmza Kartı*nın fotoğrafını gönderir misiniz?",
    beklenenBelge:
      "İmzalı bir İletişim Bilgileri ve Islak İmza Kartı formu. Üzerinde iletişim bilgileri (ad, telefon, " +
      "adres vb.) ve el yazısıyla atılmış bir imza olmalı.",
    dosyaAdi: "imza_karti.jpg"
  },
  {
    id: "belge_yerlesim_yeri",
    type: "tekli_foto_belge",
    text: "📄 Şimdi *yerleşim yeri belgesinin (ikametgah)* fotoğrafını gönderir misiniz?",
    beklenenBelge:
      "Bir yerleşim yeri belgesi / ikametgah belgesi. Resmi bir kurum (nüfus müdürlüğü, e-Devlet çıktısı vb.) " +
      "tarafından düzenlenmiş, kişinin güncel adres bilgisini gösteren bir belge olmalı.",
    dosyaAdi: "yerlesim_yeri_belgesi.jpg"
  },
  {
    id: "belge_kimlik_on",
    type: "tekli_foto_belge",
    text: "📄 Şimdi *kimliğin ön yüzünün* fotoğrafını gönderir misiniz?",
    beklenenBelge:
      "Bir T.C. kimlik kartının ÖN yüzü - üzerinde fotoğraf, isim, soyisim ve T.C. kimlik numarası bulunan yüz.",
    dosyaAdi: "kimlik_on.jpg"
  },
  {
    id: "belge_kimlik_arka",
    type: "tekli_foto_belge",
    text: "📄 Son olarak *kimliğin arka yüzünün* fotoğrafını gönderir misiniz?",
    beklenenBelge:
      "Bir T.C. kimlik kartının ARKA yüzü - üzerinde seri numarası, doğum yeri/tarihi ve diğer bilgilerin " +
      "bulunduğu yüz.",
    dosyaAdi: "kimlik_arka.jpg"
  }
];

// BES (Yeni İş) soru listesi, Hayat listesiyle birebir ayni - sadece "paket"
// sorusu haric (BES'te paket ayrimi yok). Boylece iki liste hep senkron kalir.
const SATIS_SORULARI_BES_YENI_IS = SATIS_SORULARI_HAYAT.filter(
  (soru) => soru.id !== "paket" && soru.id !== "vefat_teminati"
);

// Danisman listesi tum urunlerde ayni referansi paylasir (flows.js'deki
// DANISMANLAR sabiti), o yuzden herhangi bir urunden okuyabiliriz.
const DANISMANLAR = flows.dask.advisors;

function danismaniBul(numara) {
  return DANISMANLAR.find((d) => d.number === numara) || null;
}

function isDanisman(numara) {
  return !!danismaniBul(numara);
}

// --- Turkce karakter toleransli secenek eslestirme (conversationEngine.js'deki
// ile ayni mantik, kucuk oldugu icin burada ayrica tanimlandi) ---
function normalizeTr(str) {
  return (str || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function matchOption(userText, options) {
  const normalized = normalizeTr((userText || "").trim());
  if (!normalized) return null;
  const exact = options.find((opt) => normalizeTr(opt) === normalized);
  if (exact) return exact;
  return (
    options.find((opt) => normalized.includes(normalizeTr(opt)) || normalizeTr(opt).includes(normalized)) || null
  );
}

// GG.AA.YYYY SS:DD formatinda bir tarih-saat metnini gecerliyse zaman
// damgasina (ms) cevirir, degilse null doner.
const TARIH_SAAT_REGEX = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/;

function tarihSaatDogrula(metin) {
  const eslesme = TARIH_SAAT_REGEX.exec((metin || "").trim());
  if (!eslesme) return null;
  const gun = parseInt(eslesme[1], 10);
  const ay = parseInt(eslesme[2], 10);
  const yil = parseInt(eslesme[3], 10);
  const saat = parseInt(eslesme[4], 10);
  const dakika = parseInt(eslesme[5], 10);
  const tarih = new Date(yil, ay - 1, gun, saat, dakika);
  const gecerliMi =
    tarih.getFullYear() === yil &&
    tarih.getMonth() === ay - 1 &&
    tarih.getDate() === gun &&
    tarih.getHours() === saat &&
    tarih.getMinutes() === dakika;
  return gecerliMi ? tarih.getTime() : null;
}

// --- Karsilama (ana giris noktasi) ---
const ANA_MENU_SECENEKLERI = [
  "Yeni İş Talebi",
  "BES Hayat Satış",
  "Bekleyen İş",
  "Destek Talebi Oluştur",
  "Yaklaşan Yenilemeler",
  "Yenileme Takibi Ekle",
  "BES Fonları",
  "Doküman Merkezi",
  "Performansım"
];

async function karsilamaGoster(from, session) {
  const danisman = danismaniBul(from);
  session.state = "DANISMAN_KARSILAMA";
  await sendList(
    from,
    `Merhaba ${danisman ? danisman.name : ""}! 👋 Umarım gününüz güzel geçiyordur. WE Sigorta danışman asistanınız hazır — size bugün nasıl yardımcı olabilirim?`,
    "Seçin",
    ANA_MENU_SECENEKLERI
  );
}

// --- Istenildigi an urun bazinda PDF form/dokuman gonderme ---
async function formUrunSec(from, session) {
  session.state = "DANISMAN_FORM_URUN_SEC";
  const urunAnahtarlari = Object.keys(flows);
  session.danismanFormUrunAnahtarlari = urunAnahtarlari;
  const etiketler = urunAnahtarlari.map((k) => flows[k].menuLabel || flows[k].label);
  await sendList(from, "Hangi ürünün formunu/dokümanını almak istersiniz?", "Ürün Seç", etiketler);
}

// --- Mevcut talepleri listeleme/yonetme ---
async function anaMenuGoster(from, session) {
  const danisman = danismaniBul(from);
  const acikLeadler = leadStore
    .tumLeadleriGetir()
    .filter((l) => l.danismanNumarasi === from && l.durum === "Açık");

  session.state = "DANISMAN_LEAD_SECIMI";
  session.danismanLeadListesi = acikLeadler.map((l) => l.id);

  if (acikLeadler.length === 0) {
    await sendText(
      from,
      `Şu an açık bir talebiniz yok. 🎉 Yeni bir talep oluşturmak isterseniz "evet" yazabilirsiniz.`
    );
    return;
  }

  // Durum artik tek ("Açık"), o yuzden ikon olarak durum yerine hatirlatma
  // kurulu olup olmadigini gosteriyoruz - danisman icin daha faydali bir
  // sinyal (hangi musteride ne zaman tekrar aranmasi gerektigini hatirlatir).
  const satirlar = acikLeadler.map((l) => {
    const ikon = l.hatirlatma ? "⏰" : "⚪";
    return `${ikon} ${l.musteriAdi || l.telefon} (${l.urun})`;
  });

  await sendList(
    from,
    `Açık talepleriniz aşağıda, detay görmek istediğinizi seçin:`,
    "Talep Seç",
    satirlar
  );
}

async function leadDetayGoster(from, session, lead) {
  session.state = "DANISMAN_LEAD_DETAY";
  session.danismanSeciliLeadId = lead.id;

  const notlarMetni = lead.notlar.length
    ? "\n\n📝 Notlar:\n" + lead.notlar.map((n) => `- ${n.metin}`).join("\n")
    : "";
  const hatirlatmaMetni = lead.hatirlatma
    ? `\n\n⏰ Hatırlatma: ${new Date(lead.hatirlatma.zaman).toLocaleString("tr-TR")}${
        lead.hatirlatma.not ? " - " + lead.hatirlatma.not : ""
      }`
    : "";

  const detay =
    `👤 ${lead.musteriAdi || lead.telefon}\n` +
    `📦 ${lead.urun}\n` +
    `📞 ${lead.telefon}\n` +
    `📊 Durum: ${lead.durum}\n\n` +
    `${lead.ozet || ""}` +
    notlarMetni +
    hatirlatmaMetni;

  await sendText(from, detay);
  await sendButtons(from, "Ne yapmak istersiniz?", ["Not Ekle", "Durum Değiştir", "Hatırlatma Kur"]);
}

// --- Musteri (sigortali) adina yeni talep olusturma akisi ---

// Bir sorular listesinden, danisman modunda gosterilmeyecek (danismandaGizle)
// ya da skipIf ile atlanmasi gereken sorulari atlayip bir sonraki gecerli
// index'i bulur.
function sonrakiGecerliIndex(sorular, answers, baslangic) {
  let idx = baslangic;
  while (idx < sorular.length) {
    const soru = sorular[idx];
    if (soru.danismandaGizle || (soru.skipIf && soru.skipIf(answers))) {
      idx += 1;
      continue;
    }
    break;
  }
  return idx;
}

// Satis kaydi (Hayat / BES Yeni İş / ileride Aktarım) tamamlanmadan once son
// bir guvenlik kontrolu: atlanmayan (skipIf/danismandaGizle olmayan) HER
// sorunun gercekten cevaplanmis oldugundan emin oluyoruz. Normalde akis zaten
// bir soruyu cevaplanmadan atlamiyor, ama bu fonksiyon; ileride Aktarım gibi
// yeni bir soru listesi eklendiginde de otomatik olarak ayni korumayi
// sagliyor - urun tipine gore ayri ayri kontrol yazmaya gerek kalmiyor.
// ("tekli_foto_belge" tipi sorularin cevabi answers'da degil, ayrica
// session.satisBelgeler'de tutuluyor - o yuzden burada kontrol edilmiyor,
// belgeler satisTamamla'da ayrica kontrol ediliyor.)
function eksikBilgiVarMi(sorular, answers) {
  return sorular.some((soru) => {
    if (soru.type === "tekli_foto_belge") return false;
    if (soru.danismandaGizle || (soru.skipIf && soru.skipIf(answers))) return false;
    const cevap = answers[soru.id];
    return cevap === undefined || cevap === null || (typeof cevap === "string" && cevap.trim() === "");
  });
}

// --- Satis kaydi akisi (Prim Iadeli Hayat Sigortasi) ---
// "BES Hayat Satış" ilk once hangi urun oldugunu soruyor (Hayat/BES), BES
// secilirse ayrica Yeni İş mi Aktarım mi oldugunu soruyor - Aktarım henuz
// desteklenmedigi icin secilirse bir "yakinda" mesaji gosterip ana menuye
// donuluyor.
async function satisBaslat(from, session) {
  session.state = "DANISMAN_SATIS_URUN_SEC";
  await sendButtons(
    from,
    "Hangi ürün için satış kaydı oluşturuyorsunuz?",
    ["Prim İadeli Hayat Sigortası", "Bireysel Emeklilik Sistemi (BES)"]
  );
}

function satisAkisiBaslat(from, session, urunTipi, sorular) {
  session.satisUrunTipi = urunTipi; // "hayat" | "bes_yeni_is"
  session.satisSorular = sorular;
  session.satisAnswers = {};
  session.satisBelgeler = [];
  session.satisSoruIndex = sonrakiGecerliIndex(sorular, session.satisAnswers, 0);
  session.state = "DANISMAN_SATIS_SORU";
  return satisSoruSor(from, session);
}

async function satisSoruSor(from, session) {
  const soru = session.satisSorular[session.satisSoruIndex];

  // Belgeler adimina ilk gelindiginde, danismanin musteriye yazdirip
  // imzalatmasi icin Garanti'nin bos sablon formlarini once gonderiyoruz.
  if (soru.sablonGonder) {
    await sabitSablonlariGonder(from);
  }

  const metin = typeof soru.text === "function" ? soru.text(session.satisAnswers) : soru.text;

  if (soru.type === "choice") {
    if (soru.options.length > 3) await sendList(from, metin, "Seçin", soru.options);
    else await sendButtons(from, metin, soru.options);
  } else {
    await sendText(from, metin);
  }
}

async function satisTamamla(from, session) {
  // Belge olmadan Garanti Emeklilik'e mail gitmesinin hicbir anlami yok -
  // normal akista buraya sadece 5 belge de kabul edildikten sonra
  // gelinebiliyor, ama savunmaci olarak yine de kontrol ediyoruz.
  if (!session.satisBelgeler || session.satisBelgeler.length === 0) {
    console.error("satisTamamla belgesiz cagirildi, mail gonderilmeden durduruldu.");
    await sendText(
      from,
      "Belgeler eksik olduğu için kaydı tamamlayamadım 😕 Lütfen belgeleri tekrar göndermeyi deneyin, sorun devam ederse bana ulaşın."
    );
    await karsilamaGoster(from, session);
    return;
  }

  // Eksik bilgiyle de mail gitmesin - Hayat, BES ve (ileride) Aktarım icin
  // ayni kontrol gecerli, cunku eksikBilgiVarMi urun tipine ozel degil,
  // dogrudan o akisin soru listesi (session.satisSorular) uzerinden calisiyor.
  if (eksikBilgiVarMi(session.satisSorular, session.satisAnswers)) {
    console.error("satisTamamla eksik bilgiyle cagirildi, mail gonderilmeden durduruldu.");
    await sendText(
      from,
      "Bazı bilgiler eksik göründüğü için kaydı tamamlayamadım 😕 Lütfen \"menü\" yazıp baştan tekrar deneyin, sorun devam ederse bana ulaşın."
    );
    await karsilamaGoster(from, session);
    return;
  }

  const danisman = danismaniBul(from);
  const a = session.satisAnswers;
  const urunTipi = session.satisUrunTipi;

  const odeyenAyniMi = a.odeyen_farkli_mi !== "Hayır, Farklı Biri";
  const odeyenAdSoyad = odeyenAyniMi ? a.musteri_ad_soyad : a.odeyen_ad_soyad;
  const odeyenTck = odeyenAyniMi ? a.sigortali_tck : a.odeyen_tck;
  const odeyenCep = odeyenAyniMi ? a.sigortali_cep : a.odeyen_cep;
  const odeyenEposta = odeyenAyniMi ? a.sigortali_eposta : a.odeyen_eposta;
  const urunAdiTam =
    urunTipi === "hayat" ? `${a.paket} Prim İadeli Hayat Sigortası` : "Bireysel Emeklilik Sistemi (BES) - Yeni İş";

  const ozetSatirlari = [
    `Ürün Adı: ${urunAdiTam}`,
    `Müşteri Ad Soyad: ${a.musteri_ad_soyad}`,
    `Sigortalı TCK No: ${a.sigortali_tck}`,
    `Sigortalı Doğum Tarihi: ${a.sigortali_dogum_tarihi}`,
    `Cinsiyet: ${a.sigortali_cinsiyet}`,
    `Katılımcı Uyruk/Doğum Yeri: ${a.sigortali_uyruk} / ${a.sigortali_dogum_yeri}`,
    `Ödeyen Ad Soyad TCK No: ${odeyenAdSoyad} ${odeyenTck}`,
    `Dağıtım Kanalı Adı: EKŞİ GROUP`,
    `Dağıtım Kanalı kodu: 329`,
    // Poliçe süresi artik sorulmuyor - Hayat'ta her zaman 12 yil varsayiliyor.
    ...(urunTipi === "hayat" ? [`Poliçe Süresi: 12 YIL`] : []),
    `Ödeme Aracı: ${a.odeme_araci}`,
    `Aylık Prim Tutarı: ${a.prim_tutari}`,
    `Ödeme Dönemi: ${a.odeme_donemi}`,
    // Vefat teminatini artik danisman kendisi (web sitemizden) hesaplayip
    // giriyor - sadece Hayat'ta soruluyor, BES'te bu alan yok.
    ...(urunTipi === "hayat" ? [`Vefat Teminatı: ${a.vefat_teminati}`] : []),
    `Sigortalı Cep Telefonu: ${a.sigortali_cep}`,
    `Sigortalı E-Posta: ${a.sigortali_eposta}`,
    `Ödeyen Cep Telefonu: ${odeyenCep}`,
    `Ödeyen E-Posta: ${odeyenEposta}`
  ];

  // Danismanin tek tek yukledigi belgeleri (kimlik on/arka, imzali evraklar,
  // yerlesim yeri belgesi) mail'e ayri ayri ek olarak eklemek yerine tek bir
  // PDF halinde birlestiriyoruz. Birlestirme herhangi bir sebeple basarisiz
  // olursa (orn. bozuk bir resim dosyasi), mail'in gitmemesi yerine belgeleri
  // ayri ayri ekleyerek gonderime devam ediyoruz - guvenli yedek.
  let ekBelgeler = session.satisBelgeler;
  try {
    const birlesikPdfBuffer = await belgeleriTekPdfeBirlestir(session.satisBelgeler);
    ekBelgeler = [
      {
        dosyaAdi: `${a.musteri_ad_soyad} - Belgeler.pdf`,
        mimeType: "application/pdf",
        veriBase64: birlesikPdfBuffer.toString("base64")
      }
    ];
  } catch (err) {
    console.error(
      "Belgeler tek PDF halinde birlestirilemedi, ayri ayri gonderiliyor:",
      err.message
    );
  }

  const acilisMetni = `Müşterimizin ${a.arama_tarihi} tarihinde, ${a.arama_saat_araligi} saatleri arasında aranması ricadır.`;

  await garantiEmekliligeGonder({
    urunAdi: urunAdiTam,
    musteriAdi: a.musteri_ad_soyad,
    telefon: a.sigortali_cep,
    ozetSatirlari,
    ekBelgeler,
    konuFormati: "satis", // konu satirini "Urun Adi Musteri Adi" formatinda kurar
    acilisMetni
  }).catch((err) => console.error("Garanti Emeklilik satis maili gonderilirken hata:", err.message));

  // Panelde de gorunmesi icin lead olarak da kaydediyoruz.
  const kompaktDetay = `[${danisman ? danisman.name : "Danışman"} tarafından oluşturuldu - SATIŞ] ${urunAdiTam} • ${ozetSatirlari.join(" • ")}`;
  const yeniLead = leadStore.yeniLeadOlustur({
    telefon: a.sigortali_cep,
    musteriAdi: a.musteri_ad_soyad,
    urun: urunAdiTam,
    danismanAdi: danisman ? danisman.name : null,
    danismanNumarasi: from,
    ozet: kompaktDetay
  });
  session.satisBelgeler.forEach((belge) => leadStore.belgeEkle(yeniLead.id, belge));

  await sendText(
    from,
    `Satış kaydı tamamlandı ✅ ${a.musteri_ad_soyad} için ${urunAdiTam} kaydı Garanti Emeklilik'e iletildi.`
  );
  await karsilamaGoster(from, session);
}

// "Yeni İş Talebi" sadece elementer branslar icindir (BES/Hayat icin ayri
// "BES Hayat Satış" akisi var) - o yuzden burada sadece agentNumber'i
// Bahadır olan (elementer) urunler listeleniyor.
const BAHADIR_NUMARASI = "905380711711";

async function yeniTalepUrunSec(from, session) {
  session.state = "DANISMAN_YENI_URUN_SEC";
  const urunAnahtarlari = Object.keys(flows).filter((k) => flows[k].agentNumber === BAHADIR_NUMARASI);
  session.danismanUrunAnahtarlari = urunAnahtarlari;
  const etiketler = urunAnahtarlari.map((k) => flows[k].menuLabel || flows[k].label);
  await sendList(from, "Hangi ürün için yeni bir talep oluşturmak istersiniz?", "Ürün Seç", etiketler);
}

async function danismanSoruSor(from, session) {
  const flow = flows[session.danismanYeniUrunKey];
  const soru = flow.questions[session.danismanYeniSoruIndex];
  const metin = conversationEngine.resolveDanismanText(soru, session.danismanYeniAnswers);

  if (soru.type === "choice") {
    if (soru.options.length > 3) {
      await sendList(from, metin, "Seçin", soru.options);
    } else {
      await sendButtons(from, metin, soru.options);
    }
  } else {
    await sendText(from, metin);
  }
}

async function danismanYeniTalepiTamamla(from, session) {
  const flow = flows[session.danismanYeniUrunKey];
  const danisman = danismaniBul(from);
  const sigortaliTelefon = session.danismanYeniTelefon;
  const answers = session.danismanYeniAnswers;
  const musteriAdi = answers.ad_soyad || "(isim alınmadı)";
  const olusturanEtiketi = danisman ? danisman.name : "Bir danışman";

  // Danismandaki (bu akista hic sorulmayan) sorulari cikartip ozet olusturuyoruz.
  const filtrelenmisFlow = { ...flow, questions: flow.questions.filter((q) => !q.danismandaGizle) };
  const askedQuestions = filtrelenmisFlow.questions.filter((q) => !(q.skipIf && q.skipIf(answers)));
  const summaryLines = askedQuestions.map((q) => {
    const soruMetni = conversationEngine.resolveDanismanText(q, answers);
    return `- ${soruMetni.replace(/\?$/, "")}: ${answers[q.id]}`;
  });

  const agentMessage =
    `\u{1F4CB} Yeni sigorta teklif talebi\n` +
    `📌 Bu talep ${olusturanEtiketi} tarafından oluşturuldu.\n\n` +
    `Sigortalı: ${musteriAdi}\n` +
    `Telefon: ${sigortaliTelefon}\n` +
    `Ürün: ${flow.label}\n\n` +
    summaryLines.join("\n");

  const sahteSession = { answers, name: musteriAdi };
  const kompaktDetayTemel = conversationEngine.kompaktDetayOlustur(filtrelenmisFlow, sahteSession, sigortaliTelefon);
  const kompaktDetay = `[${olusturanEtiketi} tarafından oluşturuldu] ${kompaktDetayTemel}`;

  // Guvenlik agi (Enbel her zaman, Bahadır elementer branslarda) + kendisine
  // tekrar bildirim gondermeye gerek yok, zaten kendisi olusturdu.
  const bildirilecekNumaralar = conversationEngine.guvenlikAgiNumaralari(flow, from);
  bildirilecekNumaralar.delete(from);

  for (const numara of bildirilecekNumaralar) {
    await conversationEngine.bildirimGonder(numara, flow.label, musteriAdi, sigortaliTelefon, agentMessage, kompaktDetay);
  }

  leadStore.yeniLeadOlustur({
    telefon: sigortaliTelefon,
    musteriAdi,
    urun: flow.label,
    danismanAdi: danisman ? danisman.name : null,
    danismanNumarasi: from,
    ozet: kompaktDetay
  });

  // BES ve Prim Iadeli Hayat Sigortasi gibi bazi urunlerde, danisman tarafindan
  // olusturulan talepler de Garanti Emeklilik'e otomatik mail olarak gider.
  if (flow.garantiEmekliligeGonder) {
    garantiEmekliligeGonder({
      urunAdi: flow.label,
      musteriAdi,
      telefon: sigortaliTelefon,
      ozetSatirlari: summaryLines
    }).catch((err) => console.error("Garanti Emeklilik maili gonderilirken beklenmeyen hata:", err.message));
  }

  await sendText(
    from,
    `Talep başarıyla oluşturuldu ✅ ${musteriAdi} için ${flow.label} talebi kaydedildi ve ilgili kişilere iletildi.`
  );
  await karsilamaGoster(from, session);
}

// --- Performansım: danismanin kendi ozet istatistiklerini gosterir ---
async function performansGoster(from, session) {
  const istatistik = leadStore.danismanIstatistikleri(from);
  const donusumMetni = istatistik.donusumOrani === null ? "henüz kapanan talep yok" : `%${istatistik.donusumOrani}`;

  await sendText(
    from,
    `📊 Performansım\n\n` +
      `Bu ay girilen talep: ${istatistik.buAyTalep}\n` +
      `Bu ay kapanan satış: ${istatistik.olumluBuAy}\n` +
      `Şu an açık talep: ${istatistik.acikSayisi}\n\n` +
      `Toplam (tüm zamanlar):\n` +
      `Talep: ${istatistik.toplamTalep}\n` +
      `Satış: ${istatistik.olumluToplam}\n` +
      `Dönüşüm oranı: ${donusumMetni}`
  );
  await karsilamaGoster(from, session);
}

// --- Destek Talebi: mevcut bir talebe bagli, ilgili kisiye aninda iletilen destek mesaji ---
async function destekLeadSecimiGoster(from, session) {
  const kendiLeadleri = leadStore.tumLeadleriGetir().filter((l) => l.danismanNumarasi === from);

  if (kendiLeadleri.length === 0) {
    await sendText(
      from,
      "Destek talebi oluşturmak için önce en az bir talebinizin olması gerekiyor. Önce 'Yeni Talep Oluştur' ile bir talep girebilirsiniz."
    );
    await karsilamaGoster(from, session);
    return;
  }

  // WhatsApp interaktif liste en fazla 10 satir destekliyor, o yuzden en
  // guncel 10 talep gosteriliyor.
  const gosterilecekler = kendiLeadleri.slice(0, 10);
  session.state = "DANISMAN_DESTEK_LEAD_SECIMI";
  session.danismanDestekLeadListesi = gosterilecekler.map((l) => l.id);

  const satirlar = gosterilecekler.map((l) => `${l.musteriAdi || l.telefon} (${l.urun}) - ${l.durum}`);
  await sendList(from, "Hangi talep/müşteri ile ilgili destek almak istersiniz?", "Talep Seç", satirlar);
}

async function destekMetniIste(from, session, lead) {
  session.state = "DANISMAN_DESTEK_METIN_BEKLE";
  session.danismanDestekLeadId = lead.id;
  await sendText(from, `${lead.musteriAdi || lead.telefon} (${lead.urun}) için ne konuda destek almak istersiniz? Kısaca yazar mısınız?`);
}

async function destekTalebiGonder(from, session, destekMetni) {
  const lead = leadStore.leadGetir(session.danismanDestekLeadId);
  if (!lead) {
    await sendText(from, "İlgili talebi bulamadım, tekrar deneyebilir misiniz?");
    await karsilamaGoster(from, session);
    return;
  }

  const danisman = danismaniBul(from);
  const danismanAdi = danisman ? danisman.name : "Bir danışman";
  const flow = flowBulUrunAdindan(lead.urun);

  const detay =
    `🆘 Destek Talebi\n` +
    `📌 ${danismanAdi} tarafından oluşturuldu.\n\n` +
    `Müşteri: ${lead.musteriAdi || lead.telefon}\n` +
    `Ürün: ${lead.urun}\n` +
    `Telefon: ${lead.telefon}\n\n` +
    `Mesaj: ${destekMetni}`;

  leadStore.notEkle(lead.id, `🆘 Destek Talebi: ${destekMetni}`);

  // Urune gore dogru kisiye (elementerde Bahadır, hayat/BES'te Enbel) +
  // her zaman Enbel'e kopya olacak sekilde ayni guvenlik agi mantigi
  // kullaniliyor (yeni talep bildirimindeki ile birebir ayni).
  const birincilNumara = flow ? flow.agentNumber : process.env.AGENT_WHATSAPP_NUMBER;
  const bildirilecekNumaralar = conversationEngine.guvenlikAgiNumaralari(flow || {}, birincilNumara);
  bildirilecekNumaralar.delete(from);

  for (const numara of bildirilecekNumaralar) {
    await conversationEngine.bildirimGonder(numara, lead.urun, lead.musteriAdi || lead.telefon, lead.telefon, detay, detay);
  }

  await sendText(from, "Destek talebiniz iletildi ✅ En kısa sürede dönüş yapılacaktır.");
  await karsilamaGoster(from, session);
}

// --- Yenileme Ekle: satis/talep akisindan bagimsiz, manuel police yenileme kaydi ---
async function yenilemeBaslat(from, session) {
  session.state = "DANISMAN_YENILEME_MUSTERI_BEKLE";
  session.yenilemeVerisi = {};
  await sendText(from, "Müşterinin adını ve soyadını paylaşır mısınız?");
}

async function yenilemeUrunSor(from, session) {
  session.state = "DANISMAN_YENILEME_URUN_SEC";
  const urunAnahtarlari = Object.keys(flows);
  session.yenilemeUrunAnahtarlari = urunAnahtarlari;
  const etiketler = urunAnahtarlari.map((k) => flows[k].menuLabel || flows[k].label);
  await sendList(from, "Hangi ürünün yenilemesini eklemek istiyorsunuz?", "Ürün Seç", etiketler);
}

async function yenilemeTarihSor(from, session) {
  session.state = "DANISMAN_YENILEME_TARIH_BEKLE";
  await sendText(from, "Poliçenin yenileme/bitiş tarihini paylaşır mısınız? (GG.AA.YYYY formatında, örn: 12.09.2026)");
}

async function yenilemeTamamla(from, session) {
  const danisman = danismaniBul(from);
  const v = session.yenilemeVerisi;

  const kayit = yenilemeStore.yeniYenilemeOlustur({
    danismanNumarasi: from,
    danismanAdi: danisman ? danisman.name : null,
    musteriAdi: v.musteriAdi,
    urun: v.urunLabel,
    plaka: v.plaka || null,
    bitisTarihi: v.bitisTarihiMs
  });

  const tarihMetni = new Date(kayit.bitisTarihi).toLocaleDateString("tr-TR");
  await sendText(
    from,
    `Yenileme kaydı eklendi ✅ ${v.musteriAdi} - ${v.urunLabel}${v.plaka ? ` (${v.plaka})` : ""} - ${tarihMetni}\n\nBu tarih yaklaşınca "Yaklaşan Yenilemeler" menüsünden takip edebilirsiniz.`
  );
  await karsilamaGoster(from, session);
}

// --- Yaklaşan Yenilemeler: kendi yenileme kayitlarindan yaklasanlari listeler ---
async function yenilemelerimGoster(from, session) {
  const yaklasanlar = yenilemeStore.yaklasanYenilemeleriGetir(30, from);

  if (yaklasanlar.length === 0) {
    await sendText(from, "Önümüzdeki 30 gün içinde yaklaşan bir yenileme kaydınız yok. 🎉");
    await karsilamaGoster(from, session);
    return;
  }

  const simdi = Date.now();
  const satirlar = yaklasanlar.map((y) => {
    const ikon = y.bitisTarihi < simdi ? "🔴" : "🟡";
    const tarihMetni = new Date(y.bitisTarihi).toLocaleDateString("tr-TR");
    const plakaMetni = y.plaka ? ` (${y.plaka})` : "";
    return `${ikon} ${y.musteriAdi} - ${y.urun}${plakaMetni} - ${tarihMetni}`;
  });

  await sendText(from, `📅 Yaklaşan Yenilemeler (30 gün)\n\n${satirlar.join("\n")}`);
  await karsilamaGoster(from, session);
}

// --- BES Fonları Hakkında Bilgi: icerik henuz hazir degil, yer tutucu ---
async function besFonBilgisiGoster(from, session) {
  await sendText(
    from,
    "🛠️ Bu özellik hazırlanıyor. Garanti Emeklilik'teki güncel Bireysel Emeklilik fonlarının bilgileri (getiri, risk seviyesi vb.) eklendiğinde buradan görebileceksiniz."
  );
  await karsilamaGoster(from, session);
}

async function handleAdvisorMessage(from, parsed) {
  const session = getSession(from);

  // Musteri (danisman) bir foto/belge gonderdiyse: eger su an bir talebin
  // detayini goruntuluyorsa, dogrudan o talebe eklenir. Aksi halde nazikce
  // uyarilir. Guvenlik icin sadece PDF/Word/Excel/fotograf turleri kabul edilir.
  if (parsed.type === "media") {
    if (!dosyaTuruIzinliMi(parsed.mimeType)) {
      await sendText(
        from,
        "Bu dosya türünü kabul edemiyoruz 🙏 Sadece PDF, Word, Excel veya fotoğraf (jpg/png) gönderebilirsiniz."
      );
      return;
    }

    // Satis kaydi akisinda, "tekli_foto_belge" tipi soru bekleniyorsa (KVKK
    // metni, imza karti, yerlesim yeri belgesi, kimlik on/arka yuz) belge
    // fotografini once Claude gorsel analiziyle kontrol edip (net mi, dogru
    // belge mi) sonra kabul ediyoruz.
    if (session.state === "DANISMAN_SATIS_SORU") {
      const soru = session.satisSorular[session.satisSoruIndex];
      if (soru && soru.type === "tekli_foto_belge") {
        if (!parsed.mimeType || !parsed.mimeType.startsWith("image/")) {
          await sendText(from, "Bu adımda bir PDF/döküman değil, fotoğraf göndermeniz gerekiyor. Lütfen fotoğraf olarak gönderir misiniz? 📸");
          return;
        }
        try {
          const { buffer, mimeType } = await mediaIndir(parsed.mediaId);
          const gercekMimeType = parsed.mimeType || mimeType;

          await sendText(from, "Fotoğrafınızı inceliyorum, bir saniye... 🔍");
          let analiz = null;
          try {
            analiz = await belgeFotografiAnalizEt(buffer, gercekMimeType, soru.beklenenBelge);
          } catch (err) {
            // Analiz basarisiz olursa (orn. ANTHROPIC_API_KEY tanimli degil ya
            // da gecici bir API sorunu) kontrolu atlayip belgeyi normal kabul
            // ediyoruz - gecici bir aksama satis surecini durdurmasin.
            console.error("Belge foto analizi yapilamadi (belge yine de kabul edildi):", err.message);
          }

          if (analiz && !analiz.netMi) {
            await sendText(
              from,
              `Fotoğraf yeterince net görünmüyor 😕 ${analiz.aciklama || ""}\n\nDaha iyi ışıkta, net bir şekilde tekrar çeker misiniz?`
            );
            return;
          }
          if (analiz && !analiz.dogruBelgeMi) {
            await sendText(
              from,
              `Bu fotoğraf beklediğim belgeye benzemiyor 🤔 ${analiz.aciklama || ""}\n\nLütfen doğru belgenin fotoğrafını gönderir misiniz?`
            );
            return;
          }

          session.satisBelgeler.push({
            dosyaAdi: soru.dosyaAdi,
            mimeType: gercekMimeType,
            veriBase64: buffer.toString("base64")
          });
          await sendText(from, "Belge alındı ✅");

          session.satisSoruIndex = sonrakiGecerliIndex(
            session.satisSorular,
            session.satisAnswers,
            session.satisSoruIndex + 1
          );
          if (session.satisSoruIndex >= session.satisSorular.length) {
            await satisTamamla(from, session);
          } else {
            await satisSoruSor(from, session);
          }
        } catch (err) {
          console.error("Satis belgesi indirilemedi:", err?.response?.data || err.message);
          await sendText(from, "Belgeyi kaydederken bir sorun oluştu, tekrar gönderir misiniz?");
        }
        return;
      }
    }

    if (session.state === "DANISMAN_LEAD_DETAY" && session.danismanSeciliLeadId) {
      try {
        const { buffer, mimeType } = await mediaIndir(parsed.mediaId);
        const lead = leadStore.belgeEkle(session.danismanSeciliLeadId, {
          dosyaAdi: parsed.dosyaAdi,
          mimeType: parsed.mimeType || mimeType,
          veriBase64: buffer.toString("base64")
        });
        await sendText(from, "Belge talebe eklendi ✅");
        if (lead) await leadDetayGoster(from, session, lead);
        else await karsilamaGoster(from, session);
      } catch (err) {
        console.error("Belge indirilemedi/eklenemedi:", err?.response?.data || err.message);
        await sendText(from, "Belgeyi kaydederken bir sorun oluştu, tekrar dener misiniz?");
      }
      return;
    }
    await sendText(
      from,
      "Bu belgeyi bir talebe eklemek için önce 'Taleplerimi Gör' ile ilgili talebi açmanız gerekiyor."
    );
    return;
  }

  const userText = parsed.type === "text" ? parsed.text.trim() : parsed.interactiveTitle;

  // Her zaman "menu"/"iptal"/"geri" yazarak karsilama ekranina donulebilir.
  if (parsed.type === "text" && /^(men[uü]|iptal|geri|evet)$/i.test(userText || "")) {
    await karsilamaGoster(from, session);
    return;
  }

  switch (session.state) {
    case "DANISMAN_KARSILAMA": {
      if (userText === "Yeni İş Talebi") {
        await yeniTalepUrunSec(from, session);
        return;
      }
      if (userText === "BES Hayat Satış") {
        await satisBaslat(from, session);
        return;
      }
      if (userText === "Bekleyen İş") {
        await anaMenuGoster(from, session);
        return;
      }
      if (userText === "Destek Talebi Oluştur") {
        await destekLeadSecimiGoster(from, session);
        return;
      }
      if (userText === "Yaklaşan Yenilemeler") {
        await yenilemelerimGoster(from, session);
        return;
      }
      if (userText === "Yenileme Takibi Ekle") {
        await yenilemeBaslat(from, session);
        return;
      }
      if (userText === "BES Fonları") {
        await besFonBilgisiGoster(from, session);
        return;
      }
      if (userText === "Doküman Merkezi") {
        await formUrunSec(from, session);
        return;
      }
      if (userText === "Performansım") {
        await performansGoster(from, session);
        return;
      }
      await karsilamaGoster(from, session);
      return;
    }

    // --- Satis kaydi: urun secimi (Hayat / BES) ---
    case "DANISMAN_SATIS_URUN_SEC": {
      if (userText === "Prim İadeli Hayat Sigortası") {
        await sendText(from, "📝 Prim İadeli Hayat Sigortası satış kaydı başlatıyoruz.");
        await satisAkisiBaslat(from, session, "hayat", SATIS_SORULARI_HAYAT);
        return;
      }
      if (userText === "Bireysel Emeklilik Sistemi (BES)") {
        session.state = "DANISMAN_SATIS_BES_TIP_SEC";
        await sendButtons(from, "BES için Yeni İş mi, yoksa Aktarım mı?", ["Yeni İş", "Aktarım"]);
        return;
      }
      await satisBaslat(from, session);
      return;
    }

    // --- Satis kaydi: BES icin Yeni Is / Aktarim secimi ---
    case "DANISMAN_SATIS_BES_TIP_SEC": {
      if (userText === "Yeni İş") {
        await sendText(from, "📝 Bireysel Emeklilik Sistemi (BES) - Yeni İş satış kaydı başlatıyoruz.");
        await satisAkisiBaslat(from, session, "bes_yeni_is", SATIS_SORULARI_BES_YENI_IS);
        return;
      }
      if (userText === "Aktarım") {
        await sendText(
          from,
          "🛠️ BES Aktarım akışı yakında eklenecek. Şimdilik sadece Yeni İş için satış kaydı oluşturabiliyoruz."
        );
        await karsilamaGoster(from, session);
        return;
      }
      await sendButtons(from, "BES için Yeni İş mi, yoksa Aktarım mı?", ["Yeni İş", "Aktarım"]);
      return;
    }

    case "DANISMAN_FORM_URUN_SEC": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await formUrunSec(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const urunKey = (session.danismanFormUrunAnahtarlari || [])[index];
      const urun = urunKey && flows[urunKey];
      if (!urun) {
        await formUrunSec(from, session);
        return;
      }
      const dokuman = dokumanStore.dokumanGetir(urunKey);
      if (!dokuman) {
        await sendText(
          from,
          `${urun.label} için henüz bir form/doküman yüklenmemiş. Panelden yüklenmesini isteyebilirsiniz.`
        );
      } else {
        try {
          const buffer = Buffer.from(dokuman.veriBase64, "base64");
          await sendDocument(from, buffer, dokuman.mimeType, dokuman.dosyaAdi);
        } catch (err) {
          console.error("Form gonderilemedi:", err?.response?.data || err.message);
          await sendText(from, "Formu gönderirken bir sorun oluştu, tekrar dener misiniz?");
        }
      }
      await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_LEAD_SECIMI": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await anaMenuGoster(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const leadId = (session.danismanLeadListesi || [])[index];
      const lead = leadId && leadStore.leadGetir(leadId);
      if (!lead) {
        await anaMenuGoster(from, session);
        return;
      }
      await leadDetayGoster(from, session, lead);
      return;
    }

    case "DANISMAN_LEAD_DETAY": {
      if (userText === "Not Ekle") {
        session.state = "DANISMAN_NOT_BEKLE";
        await sendText(from, "Notunuzu yazar mısınız?");
        return;
      }
      if (userText === "Durum Değiştir") {
        session.state = "DANISMAN_DURUM_BEKLE";
        await sendList(from, "Yeni durumu seçin:", "Durum Seç", leadStore.DURUMLAR);
        return;
      }
      if (userText === "Hatırlatma Kur") {
        session.state = "DANISMAN_HATIRLATMA_TARIH_BEKLE";
        await sendText(
          from,
          "Hangi tarih ve saatte hatırlatalım? (GG.AA.YYYY SS:DD formatında, örn: 16.07.2026 09:00)"
        );
        return;
      }
      await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_NOT_BEKLE": {
      const lead = leadStore.notEkle(session.danismanSeciliLeadId, userText);
      await sendText(from, "Not eklendi ✅");
      if (lead) await leadDetayGoster(from, session, lead);
      else await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_DURUM_BEKLE": {
      if (!leadStore.DURUMLAR.includes(userText)) {
        await sendList(from, "Lütfen listeden bir durum seçin:", "Durum Seç", leadStore.DURUMLAR);
        return;
      }
      const lead = leadStore.durumGuncelle(session.danismanSeciliLeadId, userText);
      await sendText(from, `Durum "${userText}" olarak güncellendi ✅`);
      if (userText === "Olumlu Kapandı" || userText === "Olumsuz Kapandı" || !lead) {
        await karsilamaGoster(from, session);
      } else {
        await leadDetayGoster(from, session, lead);
      }
      return;
    }

    case "DANISMAN_HATIRLATMA_TARIH_BEKLE": {
      const zamanMs = tarihSaatDogrula(userText);
      if (!zamanMs) {
        await sendText(
          from,
          "Lütfen GG.AA.YYYY SS:DD formatında yazar mısınız? (Örn: 16.07.2026 09:00)"
        );
        return;
      }
      if (zamanMs < Date.now()) {
        await sendText(from, "Bu tarih geçmişte kalmış görünüyor, lütfen ileri bir tarih yazar mısınız?");
        return;
      }
      session.danismanHatirlatmaZamanMs = zamanMs;
      session.state = "DANISMAN_HATIRLATMA_NOT_BEKLE";
      await sendText(from, "Hatırlatma notu nedir? (Örn: 'Çarşamba sabahı aramamı istedi')");
      return;
    }

    case "DANISMAN_HATIRLATMA_NOT_BEKLE": {
      const lead = leadStore.hatirlatmaKur(
        session.danismanSeciliLeadId,
        session.danismanHatirlatmaZamanMs,
        userText
      );
      await sendText(from, "Hatırlatma kuruldu ⏰ Zamanı gelince otomatik haber vereceğim.");
      if (lead) await leadDetayGoster(from, session, lead);
      else await karsilamaGoster(from, session);
      return;
    }

    // --- Yeni talep olusturma akisi ---
    case "DANISMAN_YENI_URUN_SEC": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await yeniTalepUrunSec(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const urunKey = (session.danismanUrunAnahtarlari || [])[index];
      if (!urunKey || !flows[urunKey]) {
        await yeniTalepUrunSec(from, session);
        return;
      }
      session.danismanYeniUrunKey = urunKey;
      session.danismanYeniAnswers = {};
      session.state = "DANISMAN_YENI_TELEFON_BEKLE";
      await sendText(
        from,
        "Sigortalının telefon numarasını (başında ülke koduyla, örn: 905551234567 şeklinde) paylaşır mısınız?"
      );
      return;
    }

    case "DANISMAN_YENI_TELEFON_BEKLE": {
      const temiz = (userText || "").replace(/\D/g, "");
      if (temiz.length < 10 || temiz.length > 15) {
        await sendText(
          from,
          "Lütfen geçerli bir telefon numarası yazar mısınız? (Başında ülke koduyla, örn: 905551234567 şeklinde)"
        );
        return;
      }
      session.danismanYeniTelefon = temiz;
      const flow = flows[session.danismanYeniUrunKey];
      session.danismanYeniSoruIndex = sonrakiGecerliIndex(flow.questions, session.danismanYeniAnswers, 0);
      session.state = "DANISMAN_YENI_SORU";
      await danismanSoruSor(from, session);
      return;
    }

    case "DANISMAN_YENI_SORU": {
      const flow = flows[session.danismanYeniUrunKey];
      const soru = flow.questions[session.danismanYeniSoruIndex];

      if (soru.type === "choice") {
        const secilen = matchOption(userText, soru.options);
        if (!secilen) {
          const metin = conversationEngine.resolveDanismanText(soru, session.danismanYeniAnswers);
          if (soru.options.length > 3) await sendList(from, metin, "Seçin", soru.options);
          else await sendButtons(from, metin, soru.options);
          return;
        }
        session.danismanYeniAnswers[soru.id] = secilen;
      } else {
        if (soru.validate && !soru.validate(userText, session.danismanYeniAnswers)) {
          const hint =
            typeof soru.validationError === "function"
              ? soru.validationError(userText, session.danismanYeniAnswers)
              : soru.validationError || "Bu bilgi doğru formatta görünmüyor, lütfen tekrar dener misiniz?";
          await sendText(from, hint);
          return;
        }
        session.danismanYeniAnswers[soru.id] = userText;
      }

      if (soru.tepki) {
        const tepkiMesaji = soru.tepki(session.danismanYeniAnswers[soru.id]);
        if (tepkiMesaji) await sendText(from, tepkiMesaji);
      }

      session.danismanYeniSoruIndex = sonrakiGecerliIndex(
        flow.questions,
        session.danismanYeniAnswers,
        session.danismanYeniSoruIndex + 1
      );

      if (session.danismanYeniSoruIndex >= flow.questions.length) {
        await danismanYeniTalepiTamamla(from, session);
      } else {
        await danismanSoruSor(from, session);
      }
      return;
    }

    // --- Satis kaydi akisi ---
    case "DANISMAN_SATIS_SORU": {
      const soru = session.satisSorular[session.satisSoruIndex];

      if (soru.type === "tekli_foto_belge") {
        const metin = typeof soru.text === "function" ? soru.text(session.satisAnswers) : soru.text;
        await sendText(from, `Bu adımda bir fotoğraf göndermenizi bekliyorum 📸\n\n${metin}`);
        return;
      }

      if (soru.type === "choice") {
        const secilen = matchOption(userText, soru.options);
        if (!secilen) {
          const metin = typeof soru.text === "function" ? soru.text(session.satisAnswers) : soru.text;
          if (soru.options.length > 3) await sendList(from, metin, "Seçin", soru.options);
          else await sendButtons(from, metin, soru.options);
          return;
        }
        session.satisAnswers[soru.id] = secilen;
      } else {
        if (soru.validate && !soru.validate(userText)) {
          const hint =
            typeof soru.validationError === "function" ? soru.validationError(userText) : soru.validationError;
          await sendText(from, hint || "Bu bilgi doğru formatta görünmüyor, lütfen tekrar dener misiniz?");
          return;
        }
        session.satisAnswers[soru.id] = userText;
      }

      session.satisSoruIndex = sonrakiGecerliIndex(
        session.satisSorular,
        session.satisAnswers,
        session.satisSoruIndex + 1
      );
      if (session.satisSoruIndex >= session.satisSorular.length) {
        await satisTamamla(from, session);
      } else {
        await satisSoruSor(from, session);
      }
      return;
    }

    // --- Destek talebi akisi ---
    case "DANISMAN_DESTEK_LEAD_SECIMI": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await destekLeadSecimiGoster(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const leadId = (session.danismanDestekLeadListesi || [])[index];
      const lead = leadId && leadStore.leadGetir(leadId);
      if (!lead) {
        await destekLeadSecimiGoster(from, session);
        return;
      }
      await destekMetniIste(from, session, lead);
      return;
    }

    case "DANISMAN_DESTEK_METIN_BEKLE": {
      if (!userText) {
        await sendText(from, "Sorununuzu kısaca yazar mısınız?");
        return;
      }
      await destekTalebiGonder(from, session, userText);
      return;
    }

    // --- Yenileme ekleme akisi ---
    case "DANISMAN_YENILEME_MUSTERI_BEKLE": {
      if (!userText) {
        await sendText(from, "Müşterinin adını ve soyadını paylaşır mısınız?");
        return;
      }
      session.yenilemeVerisi.musteriAdi = userText;
      await yenilemeUrunSor(from, session);
      return;
    }

    case "DANISMAN_YENILEME_URUN_SEC": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await yenilemeUrunSor(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const urunKey = (session.yenilemeUrunAnahtarlari || [])[index];
      if (!urunKey || !flows[urunKey]) {
        await yenilemeUrunSor(from, session);
        return;
      }
      session.yenilemeVerisi.urunLabel = flows[urunKey].label;

      if (PLAKA_ISTENEN_URUN_ETIKETLERI.includes(flows[urunKey].label)) {
        session.state = "DANISMAN_YENILEME_PLAKA_BEKLE";
        await sendText(from, "Aracın plakasını paylaşır mısınız? (Örn: 34 ABC 123)");
      } else {
        await yenilemeTarihSor(from, session);
      }
      return;
    }

    case "DANISMAN_YENILEME_PLAKA_BEKLE": {
      if (!plakaGecerliMi(userText)) {
        await sendText(from, "Girilen plaka geçerli görünmüyor, lütfen tekrar yazar mısınız? (Örn: 34 ABC 123)");
        return;
      }
      session.yenilemeVerisi.plaka = userText.trim().toUpperCase();
      await yenilemeTarihSor(from, session);
      return;
    }

    case "DANISMAN_YENILEME_TARIH_BEKLE": {
      if (!yenilemeTarihiGecerliMi(userText)) {
        await sendText(from, "Lütfen tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 12.09.2026)");
        return;
      }
      session.yenilemeVerisi.bitisTarihiMs = tarihiMsYap(userText);
      await yenilemeTamamla(from, session);
      return;
    }

    default: {
      await karsilamaGoster(from, session);
    }
  }
}

module.exports = { isDanisman, handleAdvisorMessage };
