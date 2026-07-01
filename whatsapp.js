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

module.exports = { sendText, sendButtons, sendList };
