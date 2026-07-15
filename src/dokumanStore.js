// Urun basina bir PDF form/dokuman saklar (orn. "DASK bilgilendirme formu").
// Danismanlar WhatsApp uzerinden istedigi an bu dokumanlari talep edip
// alabilir. Panelden yuklenir, PostgreSQL'e (varsa) yedeklenir.
//
// Okuma/yazma hizli bellek-ici (in-memory) Map uzerinden yapilir. Ayrica
// yukle()/kaydet() ile PostgreSQL'e periyodik yedeklenir (DATABASE_URL
// tanimliysa) - detaylar icin db.js'e bakin.

const db = require("./db");

const dokumanlar = new Map(); // urunKey -> { dosyaAdi, mimeType, veriBase64, yuklenmeZamani }

function dokumanKaydet(urunKey, dosyaAdi, mimeType, buffer) {
  dokumanlar.set(urunKey, {
    dosyaAdi,
    mimeType,
    veriBase64: buffer.toString("base64"),
    yuklenmeZamani: Date.now()
  });
}

function dokumanGetir(urunKey) {
  return dokumanlar.get(urunKey) || null;
}

function dokumanSil(urunKey) {
  dokumanlar.delete(urunKey);
}

function hangiUrunlerdeDokumanVar() {
  return Array.from(dokumanlar.keys());
}

async function yukle() {
  const veri = await db.oku("dokumanlar");
  if (veri) {
    Object.entries(veri).forEach(([urunKey, dokuman]) => dokumanlar.set(urunKey, dokuman));
    console.log(`${Object.keys(veri).length} dokuman veritabanindan yuklendi.`);
  }
}

async function kaydet() {
  const obj = Object.fromEntries(dokumanlar);
  await db.yaz("dokumanlar", obj);
}

module.exports = {
  dokumanKaydet,
  dokumanGetir,
  dokumanSil,
  hangiUrunlerdeDokumanVar,
  yukle,
  kaydet
};
