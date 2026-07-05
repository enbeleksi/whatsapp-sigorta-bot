const { getSession, resetSession } = require("./sessionStore");
const { sendText, sendButtons, sendList } = require("./loggedWhatsapp");
const messageLog = require("./messageLog");
const flows = require("./flows");

const PRODUCT_KEYS = Object.keys(flows);
// Urun secim listesinde WhatsApp'in 24 karakter siniri oldugu icin, uzun urun
// isimlerinde flows.js'deki kisa "menuLabel" kullanilir; yoksa tam "label" kullanilir.
// Ozet/bildirim mesajlarinda ise her zaman tam "label" kullanilmaya devam eder.
const PRODUCT_LABELS = PRODUCT_KEYS.map((k) => flows[k].menuLabel || flows[k].label);

// KVKK (Kisisel Verilerin Korunmasi Kanunu) onay metni. Musteriden herhangi bir
// kisisel veri (ad, TC kimlik no vb.) toplanmadan once bu onayin alinmasi gerekir.
const KVKK_METNI =
  "Bilgilerinizi işleyebilmemiz için önce kısa bir onayınıza ihtiyacımız var. 📄\n\n" +
  "6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında; paylaşacağınız isim-soyisim, " +
  "T.C. kimlik no, iletişim ve talep bilgileriniz yalnızca sigorta teklifi hazırlama ve sizinle " +
  "iletişime geçme amacıyla WE Sigorta tarafından işlenecek, üçüncü kişilerle paylaşılmayacaktır.\n\n" +
  "Devam etmek için onayınızı bekliyoruz.";
const KVKK_SECENEKLERI = ["Kabul Ediyorum", "Kabul Etmiyorum"];

// q.text bazen sabit bir string, bazen de onceki cevaplara gore degisen bir
// fonksiyon olabilir ( (answers) => "soru metni" ). Ikisini de tek tip stringe cevirir.
function resolveText(question, answers) {
  return typeof question.text === "function" ? question.text(answers) : question.text;
}

// Secenekli bir soruyu gonderir. WhatsApp buton mesajlari en fazla 3 secenek
// destekler, daha fazlasi icin liste (list) mesaji kullanilir.
async function sendChoiceQuestion(to, text, options) {
  if (options.length > 3) {
    await sendList(to, text, "Secin", options);
  } else {
    await sendButtons(to, text, options);
  }
}

// Turkce klavyesi olmayan kullanicilar bazen "Hayir" (Hayır yerine), "Kadin"
// (Kadın yerine) gibi Turkce karakter kullanmadan yazabilir. Karsilastirma
// yaparken bu farkliligi tolere etmek icin ozel karakterleri sadelestirir.
function normalizeTr(str) {
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

// Kullanicinin yazdigi metni bir secenekle esler. Tam esleseni tercih eder,
// bulamazsa "icinde geciyor mu" mantigiyla (orn. "Enbel Eksi" -> "Enbel",
// "Kadinim" -> "Kadin") esnek bir eslestirme dener. Turkce karakter
// farkliliklarini (ı/i, ş/s, ğ/g, ü/u, ö/o, ç/c) da tolere eder.
function matchOption(userText, options) {
  const normalized = normalizeTr(userText.trim());
  if (!normalized) return null;

  const exact = options.find((opt) => normalizeTr(opt) === normalized);
  if (exact) return exact;

  return (
    options.find(
      (opt) =>
        normalized.includes(normalizeTr(opt)) || normalizeTr(opt).includes(normalized)
    ) || null
  );
}

// Bazi sorular onceki cevaba gore atlanabilir (question.skipIf(answers) => true/false),
// bazilari da onceden zaten cevaplanmis olabilir (orn. isim zaten alinmissa "ad_soyad"
// sorusu tekrar sorulmaz). Verilen index'ten baslayarak atlanmasi gereken sorular
// varsa ileri kaydirir.
function nextValidIndex(flow, answers, fromIndex) {
  let idx = fromIndex;
  while (idx < flow.questions.length) {
    const q = flow.questions[idx];
    const skippedByRule = q.skipIf && q.skipIf(answers);
    const alreadyAnswered = Object.prototype.hasOwnProperty.call(answers, q.id) && answers[q.id];
    if (!skippedByRule && !alreadyAnswered) break;
    idx += 1;
  }
  return idx;
}

// Bir urunun soru akisini baslatir. Musterinin adi zaten biliniyorsa (session.name)
// ve o urunun ad_soyad sorusu hesap sahibinin kendi adini soruyorsa (sameAsAccountHolder),
// bu soruyu tekrar sormadan otomatik doldurur.
function startProductFlow(session, productKey) {
  const flow = flows[productKey];
  session.product = productKey;
  session.answers = {};

  const adSoyadQuestion = flow.questions.find((q) => q.id === "ad_soyad");
  if (session.name && adSoyadQuestion && adSoyadQuestion.sameAsAccountHolder) {
    session.answers.ad_soyad = session.name;
  }

  session.questionIndex = nextValidIndex(flow, session.answers, 0);
  session.state = "ASKING";
}

// Bir oturum icin bilgilerin/bildirimin kime gidecegini belirler:
// 1) Musteri belirli bir danismanla gorustugunu soyleduyse (flows.js'deki
//    "advisors" listesiyle eslesirse), o danismana gider.
// 2) Yoksa, urune ozel bir numara (flows.js icindeki agentNumber) var mi bak.
// 3) O da yoksa/placeholder ise genel AGENT_WHATSAPP_NUMBER'a duser.
function resolveAgentNumber(flow, session) {
  const isPlaceholder = (num) => !num || /X/i.test(num);

  if (flow) {
    const chosenAdvisor =
      flow.advisors && session.answers && session.answers.danisman_adi
        ? flow.advisors.find((a) => a.name === session.answers.danisman_adi)
        : null;
    if (chosenAdvisor) return chosenAdvisor.number;
    if (!isPlaceholder(flow.agentNumber)) return flow.agentNumber;
  }

  return process.env.AGENT_WHATSAPP_NUMBER;
}

// Kullanicidan gelen bir mesaji (metin veya interaktif secim) isler.
// message = { type: "text" | "interactive", text?, interactiveId?, interactiveTitle? }
async function handleIncoming(from, message) {
  const session = getSession(from);
  const previousUpdatedAt = session.updatedAt;
  session.updatedAt = Date.now();

  const userText =
    message.type === "interactive" ? message.interactiveTitle : (message.text || "").trim();

  // Gelen mesaji panelde gorunmesi icin kaydet
  messageLog.logMessage(from, "in", userText);
  if (session.name) {
    messageLog.setName(from, session.name);
  }

  // Bot duraklatilmissa (temsilci devraldiysa) hicbir otomatik islem yapma,
  // sadece mesaji panelde gorunecek sekilde kaydet ve cik.
  if (session.paused) {
    return;
  }

  // Müşteri istediği an "temsilci" yazarak bir insanla görüşmek isteyebilir.
  // Bota sicak bir mesajla cevap verdirip, ilgili danisman/temsilciye
  // musterinin gorusme talebini WhatsApp'tan bildiriyoruz.
  if (/temsilci|insan|musteri.?temsil/i.test(userText)) {
    session.paused = true;
    await sendText(
      from,
      "Sigorta danışmanınızla görüşme talebinizi kendisine ilettim. Sigorta danışmanlarımız yoğunluk durumuna göre en kısa sürede size dönüş yapacaktır. 🙏"
    );

    const flow = session.product ? flows[session.product] : null;
    const agentNumber = resolveAgentNumber(flow, session);
    if (agentNumber) {
      const notifyMessage =
        `\u{1F514} Musterinin sizinle gorusme talebi var\n` +
        `Musteri: ${session.name || "(isim henuz alinmadi)"}\n` +
        `Telefon: ${from}` +
        (flow ? `\nUrun: ${flow.label}` : "");
      try {
        await sendText(agentNumber, notifyMessage);
      } catch (err) {
        console.error("Danisman bilgilendirme mesaji gonderilemedi:", err?.response?.data || err.message);
      }
    }
    return;
  }

  // Kullanıcı her an "iptal" yazarak sıfırlayabilsin
  if (/^iptal$/i.test(userText)) {
    resetSession(from);
    await sendText(from, "Talebiniz iptal edildi. Yeni bir talep için istediğiniz zaman yazabilirsiniz. 😊");
    return;
  }

  // Musteri 1 saatten uzun sure sessiz kaldiktan sonra devam eden aktif bir
  // konusmaya geri donuyorsa, kaldigi soruyu tekrar sormadan once kisa bir
  // hatirlatma mesaji gonderelim (nereden devam ettigini hatirlamasi icin).
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const isReturningAfterGap =
    previousUpdatedAt &&
    Date.now() - previousUpdatedAt > ONE_HOUR_MS &&
    session.state !== "NEW" &&
    session.state !== "DONE" &&
    session.state !== "KVKK_CONSENT";

  if (isReturningAfterGap) {
    await sendText(from, "Tekrar merhaba! 😊 Kaldığımız yerden devam edelim.");
  }

  switch (session.state) {
    case "NEW": {
      // QR kodundan gelen hazir mesajlardan biriyle eslesiyor mu diye bak
      // (orn. "Merhaba, acil dask yaptirmak istiyorum."). Eslesirse, KVKK onayi
      // alindiktan sonra direkt o urunun sorularina baslamak icin kaydediyoruz.
      const matchedKey = PRODUCT_KEYS.find(
        (key) => flows[key].qrTrigger && flows[key].qrTrigger.test(userText)
      );

      if (matchedKey) {
        session.pendingProduct = matchedKey;
        await sendText(from, flows[matchedKey].qrGreeting);
      } else {
        await sendText(
          from,
          "Merhaba! 😊 WE Sigorta ailesine hoş geldiniz! Sizinle tanışmak ve size en uygun teklifi hazırlamak için sabırsızlanıyoruz. 🎉"
        );
      }

      await sendChoiceQuestion(from, KVKK_METNI, KVKK_SECENEKLERI);
      session.state = "KVKK_CONSENT";
      break;
    }

    case "KVKK_CONSENT": {
      const validOption = matchOption(userText, KVKK_SECENEKLERI);
      if (!validOption) {
        await sendChoiceQuestion(from, KVKK_METNI, KVKK_SECENEKLERI);
        break;
      }

      if (validOption === "Kabul Etmiyorum") {
        await sendText(
          from,
          "Anlıyoruz. Kişisel verilerinizi işleyebilmemiz için onayınıza ihtiyacımız olduğundan şu an devam edemiyoruz. " +
            "Fikrinizi değiştirirseniz istediğiniz zaman tekrar yazabilirsiniz. 🙏"
        );
        resetSession(from);
        break;
      }

      // "Kabul Ediyorum": eger QR'dan gelen bir urun bekliyorsak direkt onun
      // sorularina, yoksa normal isim sorma adimina geciyoruz.
      if (session.pendingProduct) {
        const key = session.pendingProduct;
        session.pendingProduct = null;
        startProductFlow(session, key);
        await askCurrentQuestion(from, session);
      } else {
        session.state = "ASK_NAME";
        await sendText(from, "Teşekkürler! 😊 Öncelikle isminizi ve soyisminizi öğrenebilir miyim?");
      }
      break;
    }

    case "ASK_NAME": {
      session.name = userText;
      session.state = "ASK_PRODUCT";
      await sendList(
        from,
        `Teşekkürler ${session.name}! Hangi sigorta ürünü için teklif almak istersiniz?`,
        "Ürün Seç",
        PRODUCT_LABELS
      );
      break;
    }

    case "ASK_PRODUCT": {
      // WhatsApp liste mesajlarinda secenekler 24 karakterle sinirli, uzun urun
      // isimleri (orn. "Prim Iadeli Hayat Sigortasi") kesilerek geri donebiliyor.
      // Bu yuzden tam eslesme yerine matchOption'in esnek/on-ek toleransli
      // eslestirmesini kullaniyoruz.
      const matchedLabel = matchOption(userText, PRODUCT_LABELS);
      if (!matchedLabel) {
        await sendList(
          from,
          "Üzgünüm, listeden bir seçenek seçmeniz gerekiyor. Lütfen tekrar seçin:",
          "Ürün Seç",
          PRODUCT_LABELS
        );
        break;
      }
      const idx = PRODUCT_LABELS.indexOf(matchedLabel);
      startProductFlow(session, PRODUCT_KEYS[idx]);
      await askCurrentQuestion(from, session);
      break;
    }

    case "ASKING": {
      const flow = flows[session.product];
      const currentQuestion = flow.questions[session.questionIndex];
      const currentText = resolveText(currentQuestion, session.answers);

      // Secenekli soruda gecerli bir secenek secildi mi kontrol et (esnek eslestirme ile)
      if (currentQuestion.type === "choice") {
        const validOption = matchOption(userText, currentQuestion.options);
        if (!validOption) {
          await sendChoiceQuestion(from, currentText, currentQuestion.options);
          break;
        }
        session.answers[currentQuestion.id] = validOption;
      } else {
        // Serbest metin sorularinda bir dogrulama fonksiyonu tanimliysa
        // (orn. TC kimlik no, tarih, plaka), formatin uygun olup olmadigini kontrol et.
        if (currentQuestion.validate && !currentQuestion.validate(userText)) {
          const hint =
            currentQuestion.validationError ||
            "Bu bilgiyi doğru formatta yazmadınız gibi görünüyor, tekrar dener misiniz?";
          await sendText(from, `${hint}\n\n${currentText}`);
          break;
        }
        session.answers[currentQuestion.id] = userText;
      }

      // QR akisinda ASK_NAME adimi atlandigi icin, "ad_soyad" sorusu
      // cevaplanınca session.name'i de dolduruyoruz (ozet/panel icin).
      if (currentQuestion.id === "ad_soyad" && !session.name) {
        session.name = session.answers.ad_soyad;
      }

      session.questionIndex = nextValidIndex(flow, session.answers, session.questionIndex + 1);

      if (session.questionIndex >= flow.questions.length) {
        await finishFlow(from, session);
      } else {
        await askCurrentQuestion(from, session);
      }
      break;
    }

    case "DONE": {
      // Talep tamamlanmış. Yeni bir talep başlatmak isterse sıfırla ve
      // KVKK onayını tekrar alalım (yeni bir talep, yeni bir onay).
      resetSession(from);
      await sendText(
        from,
        "Yeni bir sigorta teklifi talebi oluşturmak istediğiniz için tekrar merhaba! 😊"
      );
      await sendChoiceQuestion(from, KVKK_METNI, KVKK_SECENEKLERI);
      getSession(from).state = "KVKK_CONSENT";
      break;
    }

    default: {
      resetSession(from);
      await sendText(from, "Bir sorun oluştu, baştan başlıyoruz. Merhaba! 😊");
      await sendChoiceQuestion(from, KVKK_METNI, KVKK_SECENEKLERI);
      getSession(from).state = "KVKK_CONSENT";
    }
  }
}

async function askCurrentQuestion(from, session) {
  const flow = flows[session.product];
  const q = flow.questions[session.questionIndex];
  const text = resolveText(q, session.answers);
  if (q.type === "choice") {
    await sendChoiceQuestion(from, text, q.options);
  } else {
    await sendText(from, text);
  }
}

async function finishFlow(from, session) {
  const flow = flows[session.product];
  session.state = "DONE";
  messageLog.setName(from, session.name);

  // Atlanan (skipIf ile gecilen) sorular hic cevaplanmadigi icin ozete dahil edilmez.
  const askedQuestions = flow.questions.filter((q) => !(q.skipIf && q.skipIf(session.answers)));
  const summaryLines = askedQuestions.map((q) => {
    const questionText = resolveText(q, session.answers);
    return `- ${questionText.replace(/\?$/, "")}: ${session.answers[q.id]}`;
  });
  const customerSummary =
    `Teşekkürler ${session.name}! ${flow.label} talebiniz için gerekli bilgileri aldık. ` +
    `Ekibimiz en kısa sürede sizinle iletişime geçip teklifinizi iletecek. 🙏\n\n` +
    `Özet:\n${summaryLines.join("\n")}`;

  await sendText(from, customerSummary);

  // Acenteye/ekibe otomatik ilet.
  const agentNumber = resolveAgentNumber(flow, session);

  if (agentNumber) {
    const agentMessage =
      `\u{1F4CB} Yeni sigorta teklif talebi\n` +
      `Müşteri: ${session.name}\n` +
      `Telefon: ${from}\n` +
      `Ürün: ${flow.label}\n\n` +
      summaryLines.join("\n");
    try {
      await sendText(agentNumber, agentMessage);
    } catch (err) {
      console.error("Acenteye mesaj gonderilemedi:", err?.response?.data || err.message);
    }
  }
}

module.exports = { handleIncoming };
