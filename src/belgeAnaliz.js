// Danismanin satis kaydi akisinda tek tek yukledigi belge fotograflarini
// (Acik Riza Beyani/KVKK metni, Imza Karti, Yerlesim Yeri Belgesi, Kimlik
// on/arka yuz) Claude'un gorsel analiz ozelligi ile kontrol eder:
//   1) Fotograf yeterince net mi (bulanik/karanlik/okunaksiz degil mi)
//   2) Fotograf gercekten o adimda beklenen belge turune mi ait (orn.
//      danisman yanlislikla baska bir belgenin fotografini gonderirse
//      bunu yakalayip uyarabilmek icin)
//
// ruhsatAnaliz.js'deki ile ayni Anthropic Vision API deseni kullanilir.
// ANTHROPIC_API_KEY tanimli degilse ya da API bir hata donerse hata firlatir;
// cagiran taraf (advisorEngine.js) bu durumda kontrolu atlayip belgeyi normal
// kabul ediyor - boylece gecici bir API sorunu satis surecini tamamen
// durdurmuyor.
async function belgeFotografiAnalizEt(buffer, mimeType, beklenenBelgeAciklamasi) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil - belge foto analizi devre disi.");
  }

  const base64 = buffer.toString("base64");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType || "image/jpeg", data: base64 }
            },
            {
              type: "text",
              text:
                `Beklenen belge: ${beklenenBelgeAciklamasi}\n\n` +
                "Bu fotoğrafı incele ve SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir metin ekleme:\n" +
                '{"net_mi": true ya da false (fotoğraf bulanık, karanlık ya da okunaksızsa false), ' +
                '"dogru_belge_mi": true ya da false (fotoğraf yukarıda tarif edilen belge türüyle eşleşmiyorsa false), ' +
                '"aciklama": "sorun varsa kısa ve danışmana yönelik nazik bir açıklama (Türkçe), sorun yoksa boş string"}'
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  const metin = data?.content?.[0]?.text || "";
  const jsonEslesme = metin.match(/\{[\s\S]*\}/);
  if (!jsonEslesme) {
    throw new Error("Analiz yanıtı anlaşılamadı: " + JSON.stringify(data));
  }

  const sonuc = JSON.parse(jsonEslesme[0]);
  return {
    netMi: sonuc.net_mi !== false,
    dogruBelgeMi: sonuc.dogru_belge_mi !== false,
    aciklama: sonuc.aciklama || ""
  };
}

module.exports = { belgeFotografiAnalizEt };
