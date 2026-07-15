require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
const { handleIncoming, hatirlatmaGonder } = require("./conversationEngine");
const advisorEngine = require("./advisorEngine");
const { sendText, sendDocument } = require("./loggedWhatsapp");
const messageLog = require("./messageLog");
const leadStore = require("./leadStore");
const dokumanStore = require("./dokumanStore");
const flows = require("./flows");
const db = require("./db");
const sessionStore = require("./sessionStore");
const { getSession } = sessionStore;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false })); // /panel/dogrula form gonderimi icin

// Panelden yuklenen dosyalari bellekte tutan gecici depolama (diske yazmiyoruz,
// direkt WhatsApp'a yukleyip atiyoruz). 16MB'a kadar dosya kabul eder.
const { dosyaTuruIzinliMi } = require("./izinliDosyaTurleri");

// Sadece PDF, Word, Excel ve fotograf turlerini kabul eder - kotu amacli
// dosyalarin (calistirilabilir, arsiv vb.) yuklenmesini engellemek icin.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (dosyaTuruIzinliMi(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Desteklenmeyen dosya turu. Sadece PDF, Word, Excel ve fotograf dosyalari yuklenebilir."));
    }
  }
});

// --- Ayni WhatsApp mesajinin iki kez islenmesini onleme (webhook tekrari) ---
// Meta bazen ag sorunlari yuzunden ayni mesaji webhook'a birden fazla kez
// gonderebilir. Bu durumda ayni cevap, bot tarafindan yanlislikla iki farkli
// soruya verilmis cevap gibi islenip akisi bozabilir. Her mesajin WhatsApp'in
// verdigi benzersiz "id"sini tutup, daha once gordugumuz bir id'yi tekrar
// islemeyerek bunu onluyoruz.
const islenenMesajIdleri = new Set();
const islenenMesajSirasi = [];
const MAX_TUTULAN_MESAJ_ID = 2000;

function mesajDahaOnceIslendiMi(mesajId) {
  if (!mesajId) return false; // id yoksa (beklenmedik durum) guvenli tarafta kal, isle
  if (islenenMesajIdleri.has(mesajId)) return true;
  islenenMesajIdleri.add(mesajId);
  islenenMesajSirasi.push(mesajId);
  if (islenenMesajSirasi.length > MAX_TUTULAN_MESAJ_ID) {
    const enEski = islenenMesajSirasi.shift();
    islenenMesajIdleri.delete(enEski);
  }
  return false;
}

// --- Sifre + WhatsApp OTP ile iki faktorlu giris (temsilci paneli icin) ---
// 1. faktor: kullanici adi/sifre (tarayicinin standart Basic Auth kutusu).
// 2. faktor: WhatsApp'a gonderilen 6 haneli tek kullanimlik kod - GIRIS YAPAN
//    KISININ KENDI numarasina gider (herkes kendi telefonuna kod alir).
// Basariyla dogrulanan bir tarayici, 12 saat boyunca tekrar kod girmek zorunda kalmaz.
const crypto = require("crypto");

function escapeHtmlSunucu(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// Panele girebilecek kisiler. Her birinin kendi kullanici adi/sifresi ve kendi
// WhatsApp numarasi var - sifreler Railway'deki ortam degiskenlerinden okunur,
// numaralar zaten sistemde bilindigi icin burada sabit tanimli. Yeni bir kisi
// eklemek icin bu listeye bir satir eklemeniz (+ ilgili sifre ortam
// degiskenini Railway'e tanimlamaniz) yeterlidir.
const PANEL_KULLANICILARI = [
  {
    kullaniciAdi: "enbeleksi",
    sifre: process.env.PANEL_ENBEL_SIFRE,
    telefon: "905326876126",
    ad: "Enbel"
  },
  {
    kullaniciAdi: "bahadireksi",
    sifre: process.env.PANEL_BAHADIR_SIFRE,
    telefon: "905380711711",
    ad: "Bahadır"
  }
];

const OTP_GECERLILIK_MS = 5 * 60 * 1000; // 5 dakika
const OTURUM_GECERLILIK_MS = 12 * 60 * 60 * 1000; // 12 saat

const otpDenemeleri = new Map(); // denemeToken -> { kod, expiresAt, kullaniciAdi }
const dogrulanmisOturumlar = new Map(); // oturumToken -> { expiresAt, kullaniciAdi }

function rastgeleToken() {
  return crypto.randomBytes(24).toString("hex");
}

function altiHaneliKod() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cookieOku(req, isim) {
  const header = req.headers.cookie;
  if (!header) return null;
  const parca = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(isim + "="));
  return parca ? decodeURIComponent(parca.split("=").slice(1).join("=")) : null;
}

function cookieYaz(res, isim, deger, maxAgeMs) {
  res.append(
    "Set-Cookie",
    `${isim}=${encodeURIComponent(deger)}; HttpOnly; Path=/; Max-Age=${Math.floor(maxAgeMs / 1000)}; SameSite=Lax`
  );
}

// Basic Auth basliginda gelen kullanici adi/sifre, tanimli kullanicilardan
// birine uyuyor mu diye bakar. Uyarsa o kullaniciyi (ve dolayisiyla telefon
// numarasini) dondurur, uymazsa null doner.
function basicAuthKullaniciBul(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Basic ")) return null;
  const decoded = Buffer.from(auth.split(" ")[1], "base64").toString();
  const [girilenKullanici, girilenSifre] = decoded.split(":");
  return (
    PANEL_KULLANICILARI.find(
      (k) =>
        k.sifre &&
        k.kullaniciAdi === (girilenKullanici || "").toLowerCase() &&
        k.sifre === girilenSifre
    ) || null
  );
}

function hicSifreTanimliDegilMi() {
  return PANEL_KULLANICILARI.every((k) => !k.sifre);
}

// Sadece 1. faktoru (sifre) dogrular - OTP giris sayfasinin kendisi icin kullanilir,
// aksi halde "OTP sayfasina git" ile "panelAuth" birbirini sonsuz dongude yonlendirir.
// Dogrulanan kullaniciyi req.panelKullanici'ya yazar (sonraki route bunu kullanir).
function sadeceSifreGerekli(req, res, next) {
  if (hicSifreTanimliDegilMi()) {
    return res.status(500).send("PANEL_ENBEL_SIFRE / PANEL_BAHADIR_SIFRE ortam degiskenleri ayarlanmamis.");
  }
  const kullanici = basicAuthKullaniciBul(req);
  if (!kullanici) {
    res.set("WWW-Authenticate", 'Basic realm="Temsilci Paneli"');
    return res.status(401).send("Giris gerekli.");
  }
  req.panelKullanici = kullanici;
  next();
}

// Tam koruma: hem sifre hem OTP ile dogrulanmis bir oturum gerektirir.
function panelAuth(req, res, next) {
  if (hicSifreTanimliDegilMi()) {
    return res.status(500).send("PANEL_ENBEL_SIFRE / PANEL_BAHADIR_SIFRE ortam degiskenleri ayarlanmamis.");
  }
  const kullanici = basicAuthKullaniciBul(req);
  if (!kullanici) {
    res.set("WWW-Authenticate", 'Basic realm="Temsilci Paneli"');
    return res.status(401).send("Giris gerekli.");
  }
  req.panelKullanici = kullanici;

  const oturumToken = cookieOku(req, "panel_oturum");
  const oturum = oturumToken && dogrulanmisOturumlar.get(oturumToken);
  // Oturumun, GIRIS YAPMAYA CALISAN kullaniciya ait oldugundan da emin oluyoruz
  // (orn. Bahadır'in cerezi Enbel icin gecerli sayilmasin).
  if (oturum && oturum.expiresAt > Date.now() && oturum.kullaniciAdi === kullanici.kullaniciAdi) {
    return next();
  }

  // Sifre dogru ama bu tarayici henuz OTP ile dogrulanmamis - dogrulama sayfasina yonlendir.
  return res.redirect(302, "/panel/dogrula");
}

// OTP dogrulama sayfasi: kod uretir, WhatsApp'tan (girisi yapanin KENDI
// numarasina) gonderir, girisi bekler.
app.get("/panel/dogrula", sadeceSifreGerekli, async (req, res) => {
  const kullanici = req.panelKullanici;
  let denemeToken = cookieOku(req, "panel_deneme");
  let deneme = denemeToken && otpDenemeleri.get(denemeToken);

  if (!deneme || deneme.expiresAt < Date.now() || deneme.kullaniciAdi !== kullanici.kullaniciAdi) {
    const kod = altiHaneliKod();
    denemeToken = rastgeleToken();
    deneme = { kod, expiresAt: Date.now() + OTP_GECERLILIK_MS, kullaniciAdi: kullanici.kullaniciAdi };
    otpDenemeleri.set(denemeToken, deneme);
    cookieYaz(res, "panel_deneme", denemeToken, OTP_GECERLILIK_MS);

    try {
      await sendText(
        kullanici.telefon,
        `🔐 WE Sigorta paneline giriş doğrulama kodunuz: ${kod}\n\nBu kod 5 dakika geçerlidir.`
      );
    } catch (err) {
      console.error("2FA kodu gonderilemedi:", err?.response?.data || err.message);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="tr"><head><meta charset="utf-8"><title>Doğrulama</title>
    <style>
      body { font-family: -apple-system, Segoe UI, Arial, sans-serif; max-width: 360px; margin: 80px auto; text-align: center; color: #333; }
      input { font-size: 22px; padding: 10px; width: 160px; text-align: center; letter-spacing: 6px; border: 1px solid #ccc; border-radius: 6px; }
      button { font-size: 15px; padding: 10px 24px; margin-top: 14px; background: #075E54; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
      .hata { color: #c00; margin-top: 10px; font-size: 13px; }
    </style>
    </head><body>
      <h2>🔐 Giriş Doğrulama</h2>
      <p>Merhaba ${escapeHtmlSunucu(kullanici.ad)}! WhatsApp'ınıza gönderilen 6 haneli kodu girin.</p>
      <form method="POST" action="/panel/dogrula">
        <input type="text" name="kod" maxlength="6" inputmode="numeric" autofocus required />
        <br/><button type="submit">Doğrula</button>
      </form>
      ${req.query.hata ? '<p class="hata">Kod hatalı veya süresi dolmuş, tekrar deneyin.</p>' : ""}
    </body></html>
  `);
});

app.post("/panel/dogrula", sadeceSifreGerekli, (req, res) => {
  const kullanici = req.panelKullanici;
  const denemeToken = cookieOku(req, "panel_deneme");
  const deneme = denemeToken && otpDenemeleri.get(denemeToken);
  const girilenKod = (req.body.kod || "").trim();

  if (
    !deneme ||
    deneme.expiresAt < Date.now() ||
    deneme.kullaniciAdi !== kullanici.kullaniciAdi ||
    girilenKod !== deneme.kod
  ) {
    return res.redirect(302, "/panel/dogrula?hata=1");
  }

  otpDenemeleri.delete(denemeToken);
  const oturumToken = rastgeleToken();
  dogrulanmisOturumlar.set(oturumToken, {
    expiresAt: Date.now() + OTURUM_GECERLILIK_MS,
    kullaniciAdi: kullanici.kullaniciAdi
  });
  cookieYaz(res, "panel_oturum", oturumToken, OTURUM_GECERLILIK_MS);
  res.redirect(302, "/panel");
});

// --- Temsilci paneli sayfasi ve API'leri ---
app.get("/panel", panelAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "panel.html"));
});

app.get("/api/panel/conversations", panelAuth, (req, res) => {
  res.json(messageLog.listConversations());
});

app.get("/api/panel/conversations/:phone", panelAuth, (req, res) => {
  const phone = req.params.phone;
  const session = getSession(phone);
  res.json({
    name: session.name,
    paused: !!session.paused,
    messages: messageLog.getMessages(phone)
  });
});

app.post("/api/panel/send", panelAuth, async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: "to ve message gerekli" });
  try {
    await sendText(to, message);
    res.json({ ok: true });
  } catch (err) {
    console.error("Panel mesaj gonderme hatasi:", err?.response?.data || err.message);
    res.status(500).json({ error: "Mesaj gonderilemedi" });
  }
});

// Panelden musteriye/danismana PDF (poliçe, teklif dosyasi vb.) gonderir.
// Form-data olarak gelir: "to" (telefon), "caption" (opsiyonel aciklama), "dosya" (PDF).
app.post("/api/panel/send-document", panelAuth, upload.single("dosya"), async (req, res) => {
  const { to, caption } = req.body;
  const dosya = req.file;
  if (!to || !dosya) return res.status(400).json({ error: "to ve dosya gerekli" });
  try {
    await sendDocument(to, dosya.buffer, dosya.mimetype, dosya.originalname, caption || undefined);
    res.json({ ok: true });
  } catch (err) {
    console.error("Panel dosya gonderme hatasi:", err?.response?.data || err.message);
    res.status(500).json({ error: "Dosya gonderilemedi" });
  }
});

// --- Urun bazinda form/dokuman kutuphanesi ---
// Danismanlar WhatsApp'tan "Form İste" ile bu dokumanlari istedigi an alabilir.
app.get("/api/panel/dokumanlar", panelAuth, (req, res) => {
  const urunler = Object.keys(flows).map((key) => {
    const dokuman = dokumanStore.dokumanGetir(key);
    return {
      urunKey: key,
      urunAdi: flows[key].label,
      yuklu: !!dokuman,
      dosyaAdi: dokuman ? dokuman.dosyaAdi : null,
      yuklenmeZamani: dokuman ? dokuman.yuklenmeZamani : null
    };
  });
  res.json({ urunler });
});

app.post("/api/panel/dokumanlar/:urunKey", panelAuth, upload.single("dosya"), (req, res) => {
  const { urunKey } = req.params;
  const dosya = req.file;
  if (!flows[urunKey]) return res.status(400).json({ error: "Gecersiz urun" });
  if (!dosya) return res.status(400).json({ error: "dosya gerekli" });
  dokumanStore.dokumanKaydet(urunKey, dosya.originalname, dosya.mimetype, dosya.buffer);
  res.json({ ok: true });
});

app.delete("/api/panel/dokumanlar/:urunKey", panelAuth, (req, res) => {
  dokumanStore.dokumanSil(req.params.urunKey);
  res.json({ ok: true });
});

app.post("/api/panel/toggle-pause", panelAuth, (req, res) => {
  const { to, paused } = req.body;
  if (!to) return res.status(400).json({ error: "to gerekli" });
  const session = getSession(to);
  session.paused = !!paused;
  res.json({ ok: true, paused: session.paused });
});

// --- Talep takip sistemi (leads) ---
app.get("/api/panel/leads", panelAuth, (req, res) => {
  res.json({ leads: leadStore.tumLeadleriGetir(), durumlar: leadStore.DURUMLAR });
});

app.post("/api/panel/leads/:id/durum", panelAuth, (req, res) => {
  const { durum } = req.body;
  if (!durum) return res.status(400).json({ error: "durum gerekli" });
  const lead = leadStore.durumGuncelle(req.params.id, durum);
  if (!lead) return res.status(404).json({ error: "Talep bulunamadi ya da gecersiz durum" });
  res.json({ ok: true, lead });
});

app.post("/api/panel/leads/:id/not", panelAuth, (req, res) => {
  const { metin } = req.body;
  if (!metin) return res.status(400).json({ error: "metin gerekli" });
  const lead = leadStore.notEkle(req.params.id, metin);
  if (!lead) return res.status(404).json({ error: "Talep bulunamadi" });
  res.json({ ok: true, lead });
});

// Panelden bir hatirlatma kurar. zaman: ISO tarih-saat string'i (orn. "2026-07-16T09:00").
app.post("/api/panel/leads/:id/hatirlatma", panelAuth, (req, res) => {
  const { zaman, not } = req.body;
  if (!zaman) return res.status(400).json({ error: "zaman gerekli" });
  const zamanMs = new Date(zaman).getTime();
  if (Number.isNaN(zamanMs)) return res.status(400).json({ error: "Gecersiz tarih/saat" });
  const lead = leadStore.hatirlatmaKur(req.params.id, zamanMs, not);
  if (!lead) return res.status(404).json({ error: "Talep bulunamadi" });
  res.json({ ok: true, lead });
});

// --- Istatistikler ---
// Tum talep verisinden ozet metrikler cikartir: urun bazinda, danisman
// bazinda, durum bazinda dagilim, donusum orani, son 7/30 gunluk talep sayisi.
app.get("/api/panel/stats", panelAuth, (req, res) => {
  const leads = leadStore.tumLeadleriGetir();

  const urunBazinda = {};
  const danismanBazinda = {};
  const durumBazinda = {};
  leadStore.DURUMLAR.forEach((d) => (durumBazinda[d] = 0));

  const simdi = Date.now();
  const simdiTarih = new Date(simdi);
  const GUN_MS = 24 * 60 * 60 * 1000;
  const yilBaslangic = new Date(simdiTarih.getFullYear(), 0, 1).getTime();
  const ceyrekIndex = Math.floor(simdiTarih.getMonth() / 3);
  const ceyrekBaslangic = new Date(simdiTarih.getFullYear(), ceyrekIndex * 3, 1).getTime();

  let son7Gun = 0;
  let son30Gun = 0;
  let buCeyrek = 0;
  let yilBasindanBugune = 0;

  leads.forEach((lead) => {
    urunBazinda[lead.urun] = (urunBazinda[lead.urun] || 0) + 1;
    const danisman = lead.danismanAdi || "Atanmamış";
    danismanBazinda[danisman] = (danismanBazinda[danisman] || 0) + 1;
    durumBazinda[lead.durum] = (durumBazinda[lead.durum] || 0) + 1;

    const yas = simdi - lead.olusturulmaZamani;
    if (yas <= 7 * GUN_MS) son7Gun += 1;
    if (yas <= 30 * GUN_MS) son30Gun += 1;
    if (lead.olusturulmaZamani >= ceyrekBaslangic) buCeyrek += 1;
    if (lead.olusturulmaZamani >= yilBaslangic) yilBasindanBugune += 1;
  });

  const kapananSayisi = (durumBazinda["Olumlu Kapandı"] || 0) + (durumBazinda["Olumsuz Kapandı"] || 0);
  const donusumOrani =
    kapananSayisi > 0 ? Math.round(((durumBazinda["Olumlu Kapandı"] || 0) / kapananSayisi) * 100) : null;

  res.json({
    toplamTalep: leads.length,
    son7Gun,
    son30Gun,
    buCeyrek,
    yilBasindanBugune,
    ceyrekNo: ceyrekIndex + 1,
    urunBazinda,
    danismanBazinda,
    durumBazinda,
    donusumOrani
  });
});

// 1) Meta webhook DOGRULAMA (GET) - Meta App panelinde webhook'u kaydederken cagirilir
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("Webhook dogrulandi.");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// 2) Gelen mesajlari isleme (POST) - musteriden mesaj geldiginde Meta buraya POST atar
// Dosya yukleme rotalarinda (multer) olusan hatalari (orn. desteklenmeyen
// dosya turu, boyut siniri asimi) duzgun bir JSON mesajina cevirir. Express'te
// hata yakalama middleware'i her zaman 4 parametreli olmali ve rotalardan
// SONRA tanimlanmalidir.
app.use((err, req, res, next) => {
  if (req.path.startsWith("/api/panel/") && err) {
    console.error("Dosya yukleme hatasi:", err.message);
    return res.status(400).json({ error: err.message || "Dosya yuklenemedi." });
  }
  next(err);
});

app.post("/webhook", async (req, res) => {
  // Meta'ya hemen 200 donmek gerekiyor, aksi halde tekrar tekrar gonderir
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return; // durum bildirimi (okundu/iletildi) vb. olabilir, yoksay

    if (mesajDahaOnceIslendiMi(message.id)) {
      console.log("Tekrarlanan webhook mesaji atlandi:", message.id);
      return;
    }

    const from = message.from; // musterinin telefon numarasi

    let parsed;
    if (message.type === "text") {
      parsed = { type: "text", text: message.text.body };
    } else if (message.type === "interactive") {
      const interactive = message.interactive;
      if (interactive.type === "button_reply") {
        parsed = {
          type: "interactive",
          interactiveId: interactive.button_reply.id,
          interactiveTitle: interactive.button_reply.title
        };
      } else if (interactive.type === "list_reply") {
        parsed = {
          type: "interactive",
          interactiveId: interactive.list_reply.id,
          interactiveTitle: interactive.list_reply.title
        };
      }
    } else if (message.type === "image") {
      parsed = {
        type: "media",
        mediaKind: "image",
        mediaId: message.image.id,
        mimeType: message.image.mime_type,
        dosyaAdi: "fotograf.jpg"
      };
    } else if (message.type === "document") {
      parsed = {
        type: "media",
        mediaKind: "document",
        mediaId: message.document.id,
        mimeType: message.document.mime_type,
        dosyaAdi: message.document.filename || "belge"
      };
    }

    if (parsed) {
      if (advisorEngine.isDanisman(from)) {
        await advisorEngine.handleAdvisorMessage(from, parsed);
      } else {
        // Musteri tarafinda foto/belge kabulu artik baglama gore (orn. kasko
        // arac fotograflari, ruhsat fotografi bekleniyorsa) handleIncoming
        // icinde karar veriliyor - burada blanket red yok.
        await handleIncoming(from, parsed);
      }
    }
  } catch (err) {
    console.error("Webhook isleme hatasi:", err?.response?.data || err.message);
  }
});

app.get("/", (req, res) => {
  res.send("Sigorta WhatsApp Bot calisiyor.");
});

const PORT = process.env.PORT || 3000;

// --- Hatirlatma zamanlayicisi ---
// Her dakika, zamani gelmis (ve henuz gonderilmemis) hatirlatmalari kontrol
// edip ilgili danismana WhatsApp mesaji olarak gonderir.
const HATIRLATMA_KONTROL_SIKLIGI_MS = 60 * 1000;

async function hatirlatmalariKontrolEt() {
  const zamaniGelenler = leadStore.zamaniGelenHatirlatmalar();
  for (const lead of zamaniGelenler) {
    if (!lead.danismanNumarasi) {
      leadStore.hatirlatmaGonderildiIsaretle(lead.id);
      continue;
    }
    const mesaj =
      `⏰ Hatırlatma!\n\n` +
      `Müşteri: ${lead.musteriAdi}\n` +
      `Ürün: ${lead.urun}\n` +
      `Telefon: ${lead.telefon}\n\n` +
      (lead.hatirlatma.not ? `Not: ${lead.hatirlatma.not}` : "Bu müşteriyle ilgilenme zamanı geldi.");
    try {
      await hatirlatmaGonder(lead.danismanNumarasi, mesaj);
      console.log("Hatirlatma gonderildi:", lead.id, lead.danismanNumarasi);
    } catch (err) {
      console.error("Hatirlatma gonderilirken hata:", err?.response?.data || err.message);
    } finally {
      leadStore.hatirlatmaGonderildiIsaretle(lead.id);
    }
  }
}

// --- Kalici depolama: acilista yukleme, calisirken periyodik yedekleme ---
// DATABASE_URL tanimliysa (Railway'de PostgreSQL eklenmisse), tum oturumlar,
// mesaj gecmisi ve talepler her 15 saniyede bir ve kapanmadan hemen once
// otomatik olarak veritabanina yedeklenir. Tanimli degilse bu fonksiyonlar
// sessizce hicbir sey yapmaz - sistem eskisi gibi sadece bellekte calisir.
const YEDEKLEME_SIKLIGI_MS = 15 * 1000;

async function tumVeriyiKaydet() {
  await Promise.all([
    sessionStore.kaydet().catch((err) => console.error("Oturumlar kaydedilemedi:", err.message)),
    leadStore.kaydet().catch((err) => console.error("Talepler kaydedilemedi:", err.message)),
    messageLog.kaydet().catch((err) => console.error("Mesaj gecmisi kaydedilemedi:", err.message)),
    dokumanStore.kaydet().catch((err) => console.error("Dokumanlar kaydedilemedi:", err.message))
  ]);
}

async function baslat() {
  await db.init();
  await sessionStore.yukle();
  await leadStore.yukle();
  await messageLog.yukle();
  await dokumanStore.yukle();

  app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda calisiyor.`);
  });

  setInterval(() => {
    tumVeriyiKaydet();
  }, YEDEKLEME_SIKLIGI_MS);

  setInterval(() => {
    hatirlatmalariKontrolEt().catch((err) => console.error("Hatirlatma kontrolu hatasi:", err));
  }, HATIRLATMA_KONTROL_SIKLIGI_MS);

  // Suresi gecmis 2FA deneme/oturum kayitlarini temizle (bellek sismesin diye).
  setInterval(() => {
    const simdi = Date.now();
    for (const [token, deneme] of otpDenemeleri) {
      if (deneme.expiresAt < simdi) otpDenemeleri.delete(token);
    }
    for (const [token, bitis] of dogrulanmisOturumlar) {
      if (bitis < simdi) dogrulanmisOturumlar.delete(token);
    }
  }, HATIRLATMA_KONTROL_SIKLIGI_MS);

  // Railway bir deploy/restart sirasinda once SIGTERM gonderir - bu sinyali
  // yakalayip kapanmadan hemen once son bir kez kaydederek veri kaybini
  // en aza indiriyoruz.
  const kapatirkenKaydet = async (sinyal) => {
    console.log(`${sinyal} alindi, kapanmadan once veriler kaydediliyor...`);
    try {
      await tumVeriyiKaydet();
    } catch (err) {
      console.error("Kapanirken kaydetme hatasi:", err.message);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => kapatirkenKaydet("SIGTERM"));
  process.on("SIGINT", () => kapatirkenKaydet("SIGINT"));
}

baslat();
