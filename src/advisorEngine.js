// Danismanlarin, panele hic girmeden, dogrudan WhatsApp uzerinden:
// 1) Kendi taleplerini gormesini, not eklemesini, durum degistirmesini,
//    hatirlatma kurmasini,
// 2) Musteri (sigortali) adina YENI bir talep olusturmasini
// saglar. Bir mesaj bilinen bir danisman numarasindan geldiginde, server.js
// bu modulu cagirir - musteri akisina (conversationEngine) hic girmez,
// tamamen ayri bir menu sistemidir.

const { getSession } = require("./sessionStore");
const { sendText, sendButtons, sendList, sendDocument, mediaIndir } = require("./loggedWhatsapp");
const leadStore = require("./leadStore");
const dokumanStore = require("./dokumanStore");
const { dosyaTuruIzinliMi } = require("./izinliDosyaTurleri");
const { garantiEmekliligeGonder } = require("./eposta");
const flows = require("./flows");
const conversationEngine = require("./conversationEngine");

// Danisman listesi tum urunlerde ayni referansi paylasir (flows.js'deki
// DANISMANLAR sabiti), o yuzden herhangi bir urunden okuyabiliriz.
const DANISMANLAR = flows.dask.advisors;

function danismaniBul(numara) {
  return DANISMANLAR.find((d) => d.number === numara) || null;
}

function isDanisman(numara) {
  return !!danismaniBul(numara);
}

// --- Turkce karakter toleransli secenek eslestirme (conversationEngine.js'deki
// ile ayni mantik, kucuk oldugu icin burada ayrica tanimlandi) ---
function normalizeTr(str) {
  return (str || "")
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

function matchOption(userText, options) {
  const normalized = normalizeTr((userText || "").trim());
  if (!normalized) return null;
  const exact = options.find((opt) => normalizeTr(opt) === normalized);
  if (exact) return exact;
  return (
    options.find((opt) => normalized.includes(normalizeTr(opt)) || normalizeTr(opt).includes(normalized)) || null
  );
}

// GG.AA.YYYY SS:DD formatinda bir tarih-saat metnini gecerliyse zaman
// damgasina (ms) cevirir, degilse null doner.
const TARIH_SAAT_REGEX = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/;

function tarihSaatDogrula(metin) {
  const eslesme = TARIH_SAAT_REGEX.exec((metin || "").trim());
  if (!eslesme) return null;
  const gun = parseInt(eslesme[1], 10);
  const ay = parseInt(eslesme[2], 10);
  const yil = parseInt(eslesme[3], 10);
  const saat = parseInt(eslesme[4], 10);
  const dakika = parseInt(eslesme[5], 10);
  const tarih = new Date(yil, ay - 1, gun, saat, dakika);
  const gecerliMi =
    tarih.getFullYear() === yil &&
    tarih.getMonth() === ay - 1 &&
    tarih.getDate() === gun &&
    tarih.getHours() === saat &&
    tarih.getMinutes() === dakika;
  return gecerliMi ? tarih.getTime() : null;
}

// --- Karsilama (ana giris noktasi) ---
async function karsilamaGoster(from, session) {
  const danisman = danismaniBul(from);
  session.state = "DANISMAN_KARSILAMA";
  await sendButtons(
    from,
    `Merhaba ${danisman ? danisman.name : ""}! 👋 Ne yapmak istersiniz?`,
    ["Yeni Talep Oluştur", "Taleplerimi Gör", "Form İste"]
  );
}

// --- Istenildigi an urun bazinda PDF form/dokuman gonderme ---
async function formUrunSec(from, session) {
  session.state = "DANISMAN_FORM_URUN_SEC";
  const urunAnahtarlari = Object.keys(flows);
  session.danismanFormUrunAnahtarlari = urunAnahtarlari;
  const etiketler = urunAnahtarlari.map((k) => flows[k].menuLabel || flows[k].label);
  await sendList(from, "Hangi ürünün formunu/dokümanını almak istersiniz?", "Ürün Seç", etiketler);
}

// --- Mevcut talepleri listeleme/yonetme ---
async function anaMenuGoster(from, session) {
  const danisman = danismaniBul(from);
  const acikLeadler = leadStore
    .tumLeadleriGetir()
    .filter((l) => l.danismanNumarasi === from && (l.durum === "Bekliyor" || l.durum === "Takipte"));

  session.state = "DANISMAN_LEAD_SECIMI";
  session.danismanLeadListesi = acikLeadler.map((l) => l.id);

  if (acikLeadler.length === 0) {
    await sendText(
      from,
      `Şu an açık bir talebiniz yok. 🎉 Yeni bir talep oluşturmak isterseniz "evet" yazabilirsiniz.`
    );
    return;
  }

  const satirlar = acikLeadler.map((l) => {
    const durumIkon = l.durum === "Bekliyor" ? "🟡" : "🔵";
    return `${durumIkon} ${l.musteriAdi || l.telefon} (${l.urun})`;
  });

  await sendList(
    from,
    `Açık talepleriniz aşağıda, detay görmek istediğinizi seçin:`,
    "Talep Seç",
    satirlar
  );
}

async function leadDetayGoster(from, session, lead) {
  session.state = "DANISMAN_LEAD_DETAY";
  session.danismanSeciliLeadId = lead.id;

  const notlarMetni = lead.notlar.length
    ? "\n\n📝 Notlar:\n" + lead.notlar.map((n) => `- ${n.metin}`).join("\n")
    : "";
  const hatirlatmaMetni = lead.hatirlatma
    ? `\n\n⏰ Hatırlatma: ${new Date(lead.hatirlatma.zaman).toLocaleString("tr-TR")}${
        lead.hatirlatma.not ? " - " + lead.hatirlatma.not : ""
      }`
    : "";

  const detay =
    `👤 ${lead.musteriAdi || lead.telefon}\n` +
    `📦 ${lead.urun}\n` +
    `📞 ${lead.telefon}\n` +
    `📊 Durum: ${lead.durum}\n\n` +
    `${lead.ozet || ""}` +
    notlarMetni +
    hatirlatmaMetni;

  await sendText(from, detay);
  await sendButtons(from, "Ne yapmak istersiniz?", ["Not Ekle", "Durum Değiştir", "Hatırlatma Kur"]);
}

// --- Musteri (sigortali) adina yeni talep olusturma akisi ---

// Bir sorular listesinden, danisman modunda gosterilmeyecek (danismandaGizle)
// ya da skipIf ile atlanmasi gereken sorulari atlayip bir sonraki gecerli
// index'i bulur.
function sonrakiGecerliIndex(sorular, answers, baslangic) {
  let idx = baslangic;
  while (idx < sorular.length) {
    const soru = sorular[idx];
    if (soru.danismandaGizle || (soru.skipIf && soru.skipIf(answers))) {
      idx += 1;
      continue;
    }
    break;
  }
  return idx;
}

async function yeniTalepUrunSec(from, session) {
  session.state = "DANISMAN_YENI_URUN_SEC";
  const urunAnahtarlari = Object.keys(flows);
  session.danismanUrunAnahtarlari = urunAnahtarlari;
  const etiketler = urunAnahtarlari.map((k) => flows[k].menuLabel || flows[k].label);
  await sendList(from, "Hangi ürün için yeni bir talep oluşturmak istersiniz?", "Ürün Seç", etiketler);
}

async function danismanSoruSor(from, session) {
  const flow = flows[session.danismanYeniUrunKey];
  const soru = flow.questions[session.danismanYeniSoruIndex];
  const metin = conversationEngine.resolveDanismanText(soru, session.danismanYeniAnswers);

  if (soru.type === "choice") {
    if (soru.options.length > 3) {
      await sendList(from, metin, "Seçin", soru.options);
    } else {
      await sendButtons(from, metin, soru.options);
    }
  } else {
    await sendText(from, metin);
  }
}

async function danismanYeniTalepiTamamla(from, session) {
  const flow = flows[session.danismanYeniUrunKey];
  const danisman = danismaniBul(from);
  const sigortaliTelefon = session.danismanYeniTelefon;
  const answers = session.danismanYeniAnswers;
  const musteriAdi = answers.ad_soyad || "(isim alınmadı)";
  const olusturanEtiketi = danisman ? danisman.name : "Bir danışman";

  // Danismandaki (bu akista hic sorulmayan) sorulari cikartip ozet olusturuyoruz.
  const filtrelenmisFlow = { ...flow, questions: flow.questions.filter((q) => !q.danismandaGizle) };
  const askedQuestions = filtrelenmisFlow.questions.filter((q) => !(q.skipIf && q.skipIf(answers)));
  const summaryLines = askedQuestions.map((q) => {
    const soruMetni = conversationEngine.resolveDanismanText(q, answers);
    return `- ${soruMetni.replace(/\?$/, "")}: ${answers[q.id]}`;
  });

  const agentMessage =
    `\u{1F4CB} Yeni sigorta teklif talebi\n` +
    `📌 Bu talep ${olusturanEtiketi} tarafından oluşturuldu.\n\n` +
    `Sigortalı: ${musteriAdi}\n` +
    `Telefon: ${sigortaliTelefon}\n` +
    `Ürün: ${flow.label}\n\n` +
    summaryLines.join("\n");

  const sahteSession = { answers, name: musteriAdi };
  const kompaktDetayTemel = conversationEngine.kompaktDetayOlustur(filtrelenmisFlow, sahteSession, sigortaliTelefon);
  const kompaktDetay = `[${olusturanEtiketi} tarafından oluşturuldu] ${kompaktDetayTemel}`;

  // Guvenlik agi (Enbel her zaman, Bahadır elementer branslarda) + kendisine
  // tekrar bildirim gondermeye gerek yok, zaten kendisi olusturdu.
  const bildirilecekNumaralar = conversationEngine.guvenlikAgiNumaralari(flow, from);
  bildirilecekNumaralar.delete(from);

  for (const numara of bildirilecekNumaralar) {
    await conversationEngine.bildirimGonder(numara, flow.label, musteriAdi, sigortaliTelefon, agentMessage, kompaktDetay);
  }

  leadStore.yeniLeadOlustur({
    telefon: sigortaliTelefon,
    musteriAdi,
    urun: flow.label,
    danismanAdi: danisman ? danisman.name : null,
    danismanNumarasi: from,
    ozet: kompaktDetay
  });

  // BES ve Prim Iadeli Hayat Sigortasi gibi bazi urunlerde, danisman tarafindan
  // olusturulan talepler de Garanti Emeklilik'e otomatik mail olarak gider.
  if (flow.garantiEmekliligeGonder) {
    garantiEmekliligeGonder({
      urunAdi: flow.label,
      musteriAdi,
      telefon: sigortaliTelefon,
      ozetSatirlari: summaryLines
    }).catch((err) => console.error("Garanti Emeklilik maili gonderilirken beklenmeyen hata:", err.message));
  }

  await sendText(
    from,
    `Talep başarıyla oluşturuldu ✅ ${musteriAdi} için ${flow.label} talebi kaydedildi ve ilgili kişilere iletildi.`
  );
  await karsilamaGoster(from, session);
}

async function handleAdvisorMessage(from, parsed) {
  const session = getSession(from);

  // Musteri (danisman) bir foto/belge gonderdiyse: eger su an bir talebin
  // detayini goruntuluyorsa, dogrudan o talebe eklenir. Aksi halde nazikce
  // uyarilir. Guvenlik icin sadece PDF/Word/Excel/fotograf turleri kabul edilir.
  if (parsed.type === "media") {
    if (!dosyaTuruIzinliMi(parsed.mimeType)) {
      await sendText(
        from,
        "Bu dosya türünü kabul edemiyoruz 🙏 Sadece PDF, Word, Excel veya fotoğraf (jpg/png) gönderebilirsiniz."
      );
      return;
    }
    if (session.state === "DANISMAN_LEAD_DETAY" && session.danismanSeciliLeadId) {
      try {
        const { buffer, mimeType } = await mediaIndir(parsed.mediaId);
        const lead = leadStore.belgeEkle(session.danismanSeciliLeadId, {
          dosyaAdi: parsed.dosyaAdi,
          mimeType: parsed.mimeType || mimeType,
          veriBase64: buffer.toString("base64")
        });
        await sendText(from, "Belge talebe eklendi ✅");
        if (lead) await leadDetayGoster(from, session, lead);
        else await karsilamaGoster(from, session);
      } catch (err) {
        console.error("Belge indirilemedi/eklenemedi:", err?.response?.data || err.message);
        await sendText(from, "Belgeyi kaydederken bir sorun oluştu, tekrar dener misiniz?");
      }
      return;
    }
    await sendText(
      from,
      "Bu belgeyi bir talebe eklemek için önce 'Taleplerimi Gör' ile ilgili talebi açmanız gerekiyor."
    );
    return;
  }

  const userText = parsed.type === "text" ? parsed.text.trim() : parsed.interactiveTitle;

  // Her zaman "menu"/"iptal"/"geri" yazarak karsilama ekranina donulebilir.
  if (parsed.type === "text" && /^(men[uü]|iptal|geri|evet)$/i.test(userText || "")) {
    await karsilamaGoster(from, session);
    return;
  }

  switch (session.state) {
    case "DANISMAN_KARSILAMA": {
      if (userText === "Yeni Talep Oluştur") {
        await yeniTalepUrunSec(from, session);
        return;
      }
      if (userText === "Taleplerimi Gör") {
        await anaMenuGoster(from, session);
        return;
      }
      if (userText === "Form İste") {
        await formUrunSec(from, session);
        return;
      }
      await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_FORM_URUN_SEC": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await formUrunSec(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const urunKey = (session.danismanFormUrunAnahtarlari || [])[index];
      const urun = urunKey && flows[urunKey];
      if (!urun) {
        await formUrunSec(from, session);
        return;
      }
      const dokuman = dokumanStore.dokumanGetir(urunKey);
      if (!dokuman) {
        await sendText(
          from,
          `${urun.label} için henüz bir form/doküman yüklenmemiş. Panelden yüklenmesini isteyebilirsiniz.`
        );
      } else {
        try {
          const buffer = Buffer.from(dokuman.veriBase64, "base64");
          await sendDocument(from, buffer, dokuman.mimeType, dokuman.dosyaAdi);
        } catch (err) {
          console.error("Form gonderilemedi:", err?.response?.data || err.message);
          await sendText(from, "Formu gönderirken bir sorun oluştu, tekrar dener misiniz?");
        }
      }
      await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_LEAD_SECIMI": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await anaMenuGoster(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const leadId = (session.danismanLeadListesi || [])[index];
      const lead = leadId && leadStore.leadGetir(leadId);
      if (!lead) {
        await anaMenuGoster(from, session);
        return;
      }
      await leadDetayGoster(from, session, lead);
      return;
    }

    case "DANISMAN_LEAD_DETAY": {
      if (userText === "Not Ekle") {
        session.state = "DANISMAN_NOT_BEKLE";
        await sendText(from, "Notunuzu yazar mısınız?");
        return;
      }
      if (userText === "Durum Değiştir") {
        session.state = "DANISMAN_DURUM_BEKLE";
        await sendList(from, "Yeni durumu seçin:", "Durum Seç", leadStore.DURUMLAR);
        return;
      }
      if (userText === "Hatırlatma Kur") {
        session.state = "DANISMAN_HATIRLATMA_TARIH_BEKLE";
        await sendText(
          from,
          "Hangi tarih ve saatte hatırlatalım? (GG.AA.YYYY SS:DD formatında, örn: 16.07.2026 09:00)"
        );
        return;
      }
      await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_NOT_BEKLE": {
      const lead = leadStore.notEkle(session.danismanSeciliLeadId, userText);
      await sendText(from, "Not eklendi ✅");
      if (lead) await leadDetayGoster(from, session, lead);
      else await karsilamaGoster(from, session);
      return;
    }

    case "DANISMAN_DURUM_BEKLE": {
      if (!leadStore.DURUMLAR.includes(userText)) {
        await sendList(from, "Lütfen listeden bir durum seçin:", "Durum Seç", leadStore.DURUMLAR);
        return;
      }
      const lead = leadStore.durumGuncelle(session.danismanSeciliLeadId, userText);
      await sendText(from, `Durum "${userText}" olarak güncellendi ✅`);
      if (userText === "Olumlu Kapandı" || userText === "Olumsuz Kapandı" || !lead) {
        await karsilamaGoster(from, session);
      } else {
        await leadDetayGoster(from, session, lead);
      }
      return;
    }

    case "DANISMAN_HATIRLATMA_TARIH_BEKLE": {
      const zamanMs = tarihSaatDogrula(userText);
      if (!zamanMs) {
        await sendText(
          from,
          "Lütfen GG.AA.YYYY SS:DD formatında yazar mısınız? (Örn: 16.07.2026 09:00)"
        );
        return;
      }
      if (zamanMs < Date.now()) {
        await sendText(from, "Bu tarih geçmişte kalmış görünüyor, lütfen ileri bir tarih yazar mısınız?");
        return;
      }
      session.danismanHatirlatmaZamanMs = zamanMs;
      session.state = "DANISMAN_HATIRLATMA_NOT_BEKLE";
      await sendText(from, "Hatırlatma notu nedir? (Örn: 'Çarşamba sabahı aramamı istedi')");
      return;
    }

    case "DANISMAN_HATIRLATMA_NOT_BEKLE": {
      const lead = leadStore.hatirlatmaKur(
        session.danismanSeciliLeadId,
        session.danismanHatirlatmaZamanMs,
        userText
      );
      await sendText(from, "Hatırlatma kuruldu ⏰ Zamanı gelince otomatik haber vereceğim.");
      if (lead) await leadDetayGoster(from, session, lead);
      else await karsilamaGoster(from, session);
      return;
    }

    // --- Yeni talep olusturma akisi ---
    case "DANISMAN_YENI_URUN_SEC": {
      if (parsed.type !== "interactive" || !parsed.interactiveId) {
        await yeniTalepUrunSec(from, session);
        return;
      }
      const index = parseInt(parsed.interactiveId.replace("list_", ""), 10);
      const urunKey = (session.danismanUrunAnahtarlari || [])[index];
      if (!urunKey || !flows[urunKey]) {
        await yeniTalepUrunSec(from, session);
        return;
      }
      session.danismanYeniUrunKey = urunKey;
      session.danismanYeniAnswers = {};
      session.state = "DANISMAN_YENI_TELEFON_BEKLE";
      await sendText(
        from,
        "Sigortalının telefon numarasını (başında ülke koduyla, örn: 905551234567 şeklinde) paylaşır mısınız?"
      );
      return;
    }

    case "DANISMAN_YENI_TELEFON_BEKLE": {
      const temiz = (userText || "").replace(/\D/g, "");
      if (temiz.length < 10 || temiz.length > 15) {
        await sendText(
          from,
          "Lütfen geçerli bir telefon numarası yazar mısınız? (Başında ülke koduyla, örn: 905551234567 şeklinde)"
        );
        return;
      }
      session.danismanYeniTelefon = temiz;
      const flow = flows[session.danismanYeniUrunKey];
      session.danismanYeniSoruIndex = sonrakiGecerliIndex(flow.questions, session.danismanYeniAnswers, 0);
      session.state = "DANISMAN_YENI_SORU";
      await danismanSoruSor(from, session);
      return;
    }

    case "DANISMAN_YENI_SORU": {
      const flow = flows[session.danismanYeniUrunKey];
      const soru = flow.questions[session.danismanYeniSoruIndex];

      if (soru.type === "choice") {
        const secilen = matchOption(userText, soru.options);
        if (!secilen) {
          const metin = conversationEngine.resolveDanismanText(soru, session.danismanYeniAnswers);
          if (soru.options.length > 3) await sendList(from, metin, "Seçin", soru.options);
          else await sendButtons(from, metin, soru.options);
          return;
        }
        session.danismanYeniAnswers[soru.id] = secilen;
      } else {
        if (soru.validate && !soru.validate(userText, session.danismanYeniAnswers)) {
          const hint =
            typeof soru.validationError === "function"
              ? soru.validationError(userText, session.danismanYeniAnswers)
              : soru.validationError || "Bu bilgi doğru formatta görünmüyor, lütfen tekrar dener misiniz?";
          await sendText(from, hint);
          return;
        }
        session.danismanYeniAnswers[soru.id] = userText;
      }

      if (soru.tepki) {
        const tepkiMesaji = soru.tepki(session.danismanYeniAnswers[soru.id]);
        if (tepkiMesaji) await sendText(from, tepkiMesaji);
      }

      session.danismanYeniSoruIndex = sonrakiGecerliIndex(
        flow.questions,
        session.danismanYeniAnswers,
        session.danismanYeniSoruIndex + 1
      );

      if (session.danismanYeniSoruIndex >= flow.questions.length) {
        await danismanYeniTalepiTamamla(from, session);
      } else {
        await danismanSoruSor(from, session);
      }
      return;
    }

    default: {
      await karsilamaGoster(from, session);
    }
  }
}

module.exports = { isDanisman, handleAdvisorMessage };
