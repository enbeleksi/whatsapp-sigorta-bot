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
const db = require("./db");
const sessionStore = require("./sessionStore");
const { getSession } = sessionStore;

const app = express();
app.use(bodyParser.json());

// Panelden yuklenen dosyalari bellekte tutan gecici depolama (diske yazmiyoruz,
// direkt WhatsApp'a yukleyip atiyoruz). 16MB'a kadar dosya kabul eder.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

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

// --- Basit sifre korumasi (temsilci paneli icin) ---
function panelAuth(req, res, next) {
  const auth = req.headers.authorization;
  const expectedUser = process.env.PANEL_USERNAME || "admin";
  const expectedPass = process.env.PANEL_PASSWORD;

  if (!expectedPass) {
    return res.status(500).send("PANEL_PASSWORD ortam degiskeni ayarlanmamis.");
  }

  if (!auth || !auth.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="Temsilci Paneli"');
    return res.status(401).send("Giris gerekli.");
  }

  const decoded = Buffer.from(auth.split(" ")[1], "base64").toString();
  const [user, pass] = decoded.split(":");

  if (user === expectedUser && pass === expectedPass) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Temsilci Paneli"');
  return res.status(401).send("Hatali kullanici adi veya sifre.");
}

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
  const GUN_MS = 24 * 60 * 60 * 1000;
  let son7Gun = 0;
  let son30Gun = 0;

  leads.forEach((lead) => {
    urunBazinda[lead.urun] = (urunBazinda[lead.urun] || 0) + 1;
    const danisman = lead.danismanAdi || "Atanmamış";
    danismanBazinda[danisman] = (danismanBazinda[danisman] || 0) + 1;
    durumBazinda[lead.durum] = (durumBazinda[lead.durum] || 0) + 1;

    const yas = simdi - lead.olusturulmaZamani;
    if (yas <= 7 * GUN_MS) son7Gun += 1;
    if (yas <= 30 * GUN_MS) son30Gun += 1;
  });

  const kapananSayisi = (durumBazinda["Olumlu Kapandı"] || 0) + (durumBazinda["Olumsuz Kapandı"] || 0);
  const donusumOrani =
    kapananSayisi > 0 ? Math.round(((durumBazinda["Olumlu Kapandı"] || 0) / kapananSayisi) * 100) : null;

  res.json({
    toplamTalep: leads.length,
    son7Gun,
    son30Gun,
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
    }

    if (parsed) {
      if (advisorEngine.isDanisman(from)) {
        await advisorEngine.handleAdvisorMessage(from, parsed);
      } else {
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
    messageLog.kaydet().catch((err) => console.error("Mesaj gecmisi kaydedilemedi:", err.message))
  ]);
}

async function baslat() {
  await db.init();
  await sessionStore.yukle();
  await leadStore.yukle();
  await messageLog.yukle();

  app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda calisiyor.`);
  });

  setInterval(() => {
    tumVeriyiKaydet();
  }, YEDEKLEME_SIKLIGI_MS);

  setInterval(() => {
    hatirlatmalariKontrolEt().catch((err) => console.error("Hatirlatma kontrolu hatasi:", err));
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
