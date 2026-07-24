// Web hesaplayici teklif bildirimi endpointi
// Gerekli env: TEKLIF_SECRET, NOTIFY_NUMBER (orn. 905326876126)
module.exports = function (app) {
  const db = require('./db');
  const { sendText } = require('./whatsapp');
  const IZINLI = ['https://wesigorta.com.tr', 'https://www.wesigorta.com.tr'];

  function cors(req, res) {
    const o = req.headers.origin;
    if (IZINLI.includes(o)) res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  app.options('/api/teklif', function (req, res) { cors(req, res); res.sendStatus(204); });

  app.post('/api/teklif', async function (req, res) {
    cors(req, res);
    try {
      const b = req.body || {};
      if (!process.env.TEKLIF_SECRET || b.secret !== process.env.TEKLIF_SECRET) {
        return res.status(401).json({ ok: false });
      }
      if (!b.ad || !b.telefon) return res.status(400).json({ ok: false });

      await db.pool.query(
        'CREATE TABLE IF NOT EXISTS web_teklifler (' +
        'id SERIAL PRIMARY KEY, tarih TIMESTAMPTZ DEFAULT NOW(), ' +
        'ad TEXT, telefon TEXT, kisi_tipi TEXT, gelir_aylik_tl INTEGER, ' +
        'odeme_donemi TEXT, prim_usd INTEGER, prim_tl INTEGER, paket TEXT, ' +
        'teminat_usd INTEGER, yas INTEGER, cinsiyet TEXT, ' +
        'aylik_tasarruf_tl INTEGER, yillik_tasarruf_tl INTEGER, ' +
        'danisman TEXT, kur NUMERIC, kaynak TEXT)'
      );
      await db.pool.query(
        'INSERT INTO web_teklifler (ad, telefon, kisi_tipi, gelir_aylik_tl, odeme_donemi, prim_usd, prim_tl, paket, teminat_usd, yas, cinsiyet, aylik_tasarruf_tl, yillik_tasarruf_tl, danisman, kur, kaynak) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
        [b.ad, b.telefon, b.kisiTipi || null, b.gelirAylikTL || null, b.odemeDonemi || null,
         b.primUsd || null, b.primTL || null, b.paket || null, b.teminatUsd || null,
         b.yas || null, b.cinsiyet || null, b.aylikTasarrufTL || null, b.yillikTasarrufTL || null,
         b.danisman || null, b.kur || null, b.kaynak || 'web']
      );

      var mesaj = '*Yeni Web Teklifi!*\n\n' +
        'Ad: ' + b.ad + '\n' +
        'Tel: ' + b.telefon + '\n' +
        'Tip: ' + (b.kisiTipi || '-') + '\n' +
        'Prim: ' + (b.primUsd || '-') + ' USD / ' + (b.odemeDonemi || 'aylik') + ' (' + (b.paket || '-') + ' Paket)\n' +
        (b.teminatUsd ? 'Teminat: ~' + b.teminatUsd + ' USD' + (b.yas ? ' (' + b.yas + ' yas, ' + (b.cinsiyet || '') + ')' : '') + '\n' : '') +
        'Yillik vergi avantaji: ' + (b.yillikTasarrufTL || 0) + ' TL\n' +
        (b.danisman ? 'Danisman: ' + b.danisman + '\n' : '') +
        '\nMusteri PDF teklifini indirdi, sicakken arayin!';

      var alicilar = [];
      if (process.env.NOTIFY_NUMBER) alicilar.push(process.env.NOTIFY_NUMBER.trim());
      if (b.danismanTel) {
        var d = String(b.danismanTel).replace(/\D/g, '');
        if (d.length === 11 && d.charAt(0) === '0') {
          var n = '9' + d;
          if (alicilar.indexOf(n) === -1) alicilar.push(n);
        }
      }
      for (var i = 0; i < alicilar.length; i++) {
        try { await sendText(alicilar[i], mesaj); }
        catch (e) { console.error('Teklif bildirimi gonderilemedi:', alicilar[i], e.message); }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('Teklif endpoint hatasi:', e);
      res.status(500).json({ ok: false });
    }
  });

  console.log('/api/teklif endpoint aktif (web hesaplayici)');
};

