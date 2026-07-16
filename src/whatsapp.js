const axios = require("axios");

const API_VERSION = "v20.0";

function apiUrl() {
  return `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type": "application/json"
  };
}

// Basit metin mesaji gonderir
async function sendText(to, body) {
  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    { headers: headers() }
  );
}

// Kullaniciya secenekli soru sormak icin buton mesaji gonderir (max 3 secenek)
async function sendButtons(to, bodyText, options) {
  const buttons = options.slice(0, 3).map((opt, i) => ({
    type: "reply",
    reply: { id: `opt_${i}`, title: opt.substring(0, 20) }
  }));

  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: { buttons }
      }
    },
    { headers: headers() }
  );
}

// Urun secimi gibi 3'ten fazla secenek gerektiginde liste mesaji gonderir
async function sendList(to, bodyText, buttonText, options) {
  const rows = options.map((opt, i) => ({
    id: `list_${i}`,
    title: opt.substring(0, 24)
  }));

  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonText,
          sections: [{ title: "Secenekler", rows }]
        }
      }
    },
    { headers: headers() }
  );
}

// Bir dosyayi (orn. PDF) once WhatsApp'in medya sunucusuna yukler, karsiliginda
// bir "media id" doner. Bu id, sendDocument fonksiyonunda kullanilir.
// dosyaBuffer: Buffer (dosyanin ham icerigi), mimeType: orn. "application/pdf".
async function mediaYukle(dosyaBuffer, mimeType, dosyaAdi) {
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  const blob = new Blob([dosyaBuffer], { type: mimeType });
  formData.append("file", blob, dosyaAdi);

  const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/media`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    body: formData
  });
  const data = await response.json();
  if (!data.id) {
    throw new Error("Medya yuklenemedi: " + JSON.stringify(data));
  }
  return data.id;
}

// Yuklenmis bir medyayi (mediaYukle'den donen id ile) dokuman olarak gonderir.
async function sendDocument(to, mediaId, filename, caption) {
  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { id: mediaId, filename, caption }
    },
    { headers: headers() }
  );
}

// Onaylanmis bir WhatsApp mesaj sablonunu gonderir. Sablon mesajlari, normal
// metin mesajlarinin aksine 24 saatlik musteri hizmeti penceresine tabi
// DEGILDIR - karsi taraf hic yazmamis olsa bile her zaman ulasir. Bu yuzden
// danismanlara giden bildirimler icin idealdir.
// parametreler: { degisken_adi: "deger", ... } seklinde bir nesne olmalidir
// (Meta artik {{1}} yerine {{degisken_adi}} formatinda isimli degiskenler istiyor).
async function sendTemplate(to, templateName, languageCode, parametreler) {
  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: Object.entries(parametreler).map(([ad, deger]) => ({
              type: "text",
              parameter_name: ad,
              text: deger
            }))
          }
        ]
      }
    },
    { headers: headers() }
  );
}

// Musteriden/danismandan gelen bir medyayi (foto, belge vb.) indirir. Once
// medyanin gecici indirme linkini alir, sonra o linkten dosyayi ceker.
// Webhook'tan gelen mesaj icindeki "id" alani mediaId olarak kullanilir.
async function mediaIndir(mediaId) {
  const bilgiUrl = `https://graph.facebook.com/${API_VERSION}/${mediaId}`;
  const bilgiYaniti = await fetch(bilgiUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
  const bilgi = await bilgiYaniti.json();
  if (!bilgi.url) {
    throw new Error("Medya bilgisi alinamadi: " + JSON.stringify(bilgi));
  }

  const dosyaYaniti = await fetch(bilgi.url, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }
  });
  const arrayBuffer = await dosyaYaniti.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: bilgi.mime_type || dosyaYaniti.headers.get("content-type") || "application/octet-stream"
  };
}

// Meta Graph API uzerinden dogrudan yeni bir mesaj sablonu olusturur. Web
// arayuzu (WhatsApp Manager) bazen aciklanamayan genel hatalar verebiliyor -
// bu durumda ayni istegi dogrudan API'ye gondermek daha guvenilir olabiliyor.
// sablonVerisi, Meta'nin bekledigi tam JSON yapisidir (name, language,
// category, components).
async function sablonOlustur(sablonVerisi) {
  return axios.post(
    `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
    sablonVerisi,
    { headers: headers() }
  );
}

module.exports = { sendText, sendButtons, sendList, mediaYukle, sendDocument, sendTemplate, mediaIndir, sablonOlustur };
