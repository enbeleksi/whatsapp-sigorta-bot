// Tum mesajlarin (gelen/giden) gecmisini bellekte tutar.
// Bu sayede temsilci paneli, botun ve musterinin yazdigi her seyi gorebilir.

const conversations = new Map(); // phone -> { name, messages: [{direction, text, timestamp}] }

function ensure(phone) {
  if (!conversations.has(phone)) {
    conversations.set(phone, { name: null, messages: [] });
  }
  return conversations.get(phone);
}

function logMessage(phone, direction, text) {
  const convo = ensure(phone);
  convo.messages.push({ direction, text, timestamp: Date.now() });
  // Bellek sismesin diye son 200 mesajla sinirla
  if (convo.messages.length > 200) {
    convo.messages.shift();
  }
}

function setName(phone, name) {
  ensure(phone).name = name;
}

function listConversations() {
  return Array.from(conversations.entries())
    .map(([phone, convo]) => {
      const last = convo.messages[convo.messages.length - 1];
      return {
        phone,
        name: convo.name,
        lastMessage: last ? last.text : "",
        lastDirection: last ? last.direction : null,
        lastTimestamp: last ? last.timestamp : 0
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
}

function getMessages(phone) {
  return ensure(phone).messages;
}

module.exports = { logMessage, setName, listConversations, getMessages };
