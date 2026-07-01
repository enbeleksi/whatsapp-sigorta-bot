require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const { handleIncoming } = require("./conversationEngine");
const { sendText } = require("./loggedWhatsapp");
const messageLog = require("./messageLog");
const { getSession } = require("./sessionStore");

const app = express();
app.use(bodyParser.json());

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

app.post("/api/panel/toggle-pause", panelAuth, (req, res) => {
  const { to, paused } = req.body;
  if (!to) return res.status(400).json({ error: "to gerekli" });
  const session = getSession(to);
  session.paused = !!paused;
  res.json({ ok: true, paused: session.paused });
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
      await handleIncoming(from, parsed);
    }
  } catch (err) {
    console.error("Webhook isleme hatasi:", err?.response?.data || err.message);
  }
});

app.get("/", (req, res) => {
  res.send("Sigorta WhatsApp Bot calisiyor.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda calisiyor.`);
});
