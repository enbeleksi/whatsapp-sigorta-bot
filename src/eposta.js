// BES ve Prim Iadeli Hayat Sigortasi taleplerini Garanti Emeklilik'e otomatik
// mail olarak yonlendirir - onlar bu talepleri kendi is akislarina ekleyip
// cagri merkezlerinden musteriyi ariyorlar.
//
// Outlook/Microsoft 365 SMTP uzerinden gonderilir. Hesap bilgileri Railway
// ortam degiskenlerinden okunur (OUTLOOK_EMAIL, OUTLOOK_APP_SIFRE) - koda
// asla yazilmaz. NOT: Microsoft, bu tarz sifre-tabanli SMTP erisimini 2026
// sonunda kaldiracagini duyurdu - o tarihe yaklasinca alternatif bir
// yonteme (OAuth ya da farkli bir eposta servisi) gecmemiz gerekebilir.
//
// "Connection timeout" HATASI ALINIRSA: bu, kimlik bilgilerinin (email/sifre)
// yanlis oldugu anlamina GELMEZ - Railway'in Outlook'un SMTP sunucusuna
// (smtp.office365.com:587) hic baglanti KURAMADIGI anlamina gelir. Asagida
// 1 kez otomatik tekrar deneniyor (gecici bir ag aksamasiysa bu genelde
// yeterli oluyor). Tekrar denemeden sonra da surekli ayni hata aliniyorsa,
// en olasi sebep barinma sirketinin (Railway) disa giden SMTP portlarini
// (25/587) spam onleme amacli engellemis olmasidir - bircok PaaS platformunda
// yaygin bir kisitlamadir. O durumda kalici cozum ham SMTP yerine HTTPS
// uzerinden calisan bir eposta servisine (Microsoft Graph API, SendGrid,
// Resend vb.) gecmek olur - HTTPS (443) portu neredeyse hicbir yerde
// engellenmez.

const nodemailer = require("nodemailer");

const GARANTI_EMEKLILIK_ALICILARI = [
  "gbeacentelerkoordinasyon@garantibbvaemeklilik.com.tr",
  "gbeacenteler@garantibbvaemeklilik.com.tr"
];

let transportOnbellek = null;

function transportGetir() {
  const email = process.env.OUTLOOK_EMAIL;
  const sifre = process.env.OUTLOOK_APP_SIFRE;
  if (!email || !sifre) return null;

  if (!transportOnbellek) {
    transportOnbellek = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // STARTTLS (port 587)
      auth: { user: email, pass: sifre },
      // Nodemailer'in varsayilan baglanti zaman asimi degerleri cok uzun
      // (bazen dakikalarca "asili" kalip sonra "Connection timeout" hatasi
      // veriyor) - bunlari kisa ve acik tutuyoruz ki gecici bir aglantisi
      // sorununda hizlica hata alip asagidaki retry mekanizmasi devreye girsin.
      connectionTimeout: 15000, // TCP baglantisi kurulamazsa 15sn'de vazgec
      greetingTimeout: 15000, // sunucudan "merhaba" cevabi gelmezse 15sn'de vazgec
      socketTimeout: 20000 // gonderim sirasinda soket 20sn sessiz kalirsa vazgec
    });
  }
  return transportOnbellek;
}

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
  const transport = transportGetir();
  if (!transport) {
    console.warn(
      "OUTLOOK_EMAIL / OUTLOOK_APP_SIFRE tanimli degil - Garanti Emeklilik maili gonderilemedi."
    );
    return { basarili: false, sebep: "OUTLOOK_EMAIL / OUTLOOK_APP_SIFRE tanımlı değil" };
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

  const attachments = (ekBelgeler || []).map((belge) => ({
    filename: belge.dosyaAdi,
    content: Buffer.from(belge.veriBase64, "base64"),
    contentType: belge.mimeType
  }));

  // "Connection timeout" gibi hatalar cogunlukla GECICI bir ag sorunudur
  // (Railway <-> Outlook SMTP arasinda tek seferlik bir aksama) - bu yuzden
  // ilk deneme basarisiz olursa kisa bir bekleme sonrasi 1 kez daha deneniyor.
  // Ikinci deneme de basarisiz olursa artik gercekten bir sorun var demektir
  // (orn. barinma sirketinin SMTP portlarini engellemesi ya da kimlik bilgisi
  // hatasi) ve bu durum danismana/loglara oldugu gibi bildiriliyor.
  const MAKS_DENEME = 2;
  let sonHata = null;
  for (let deneme = 1; deneme <= MAKS_DENEME; deneme++) {
    try {
      await transport.sendMail({
        from: `"WE Sigorta" <${process.env.OUTLOOK_EMAIL}>`,
        to: aliciListesi.join(", "),
        subject: konu,
        text: govde,
        attachments
      });
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
