// whatsapp.js fonksiyonlarini sarmalar ve her giden mesaji messageLog'a kaydeder.
// Bot ve temsilci paneli, mesaj gondermek icin bu dosyayi kullanir (whatsapp.js'i direkt degil).
//
// ONEMLI: Mesaj, WhatsApp API'sine GONDERILDIKTEN ve basarili oldugu teyit
// EDILDIKTEN sonra loglanir. Eger gonderim basarisiz olursa (orn. 24 saat
// penceresi kapali oldugu icin), panelde "(GONDERILEMEDI)" ibaresiyle
// gorunur - boylece "panelde gitmis gorunuyor ama karsi tarafa ulasmamis"
// durumu fark edilebilir hale gelir.

const whatsapp = require("./whatsapp");
const messageLog = require("./messageLog");

async function sendText(to, body) {
  try {
    const result = await whatsapp.sendText(to, body);
    messageLog.logMessage(to, "out", body);
    return result;
  } catch (err) {
    messageLog.logMessage(to, "out", `⚠️ (GONDERILEMEDI) ${body}`);
    throw err;
  }
}

async function sendButtons(to, bodyText, options) {
  const gosterilecekMetin = `${bodyText} [${options.join(" / ")}]`;
  try {
    const result = await whatsapp.sendButtons(to, bodyText, options);
    messageLog.logMessage(to, "out", gosterilecekMetin);
    return result;
  } catch (err) {
    messageLog.logMessage(to, "out", `⚠️ (GONDERILEMEDI) ${gosterilecekMetin}`);
    throw err;
  }
}

async function sendList(to, bodyText, buttonText, options) {
  const gosterilecekMetin = `${bodyText} [${options.join(" / ")}]`;
  try {
    const result = await whatsapp.sendList(to, bodyText, buttonText, options);
    messageLog.logMessage(to, "out", gosterilecekMetin);
    return result;
  } catch (err) {
    messageLog.logMessage(to, "out", `⚠️ (GONDERILEMEDI) ${gosterilecekMetin}`);
    throw err;
  }
}

// Bir dosyayi (PDF gibi) yukleyip musteriye/danismana dokuman olarak gonderir.
// dosyaBuffer: Buffer, mimeType: orn. "application/pdf", dosyaAdi: gorunecek dosya adi.
async function sendDocument(to, dosyaBuffer, mimeType, dosyaAdi, caption) {
  const gosterilecekMetin = `📄 ${dosyaAdi}${caption ? " - " + caption : ""}`;
  try {
    const mediaId = await whatsapp.mediaYukle(dosyaBuffer, mimeType, dosyaAdi);
    const result = await whatsapp.sendDocument(to, mediaId, dosyaAdi, caption);
    messageLog.logMessage(to, "out", gosterilecekMetin);
    return result;
  } catch (err) {
    messageLog.logMessage(to, "out", `⚠️ (GONDERILEMEDI) ${gosterilecekMetin}`);
    throw err;
  }
}

// Onaylanmis bir mesaj sablonunu gonderir (24 saat penceresine tabi degildir).
// gosterilecekMetin: panelde konusma gecmisinde gorunmesi icin okunabilir metin.
async function sendTemplate(to, templateName, languageCode, parameters, gosterilecekMetin) {
  try {
    const result = await whatsapp.sendTemplate(to, templateName, languageCode, parameters);
    messageLog.logMessage(to, "out", gosterilecekMetin);
    return result;
  } catch (err) {
    messageLog.logMessage(to, "out", `⚠️ (GONDERILEMEDI) ${gosterilecekMetin}`);
    throw err;
  }
}

module.exports = { sendText, sendButtons, sendList, sendDocument, sendTemplate, mediaIndir: whatsapp.mediaIndir };
