// Danismanlarin WhatsApp uzerinden manuel olarak ekledigi police
// yenileme/bitis tarihi hatirlatma kayitlarini tutar. leadStore'daki
// taleplerden tamamen bagimsizdir - bir musterinin var olan (sistemden
// satilmis olsun ya da olmasin) policesinin ne zaman yenilenecegini takip
// etmek icindir (orn. "Ahmet Bey'in trafik poliçesi 34 ABC 123 plakali
// aracı için 12.09.2026'da bitiyor").
//
// Ileride Enbel'in gonderecegi toplu uretim Excel'inden de bu store'a kayit
// eklenebilir (ayni yapi kullanilir, kaynak alani "excel_import" olur) -
// simdilik sadece danismanlarin WhatsApp'tan tek tek ekledigi kayitlar var.
//
// Okuma/yazma bellek-ici (in-memory) Map uzerinden yapilir, leadStore ile
// ayni sekilde db.js araciligiyla PostgreSQL'e periyodik yedeklenir.

const db = require("./db");

const yenilemeler = new Map(); // id -> yenileme kaydi
let sayac = 0;

function yeniYenilemeOlustur({ danismanNumarasi, danismanAdi, musteriAdi, urun, plaka, bitisTarihi, kaynak }) {
  sayac += 1;
  const id = `Y${Date.now()}${sayac}`;
  const kayit = {
    id,
    danismanNumarasi: danismanNumarasi || null,
    danismanAdi: danismanAdi || null,
    musteriAdi,
    urun,
    plaka: plaka || null,
    bitisTarihi, // ms cinsinden (validators.tarihiMsYap ile uretilir)
    kaynak: kaynak || "danisman", // "danisman" | "excel_import"
    olusturulmaZamani: Date.now()
  };
  yenilemeler.set(id, kayit);
  return kayit;
}

function tumYenilemeleriGetir() {
  return Array.from(yenilemeler.values()).sort((a, b) => a.bitisTarihi - b.bitisTarihi);
}

// gunSayisi: bugunden itibaren kac gun ileriye kadar bakilacak (varsayilan 30).
// Gecmiste kalmis (henuz "kapatilmamis") kayitlar da "gecikmis" olarak listeye
// dahil edilir, boylece hicbir yenileme gozden kacmaz.
// danismanNumarasi verilirse sadece o danismana ait kayitlar donulur.
function yaklasanYenilemeleriGetir(gunSayisi = 30, danismanNumarasi = null) {
  const GUN_MS = 24 * 60 * 60 * 1000;
  const simdi = Date.now();
  const ufukTarihi = simdi + gunSayisi * GUN_MS;
  return tumYenilemeleriGetir().filter((y) => {
    if (danismanNumarasi && y.danismanNumarasi !== danismanNumarasi) return false;
    return y.bitisTarihi <= ufukTarihi;
  });
}

// Sunucu baslarken bir kez cagrilir - DB'de kayitli yenilemeler varsa belleğe yukler.
async function yukle() {
  const veri = await db.oku("yenilemeler");
  if (veri) {
    Object.entries(veri).forEach(([id, kayit]) => yenilemeler.set(id, kayit));
    console.log(`${Object.keys(veri).length} yenileme kaydi veritabanindan yuklendi.`);
  }
}

// Periyodik olarak (server.js'deki zamanlayici ile) cagrilir - tum yenilemeleri DB'ye yazar.
async function kaydet() {
  const obj = Object.fromEntries(yenilemeler);
  await db.yaz("yenilemeler", obj);
}

module.exports = {
  yeniYenilemeOlustur,
  tumYenilemeleriGetir,
  yaklasanYenilemeleriGetir,
  yukle,
  kaydet
};
