// Serbest metin sorularina girilen cevaplarin makul bir formatta olup
// olmadigini kontrol eden yardimci fonksiyonlar. Her fonksiyon (metin) => true/false doner.

// T.C. kimlik numarasi resmi algoritmaya gore dogrulanir (11 hane, checksum kontrolu).
function tcKimlikGecerliMi(value) {
  const v = (value || "").replace(/\s/g, "");
  if (!/^[1-9][0-9]{10}$/.test(v)) return false;

  const digits = v.split("").map(Number);
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const digit10 = (oddSum * 7 - evenSum) % 10;
  const digit11 = (digits.slice(0, 10).reduce((a, b) => a + b, 0)) % 10;

  return digit10 === digits[9] && digit11 === digits[10];
}

// GG.AA.YYYY formatinda, gercekci bir tarih mi kontrol eder.
function tarihGecerliMi(value) {
  const match = (value || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;
  const gun = Number(match[1]);
  const ay = Number(match[2]);
  const yil = Number(match[3]);
  if (yil < 1900 || yil > new Date().getFullYear()) return false;
  if (ay < 1 || ay > 12) return false;
  const ayinGunSayisi = new Date(yil, ay, 0).getDate();
  return gun >= 1 && gun <= ayinGunSayisi;
}

// Basit bir yas kontrolu (1-120 arasi tam sayi).
function yasGecerliMi(value) {
  const v = (value || "").trim();
  if (!/^\d{1,3}$/.test(v)) return false;
  const n = Number(v);
  return n >= 1 && n <= 120;
}

// Pozitif bir tam sayi mi (metrekare, kat sayisi, hasta sayisi gibi alanlar icin).
function pozitifSayiMi(value) {
  const v = (value || "").trim();
  return /^\d{1,9}$/.test(v) && Number(v) > 0;
}

// Bir yil bilgisi mi (insaat yili, tescil tarihindeki yil gibi - 1900 ile bu yil arasi).
function yilGecerliMi(value) {
  const v = (value || "").trim();
  if (!/^\d{4}$/.test(v)) return false;
  const n = Number(v);
  return n >= 1900 && n <= new Date().getFullYear();
}

// Turkiye plaka formatina gevsek bir kontrol (orn. "34 ABC 123", "06 A 1234").
// Amac kesin resmi format kontrolu degil, tamamen anlamsiz bir girisi elemek.
function plakaGecerliMi(value) {
  const v = (value || "").trim().toUpperCase();
  return /^\d{2}\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,4}$/.test(v);
}

// Ruhsat belge seri numarasi: harflerle baslar, rakamlarla devam eder
// (orn. "AE123456"). Amac kesin resmi format kontrolu degil, tamamen
// anlamsiz bir girisi (orn. sadece rakam ya da "yok" gibi) elemek.
function ruhsatSeriNoGecerliMi(value) {
  const v = (value || "").trim().toUpperCase();
  return /^[A-ZÇĞİÖŞÜ]{1,3}\s?\d{4,8}$/.test(v);
}

module.exports = {
  tcKimlikGecerliMi,
  tarihGecerliMi,
  yasGecerliMi,
  pozitifSayiMi,
  yilGecerliMi,
  plakaGecerliMi,
  ruhsatSeriNoGecerliMi
};
