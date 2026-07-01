// Basit bellek-ici (in-memory) oturum deposu.
// NOT: Sunucu yeniden baslatilinca oturumlar sifirlanir. Ciddi trafikte
// bunu Redis gibi kalici bir store ile degistirmeniz onerilir.

const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      state: "NEW", // NEW -> ASK_NAME -> ASK_PRODUCT -> ASKING -> DONE
      name: null,
      product: null,
      questionIndex: 0,
      answers: {},
      updatedAt: Date.now()
    });
  }
  return sessions.get(phone);
}

function resetSession(phone) {
  sessions.delete(phone);
}

module.exports = { getSession, resetSession };
