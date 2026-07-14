// Tamamlanan her sigorta talebini bir "kayit" (lead) olarak tutar ve takip
// eder: hangi danisman sorumlu, durum ne (bekliyor/takipte/olumlu/olumsuz),
// notlar ve hatirlatmalar. Panel bu modulu kullanarak danismanlarin
// talepleri sonuclandirip sonuclandirmadigini gorur.
//
// NOT: Diger her sey gibi bu da bellekte tutulur - sunucu yeniden
// baslarsa (deploy, restart) kayitlar sifirlanir. Kalici bir veritabanina
// tasinana kadar gecerli bir sinirlama.

const leads = new Map(); // id -> lead
let sayac = 0;

const DURUMLAR = ["Bekliyor", "Takipte", "Olumlu Kapandı", "Olumsuz Kapandı"];

function yeniLeadOlustur({ telefon, musteriAdi, urun, danismanAdi, danismanNumarasi, ozet }) {
  sayac += 1;
  const id = `L${Date.now()}${sayac}`;
  const lead = {
    id,
    telefon,
    musteriAdi,
    urun,
    danismanAdi: danismanAdi || null,
    danismanNumarasi: danismanNumarasi || null,
    ozet,
    durum: "Bekliyor",
    notlar: [], // { metin, tarih }
    hatirlatma: null, // { zaman: timestamp, not: string, gonderildi: bool }
    olusturulmaZamani: Date.now(),
    guncellenmeZamani: Date.now()
  };
  leads.set(id, lead);
  return lead;
}

function tumLeadleriGetir() {
  return Array.from(leads.values()).sort((a, b) => b.olusturulmaZamani - a.olusturulmaZamani);
}

function leadGetir(id) {
  return leads.get(id) || null;
}

function durumGuncelle(id, yeniDurum) {
  const lead = leads.get(id);
  if (!lead) return null;
  if (!DURUMLAR.includes(yeniDurum)) return null;
  lead.durum = yeniDurum;
  lead.guncellenmeZamani = Date.now();
  // Talep kapandiysa (olumlu/olumsuz) bekleyen hatirlatma varsa iptal edilir.
  if (yeniDurum === "Olumlu Kapandı" || yeniDurum === "Olumsuz Kapandı") {
    lead.hatirlatma = null;
  }
  return lead;
}

function notEkle(id, metin) {
  const lead = leads.get(id);
  if (!lead || !metin) return null;
  lead.notlar.push({ metin, tarih: Date.now() });
  lead.guncellenmeZamani = Date.now();
  return lead;
}

// zamanMs: hatirlatmanin gonderilecegi kesin zaman (Unix ms cinsinden).
function hatirlatmaKur(id, zamanMs, not) {
  const lead = leads.get(id);
  if (!lead || !zamanMs) return null;
  lead.hatirlatma = { zaman: zamanMs, not: not || "", gonderildi: false };
  // Hatirlatma kurulmasi, taleple aktif ilgilenildigini gosterir - durumu
  // otomatik "Takipte" yapiyoruz (zaten "Bekliyor" ise).
  if (lead.durum === "Bekliyor") {
    lead.durum = "Takipte";
  }
  lead.guncellenmeZamani = Date.now();
  return lead;
}

// Zamani gelmis (ve henuz gonderilmemis) tum hatirlatmalari doner.
function zamaniGelenHatirlatmalar() {
  const simdi = Date.now();
  return tumLeadleriGetir().filter(
    (lead) => lead.hatirlatma && !lead.hatirlatma.gonderildi && lead.hatirlatma.zaman <= simdi
  );
}

function hatirlatmaGonderildiIsaretle(id) {
  const lead = leads.get(id);
  if (!lead || !lead.hatirlatma) return;
  lead.hatirlatma.gonderildi = true;
}

module.exports = {
  DURUMLAR,
  yeniLeadOlustur,
  tumLeadleriGetir,
  leadGetir,
  durumGuncelle,
  notEkle,
  hatirlatmaKur,
  zamaniGelenHatirlatmalar,
  hatirlatmaGonderildiIsaretle
};
