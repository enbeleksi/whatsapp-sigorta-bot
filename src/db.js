// PostgreSQL baglantisini yonetir. Tasarim bilinçli olarak basit tutuldu:
// tum uygulama verisi (oturumlar, mesaj gecmisi, talepler) JSON blob olarak
// tek bir tabloda saklanir - karmasik bir iliskisel semaya gerek yok, cunku
// veri yapilarimiz zaten esnek (JS nesneleri/diziler).
//
// Railway'de bir PostgreSQL eklendiginde DATABASE_URL ortam degiskeni otomatik
// olusur. Bu degisken yoksa (orn. yerel test ortaminda), pool null kalir ve
// sistem sadece bellek-ici calismaya devam eder (kalicilik olmadan) - hicbir
// hata firlatmaz, sessizce devre disi kalir.

const { Pool } = require("pg");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

// KRITIK: pg kutuphanesinin bilinen bir tuzagi - havuzdaki BOSTA (idle) bir
// baglanti arka planda (herhangi bir sorgu calismiyorken) kesilirse/hata
// alirsa, Pool nesnesi bunu bir "error" event'i olarak yayinlar. Bu event'i
// dinleyen KIMSE yoksa, Node.js bunu yakalanmamis bir hata sayip TUM
// SURECI cokertiyor - aktif bir sorgumuz olmasa, try/catch'imiz olsa bile
// (cunku o an calisan bir await/query yok, hata bir query'nin disinda
// olusuyor). Railway'de PostgreSQL kisa sureli yeniden baslatildiginda ya
// da ag hipi yasandiginda tam olarak bu sekilde tum uygulama beklenmedik
// bir sekilde cokup yeniden baslatiliyordu (bkz. 20.07.2026 log kaydi).
// Burada bos bir "error" dinleyicisi eklemek, Node'un bu davranisini
// devre disi birakip hatayi sadece loglayarak sunucunun ayakta kalmasini
// sagliyor.
if (pool) {
  pool.on("error", (err) => {
    console.error(
      "PostgreSQL havuzunda beklenmeyen bir baglanti hatasi olustu (yakalandi, sunucu CALISMAYA devam ediyor):",
      err.message
    );
  });
}

async function init() {
  if (!pool) {
    console.warn(
      "DATABASE_URL tanimli degil - veriler kalici olarak saklanmayacak, sadece bellekte tutulacak."
    );
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      anahtar TEXT PRIMARY KEY,
      veri JSONB NOT NULL,
      guncellenme_zamani TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log("Veritabani baglantisi hazir.");
}

async function oku(anahtar) {
  if (!pool) return null;
  const { rows } = await pool.query("SELECT veri FROM app_state WHERE anahtar = $1", [anahtar]);
  return rows.length ? rows[0].veri : null;
}

// KRITIK: server.js her YEDEKLEME_SIKLIGI_MS'de (15 saniyede) bir, sessions/
// leads/messages/dokumanlar/yenilemeler icin BU FONKSIYONU KOSULSUZ cagirir -
// veri gercekten degismis olsun ya da olmasin. "leads" ve "dokumanlar"
// tablolari, tamamlanan her satisin belgelerini (kimlik/imza/saglik beyani
// fotograflari + birlestirilmis PDF) BASE64 olarak KALICI OLARAK icinde
// tasiyor - satis sayisi arttikca bu JSONB blob'u MB'larca buyuyebiliyor.
// Degismemis olsa bile bu koca blob'u her 15 saniyede bir OLDUGU GIBI
// yeniden yazmak (INSERT ... ON CONFLICT DO UPDATE, yani her seferinde YENI
// bir satir versiyonu + tam WAL kaydi) devasa, tamamen gereksiz bir WAL
// (write-ahead log) trafigi yaratiyordu - tam olarak bu yuzden Railway'deki
// kucuk Postgres volume'u ("No space left on device" / WAL PANIC, bkz.
// 20.07.2026 log kaydi) dolup cokme dongusune girdi.
// Cozum: her anahtar icin EN SON basariyla yazilan veriyi (JSON string
// olarak) bellekte tutuyoruz - gelen veri bununla BIREBIR AYNIYSA veritabanina
// hic dokunmuyoruz. Boylece sadece GERCEKTEN degisen veri (yeni bir mesaj,
// yeni bir satis, yeni bir belge vb.) diske yaziliyor - periyodik "yoklama"
// artik bos yere WAL uretmiyor.
const sonYazilanJson = new Map(); // anahtar -> en son basariyla yazilan veri (JSON string)

async function yaz(anahtar, veri) {
  if (!pool) return;
  const veriJson = JSON.stringify(veri);
  if (sonYazilanJson.get(anahtar) === veriJson) {
    return; // veri son basarili yazimdan beri degismedi - gereksiz WAL uretmeyelim
  }
  await pool.query(
    `INSERT INTO app_state (anahtar, veri, guncellenme_zamani) VALUES ($1, $2, now())
     ON CONFLICT (anahtar) DO UPDATE SET veri = $2, guncellenme_zamani = now()`,
    [anahtar, veriJson]
  );
  // Cache'i SADECE basarili yazimdan SONRA guncelliyoruz - query() hata
  // firlatirsa (orn. baglanti kopmussa) cache eskisi gibi kalir, boylece bir
  // sonraki denemede bu degisiklik ATLANMAZ, tekrar yazilmaya calisilir.
  sonYazilanJson.set(anahtar, veriJson);
}

module.exports = { pool, init, oku, yaz };
