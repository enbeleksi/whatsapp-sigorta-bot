require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const { handleIncoming } = require("./conversationEngine");

const app = express();
app.use(bodyParser.json());

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
