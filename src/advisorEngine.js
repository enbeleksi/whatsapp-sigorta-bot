// Danismanlarin, panele hic girmeden, dogrudan WhatsApp uzerinden kendi
// taleplerini gormesini, not eklemesini, durum degistirmesini ve hatirlatma
// kurmasini saglar. Bir mesaj bilinen bir danisman numarasindan geldiginde,
// server.js bu modulu cagirir - musteri akisina (conversationEngine) hic
// girmez, tamamen ayri ve basit bir menu sistemidir.

const { getSession } = require("./sessionStore");
const { sendText, sendButtons, sendList } = require("./loggedWhatsapp");
const leadStore = require("./leadStore");
const flows = require("./flows");

// Danisman listesi tum urunlerde ayni referansi paylasir (flows.js'deki
// DANISMANLAR sabiti), o yuzden herhangi bir urunden okuyabiliriz.
const DANISMANLAR = flows.dask.advisors;

function danismaniBul(numara) {
  return DANISMANLAR.find((d) => d.number === numara) || null;
}

function isDanisman(numara) {
  return !!danismaniBul(numara);
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
  const geciyorMu =
    tarih.getFullYear() === yil &&
    tarih.getMonth() === ay - 1 &&
    tarih.getDate() === gun &&
    tarih.getHours() === saat &&
    tarih.getMinutes() === dakika;
  return geciyorMu ? tarih.getTime() : null;
}

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
      `Merhaba ${danisman ? danisman.name : ""}! 👋 Şu an açık bir talebiniz yok. 🎉`
    );
    return;
  }

  const satirlar = acikLeadler.map((l) => {
    const durumIkon = l.durum === "Bekliyor" ? "🟡" : "🔵";
    return `${durumIkon} ${l.musteriAdi || l.telefon} (${l.urun})`;
  });

  await sendList(
    from,
    `Merhaba ${danisman ? danisman.name : ""}! 👋 Açık talepleriniz aşağıda, detay görmek istediğinizi seçin:`,
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

async function handleAdvisorMessage(from, parsed) {
  const session = getSession(from);
  const userText = parsed.type === "text" ? parsed.text.trim() : parsed.interactiveTitle;

  // Her zaman "menu"/"iptal"/"geri" yazarak ana menuye donulebilir.
  if (parsed.type === "text" && /^(men[uü]|iptal|geri)$/i.test(userText || "")) {
    await anaMenuGoster(from, session);
    return;
  }

  switch (session.state) {
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
      await anaMenuGoster(from, session);
      return;
    }

    case "DANISMAN_NOT_BEKLE": {
      const lead = leadStore.notEkle(session.danismanSeciliLeadId, userText);
      await sendText(from, "Not eklendi ✅");
      if (lead) await leadDetayGoster(from, session, lead);
      else await anaMenuGoster(from, session);
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
        await anaMenuGoster(from, session);
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
      else await anaMenuGoster(from, session);
      return;
    }

    default: {
      await anaMenuGoster(from, session);
    }
  }
}

module.exports = { isDanisman, handleAdvisorMessage };
