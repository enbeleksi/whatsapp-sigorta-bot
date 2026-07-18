// Tamamlanan her sigorta talebini bir "kayit" (lead) olarak tutar ve takip
// eder: hangi danisman sorumlu, durum ne (bekliyor/takipte/olumlu/olumsuz),
// notlar ve hatirlatmalar. Panel ve advisorEngine.js bu modulu kullanarak
// danismanlarin talepleri sonuclandirip sonuclandirmadigini gorur.
//
// Okuma/yazma hala hizli bellek-ici (in-memory) Map uzerinden yapilir. Ayrica
// yukle()/kaydet() ile PostgreSQL'e periyodik yedeklenir (DATABASE_URL
// tanimliysa) - detaylar icin db.js'e bakin.

const db = require("./db");

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
    belgeler: [], // { dosyaAdi, mimeType, veriBase64, yuklenmeZamani }
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

// Bir talebe belge/fotograf ekler (danisman WhatsApp'tan gonderdiginde,
// ya da panelden yuklendiginde kullanilir).
function belgeEkle(id, { dosyaAdi, mimeType, veriBase64 }) {
  const lead = leads.get(id);
  if (!lead || !veriBase64) return null;
  if (!lead.belgeler) lead.belgeler = [];
  lead.belgeler.push({
    dosyaAdi: dosyaAdi || "belge",
    mimeType: mimeType || "application/octet-stream",
    veriBase64,
    yuklenmeZamani: Date.now()
  });
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

// Bir danismanin kendi performans ozetini cikartir (WhatsApp'tan "Performansım"
// menusu icin) - panel'deki /api/panel/stats ile ayni donusum orani mantigini
// kullanir, sadece bu danismana ait taleplerle sinirlandirilmis haliyle.
function danismanIstatistikleri(danismanNumarasi) {
  const hepsi = tumLeadleriGetir().filter((l) => l.danismanNumarasi === danismanNumarasi);
  const simdi = new Date();
  const ayBaslangic = new Date(simdi.getFullYear(), simdi.getMonth(), 1).getTime();
  const buAy = hepsi.filter((l) => l.olusturulmaZamani >= ayBaslangic);

  const olumluToplam = hepsi.filter((l) => l.durum === "Olumlu Kapandı").length;
  const olumsuzToplam = hepsi.filter((l) => l.durum === "Olumsuz Kapandı").length;
  const kapananToplam = olumluToplam + olumsuzToplam;
  const donusumOrani = kapananToplam > 0 ? Math.round((olumluToplam / kapananToplam) * 100) : null;
  const olumluBuAy = buAy.filter((l) => l.durum === "Olumlu Kapandı").length;
  const acikSayisi = hepsi.filter((l) => l.durum === "Bekliyor" || l.durum === "Takipte").length;

  return {
    toplamTalep: hepsi.length,
    buAyTalep: buAy.length,
    acikSayisi,
    olumluToplam,
    olumluBuAy,
    donusumOrani
  };
}

// Sunucu baslarken bir kez cagrilir - DB'de kayitli talepler varsa belleğe yukler.
async function yukle() {
  const veri = await db.oku("leads");
  if (veri) {
    Object.entries(veri).forEach(([id, lead]) => leads.set(id, lead));
    console.log(`${Object.keys(veri).length} talep veritabanindan yuklendi.`);
    // sayac'i, en yuksek mevcut ID'nin uzerine cikacak sekilde ayarlamaya gerek yok
    // cunku ID uretimi zaten Date.now() + sayac kombinasyonu, cakisma riski yok.
  }
}

// Periyodik olarak (server.js'deki zamanlayici ile) cagrilir - tum talepleri DB'ye yazar.
async function kaydet() {
  const obj = Object.fromEntries(leads);
  await db.yaz("leads", obj);
}

module.exports = {
  DURUMLAR,
  yeniLeadOlustur,
  tumLeadleriGetir,
  leadGetir,
  durumGuncelle,
  notEkle,
  belgeEkle,
  hatirlatmaKur,
  zamaniGelenHatirlatmalar,
  hatirlatmaGonderildiIsaretle,
  danismanIstatistikleri,
  yukle,
  kaydet
};
