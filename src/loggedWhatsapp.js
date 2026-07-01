// whatsapp.js fonksiyonlarini sarmalar ve her giden mesaji messageLog'a kaydeder.
// Bot ve temsilci paneli, mesaj gondermek icin bu dosyayi kullanir (whatsapp.js'i direkt degil).

const whatsapp = require("./whatsapp");
const messageLog = require("./messageLog");

async function sendText(to, body) {
  messageLog.logMessage(to, "out", body);
  return whatsapp.sendText(to, body);
}

async function sendButtons(to, bodyText, options) {
  messageLog.logMessage(to, "out", `${bodyText} [${options.join(" / ")}]`);
  return whatsapp.sendButtons(to, bodyText, options);
}

async function sendList(to, bodyText, buttonText, options) {
  messageLog.logMessage(to, "out", `${bodyText} [${options.join(" / ")}]`);
  return whatsapp.sendList(to, bodyText, buttonText, options);
}

module.exports = { sendText, sendButtons, sendList };
