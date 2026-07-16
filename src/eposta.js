// BES ve Prim Iadeli Hayat Sigortasi taleplerini Garanti Emeklilik'e otomatik
// mail olarak yonlendirir - onlar bu talepleri kendi is akislarina ekleyip
// cagri merkezlerinden musteriyi ariyorlar.
//
// Outlook/Microsoft 365 SMTP uzerinden gonderilir. Hesap bilgileri Railway
// ortam degiskenlerinden okunur (OUTLOOK_EMAIL, OUTLOOK_APP_SIFRE) - koda
// asla yazilmaz. NOT: Microsoft, bu tarz sifre-tabanli SMTP erisimini 2026
// sonunda kaldiracagini duyurdu - o tarihe yaklasinca alternatif bir
// yonteme (OAuth ya da farkli bir eposta servisi) gecmemiz gerekebilir.

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
      auth: { user: email, pass: sifre }
    });
  }
  return transportOnbellek;
}

// urunAdi: orn. "Bireysel Emeklilik Sistemi (BES)" ya da "Prim İadeli Hayat Sigortası"
// musteriAdi, telefon: sigortalinin bilgileri
// ozetSatirlari: string dizisi, her biri "Soru: Cevap" formatinda bir satir
async function garantiEmekliligeGonder({ urunAdi, musteriAdi, telefon, ozetSatirlari }) {
  const transport = transportGetir();
  if (!transport) {
    console.warn(
      "OUTLOOK_EMAIL / OUTLOOK_APP_SIFRE tanimli degil - Garanti Emeklilik maili gonderilemedi."
    );
    return;
  }

  // TEST MODU: EPOSTA_TEST_ADRESI ortam degiskeni tanimliysa, mail Garanti
  // Emeklilik'e DEGIL, bu test adresine gider - boylece gercek adresi
  // gereksiz yere meşgul etmeden deneme yapabiliriz. Test bitince bu
  // degiskeni Railway'den kaldirmaniz yeterli, otomatik olarak gercek
  // alicilara donulur.
  const testAdresi = process.env.EPOSTA_TEST_ADRESI;
  const aliciListesi = testAdresi ? [testAdresi] : GARANTI_EMEKLILIK_ALICILARI;
  const konuOnEki = testAdresi ? "[TEST] " : "";

  const govde =
    `Yeni ${urunAdi} talebi\n\n` +
    `Müşteri: ${musteriAdi}\n` +
    `Telefon: ${telefon}\n\n` +
    ozetSatirlari.join("\n") +
    `\n\n---\nBu mail WE Sigorta CRM tarafından otomatik olarak gönderilmiştir.`;

  try {
    await transport.sendMail({
      from: `"WE Sigorta" <${process.env.OUTLOOK_EMAIL}>`,
      to: aliciListesi.join(", "),
      subject: `${konuOnEki}Yeni ${urunAdi} Talebi - ${musteriAdi}`,
      text: govde
    });
    console.log(
      `Garanti Emeklilik maili gonderildi (${testAdresi ? "TEST MODU: " + testAdresi : "GERCEK ALICILAR"}): ${urunAdi} - ${musteriAdi}`
    );
  } catch (err) {
    console.error("Garanti Emeklilik maili gonderilemedi:", err.message);
  }
}

module.exports = { garantiEmekliligeGonder };
