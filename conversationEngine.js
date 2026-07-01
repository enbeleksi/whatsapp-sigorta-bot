const { getSession, resetSession } = require("./sessionStore");
const { sendText, sendButtons, sendList } = require("./whatsapp");
const flows = require("./flows");

const PRODUCT_KEYS = Object.keys(flows); // ["kasko", "trafik", "saglik", "dask", "konut", "seyahat"]
const PRODUCT_LABELS = PRODUCT_KEYS.map((k) => flows[k].label);

// Kullanicidan gelen bir mesaji (metin veya interaktif secim) isler.
// message = { type: "text" | "interactive", text?, interactiveId?, interactiveTitle? }
async function handleIncoming(from, message) {
  const session = getSession(from);
  session.updatedAt = Date.now();

  const userText =
    message.type === "interactive" ? message.interactiveTitle : (message.text || "").trim();

  // Kullanici her an "iptal" veya "basla" yazarak sifirlayabilsin
  if (/^iptal$/i.test(userText)) {
    resetSession(from);
    await sendText(from, "Talebiniz iptal edildi. Yeni bir talep icin istediginiz zaman yazabilirsiniz.");
    return;
  }

  switch (session.state) {
    case "NEW": {
      await sendText(
        from,
        "Merhaba! Sigorta acentemize hos geldiniz. \u{1F44B}\nSize daha hizli teklif hazirlayabilmemiz icin birkac bilgi alacagim.\n\nOncelikle adiniz soyadiniz nedir?"
      );
      session.state = "ASK_NAME";
      break;
    }

    case "ASK_NAME": {
      session.name = userText;
      session.state = "ASK_PRODUCT";
      await sendList(
        from,
        `Tesekkurler ${session.name}. Hangi sigorta urunu icin teklif almak istersiniz?`,
        "Urun Sec",
        PRODUCT_LABELS
      );
      break;
    }

    case "ASK_PRODUCT": {
      const idx = PRODUCT_LABELS.findIndex(
        (label) => label.toLowerCase() === userText.toLowerCase()
      );
      if (idx === -1) {
        await sendList(
          from,
          "Uzgunum, listeden bir secenek secmeniz gerekiyor. Lutfen tekrar secin:",
          "Urun Sec",
          PRODUCT_LABELS
        );
        break;
      }
      session.product = PRODUCT_KEYS[idx];
      session.questionIndex = 0;
      session.answers = {};
      session.state = "ASKING";
      await askCurrentQuestion(from, session);
      break;
    }

    case "ASKING": {
      const flow = flows[session.product];
      const currentQuestion = flow.questions[session.questionIndex];

      // Secenekli soruda gecerli bir secenek secildi mi kontrol et
      if (currentQuestion.type === "choice") {
        const validOption = currentQuestion.options.find(
          (opt) => opt.toLowerCase() === userText.toLowerCase()
        );
        if (!validOption) {
          await sendButtons(from, currentQuestion.text, currentQuestion.options);
          break;
        }
        session.answers[currentQuestion.id] = validOption;
      } else {
        session.answers[currentQuestion.id] = userText;
      }

      session.questionIndex += 1;

      if (session.questionIndex >= flow.questions.length) {
        await finishFlow(from, session);
      } else {
        await askCurrentQuestion(from, session);
      }
      break;
    }

    case "DONE": {
      // Talep tamamlanmis. Yeni bir talep baslatmak isterse sifirla.
      resetSession(from);
      await sendText(
        from,
        "Yeni bir sigorta teklifi talebi olusturmak icin bu mesaji gonderdiginiz icin tekrar merhaba! Adiniz soyadiniz nedir?"
      );
      getSession(from).state = "ASK_NAME";
      break;
    }

    default: {
      resetSession(from);
      await sendText(from, "Bir sorun olustu, bastan basliyoruz. Merhaba! Adiniz soyadiniz nedir?");
      getSession(from).state = "ASK_NAME";
    }
  }
}

async function askCurrentQuestion(from, session) {
  const flow = flows[session.product];
  const q = flow.questions[session.questionIndex];
  if (q.type === "choice") {
    await sendButtons(from, q.text, q.options);
  } else {
    await sendText(from, q.text);
  }
}

async function finishFlow(from, session) {
  const flow = flows[session.product];
  session.state = "DONE";

  const summaryLines = flow.questions.map(
    (q) => `- ${q.text.replace(/\?$/, "")}: ${session.answers[q.id]}`
  );
  const customerSummary =
    `Tesekkurler ${session.name}! ${flow.label} talebiniz icin gerekli bilgileri aldik. ` +
    `Ekibimiz en kisa surede sizinle iletisime gecip teklifinizi iletecek.\n\n` +
    `Ozet:\n${summaryLines.join("\n")}`;

  await sendText(from, customerSummary);

  // Acenteye/ekibe otomatik ilet
  const agentNumber = process.env.AGENT_WHATSAPP_NUMBER;
  if (agentNumber) {
    const agentMessage =
      `\u{1F4CB} Yeni sigorta teklif talebi\n` +
      `Musteri: ${session.name}\n` +
      `Telefon: ${from}\n` +
      `Urun: ${flow.label}\n\n` +
      summaryLines.join("\n");
    try {
      await sendText(agentNumber, agentMessage);
    } catch (err) {
      console.error("Acenteye mesaj gonderilemedi:", err?.response?.data || err.message);
    }
  }
}

module.exports = { handleIncoming };
