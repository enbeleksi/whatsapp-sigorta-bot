// BES ve Prim Iadeli Hayat Sigortasi taleplerini Garanti Emeklilik'e otomatik
// mail olarak yonlendirir - onlar bu talepleri kendi is akislarina ekleyip
// cagri merkezlerinden musteriyi ariyorlar.
//
// Resend (resend.com) HTTPS API'si uzerinden gonderilir. ESKIDEN Outlook/
// Microsoft 365 SMTP kullaniliyordu ama Railway'den smtp.office365.com:587'e
// baglanti surekli "Connection timeout" ile basarisiz oluyordu (Railway'in
// disa giden SMTP portlarini engellemesi gibi gorunuyor - retry'a ragmen
// hep ayni hata alindi). HTTPS (443) uzerinden calisan Resend'e gecerek bu
// sorunu tamamen ortadan kaldiriyoruz - HTTPS hemen hicbir barinma
// sirketinde engellenmez.
//
// Hesap bilgileri Railway ortam degiskenlerinden okunur, koda asla yazilmaz:
//   RESEND_API_KEY         - resend.com hesabindaki API anahtari
//   EPOSTA_GONDEREN_ADRESI - dogrulanmis domain uzerinden gonderilecek adres
//                            (orn. "bildirim@wesigorta.com.tr" - Resend'de
//                            domain dogrulanmadan bu adresten gonderim
//                            calismaz, bkz. resend.com/domains)

const RESEND_API_URL = "https://api.resend.com/emails";

const GARANTI_EMEKLILIK_ALICILARI = [
  "gbeacentelerkoordinasyon@garantibbvaemeklilik.com.tr",
  "gbeacenteler@garantibbvaemeklilik.com.tr"
];

// Bir milisaniye kadar bekler (retry'lar arasinda kisa bir ara vermek icin).
function bekle(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// urunAdi: orn. "Bireysel Emeklilik Sistemi (BES)" ya da "Prim İadeli Hayat Sigortası"
// musteriAdi, telefon: sigortalinin bilgileri
// ozetSatirlari: string dizisi
//   - "teklif" formatinda (varsayilan): "Soru: Cevap" formatinda satirlar
//   - "satis" formatinda: Garanti Emeklilik'in tam tablo formatinda hazir satirlar
//     (orn. "Ürün Adı: Premium Prim İadeli Hayat Sigortası")
// ekBelgeler: [{ dosyaAdi, mimeType, veriBase64 }] - satis kaydinda zorunlu evraklar
// konuFormati: "teklif" (varsayilan, "Yeni {urun} Talebi - {musteri}") ya da
//   "satis" ("{urun} {musteri}" - Garanti'nin bekledigi tam konu formati)
// acilisMetni: sadece "satis" formatinda kullanilir - govdenin ilk cumlesini
//   override eder (orn. musterinin aranmasini istedigi tarih/saat araligi).
//   Verilmezse eski sabit metne ("Müşterimizin uzaktan aranmasını rica
//   ederiz.") geri duser.
async function garantiEmekliligeGonder({
  urunAdi,
  musteriAdi,
  telefon,
  ozetSatirlari,
  ekBelgeler,
  konuFormati = "teklif",
  acilisMetni
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const gonderenAdresi = process.env.EPOSTA_GONDEREN_ADRESI;
  if (!apiKey || !gonderenAdresi) {
    console.warn(
      "RESEND_API_KEY / EPOSTA_GONDEREN_ADRESI tanimli degil - Garanti Emeklilik maili gonderilemedi."
    );
    return { basarili: false, sebep: "RESEND_API_KEY / EPOSTA_GONDEREN_ADRESI tanımlı değil" };
  }

  // TEST MODU: EPOSTA_TEST_ADRESI ortam degiskeni tanimliysa, mail Garanti
  // Emeklilik'e DEGIL, bu test adresine gider - boylece gercek adresi
  // gereksiz yere meşgul etmeden deneme yapabiliriz. Test bitince bu
  // degiskeni Railway'den kaldirmaniz yeterli, otomatik olarak gercek
  // alicilara donulur.
  const testAdresi = process.env.EPOSTA_TEST_ADRESI;
  const aliciListesi = testAdresi ? [testAdresi] : GARANTI_EMEKLILIK_ALICILARI;
  const konuOnEki = testAdresi ? "[TEST] " : "";

  const konu =
    konuFormati === "satis"
      ? `${konuOnEki}${urunAdi} ${musteriAdi}`
      : `${konuOnEki}Yeni ${urunAdi} Talebi - ${musteriAdi}`;

  const govde =
    konuFormati === "satis"
      ? `Merhaba,\n${acilisMetni || "Müşterimizin uzaktan aranmasını rica ederiz."}\n\n${ozetSatirlari.join("\n")}\n\n---\nBu mail WE Sigorta CRM tarafından otomatik olarak gönderilmiştir.`
      : `Yeni ${urunAdi} talebi\n\nMüşteri: ${musteriAdi}\nTelefon: ${telefon}\n\n${ozetSatirlari.join("\n")}\n\n---\nBu mail WE Sigorta CRM tarafından otomatik olarak gönderilmiştir.`;

  // Resend, eklerin icerigini base64 STRING olarak bekliyor (Buffer degil) -
  // bizim veriBase64 zaten base64 string oldugu icin dogrudan gonderebiliyoruz.
  const attachments = (ekBelgeler || []).map((belge) => ({
    filename: belge.dosyaAdi,
    content: belge.veriBase64
  }));

  const govdeJson = {
    from: `WE Sigorta <${gonderenAdresi}>`,
    to: aliciListesi,
    subject: konu,
    text: govde,
    attachments
  };

  // Garanti Emeklilik bazen bu maile CEVAP yaziyor - "from" adresi Resend'de
  // dogrulanmis domain uzerinden gitmek ZORUNDA (wesigorta.com.tr gibi,
  // enbel@outlook.com.tr'yi "from" olarak kullanamayiz cunku o domain'in
  // DNS'ine erisimimiz yok, SPF/DKIM/DMARC dogrulamasini gecemez ve
  // spam/sahte mail olarak isaretlenir). Bunun yerine EPOSTA_YANIT_ADRESI
  // tanimliysa "Reply-To" olarak ekleniyor - Garanti Emeklilik "Yanıtla"ya
  // bastiginda cevap dogrudan bu adrese (orn. enbel@outlook.com.tr) gider,
  // "from" adresine degil.
  if (process.env.EPOSTA_YANIT_ADRESI) {
    govdeJson.reply_to = process.env.EPOSTA_YANIT_ADRESI;
  }

  // "Connection timeout" gibi hatalar cogunlukla GECICI bir ag sorunudur -
  // bu yuzden ilk deneme basarisiz olursa kisa bir bekleme sonrasi 1 kez
  // daha deneniyor. Ikinci deneme de basarisiz olursa danismana/loglara
  // durum oldugu gibi bildiriliyor (bkz. advisorEngine.js satisTamamla).
  const MAKS_DENEME = 2;
  let sonHata = null;
  for (let deneme = 1; deneme <= MAKS_DENEME; deneme++) {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(govdeJson)
      });

      if (!response.ok) {
        const hataMetni = await response.text().catch(() => "");
        throw new Error(`Resend API hatasi (HTTP ${response.status}): ${hataMetni}`);
      }

      console.log(
        `Garanti Emeklilik maili gonderildi (${testAdresi ? "TEST MODU: " + testAdresi : "GERCEK ALICILAR"}, ${attachments.length} ek, ${deneme}. denemede): ${urunAdi} - ${musteriAdi}`
      );
      return { basarili: true };
    } catch (err) {
      sonHata = err;
      console.error(`Garanti Emeklilik maili gonderilemedi (${deneme}. deneme):`, err.message);
      if (deneme < MAKS_DENEME) {
        await bekle(3000);
      }
    }
  }
  return { basarili: false, sebep: sonHata ? sonHata.message : "bilinmeyen hata" };
}

module.exports = { garantiEmekliligeGonder };
