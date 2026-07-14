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

async function yaz(anahtar, veri) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_state (anahtar, veri, guncellenme_zamani) VALUES ($1, $2, now())
     ON CONFLICT (anahtar) DO UPDATE SET veri = $2, guncellenme_zamani = now()`,
    [anahtar, JSON.stringify(veri)]
  );
}

module.exports = { pool, init, oku, yaz };
