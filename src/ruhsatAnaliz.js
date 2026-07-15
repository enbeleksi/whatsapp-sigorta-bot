// Musterinin gonderdigi ruhsat fotografini Anthropic API'sinin gorsel analiz
// ozelligini kullanarak "okur": seri numarasini cikarmaya calisir, fotografin
// net/eksiksiz olup olmadigini degerlendirir. ANTHROPIC_API_KEY ortam
// degiskeni gerektirir (Railway'de ayarlanmali - koda asla yazilmamali).

async function ruhsatFotografiAnalizEt(buffer, mimeType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil - ruhsat foto analizi devre disi.");
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
                "Bu bir Türkiye araç ruhsatı (trafik tescil belgesi) fotoğrafıdır. Ruhsatın sağ alt köşesinde " +
                "harflerle başlayıp rakamlarla devam eden bir 'seri numarası' bulunur (örneğin AE123456 gibi). " +
                "Fotoğrafı dikkatlice incele ve SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir metin ekleme:\n" +
                '{"okunabilir": true ya da false, "seri_no": "okuduğun seri numarası ya da null", "aciklama": "okunamıyorsa kısa nedeni (örn: sağ alt köşe kesilmiş, görüntü bulanık, ruhsat net görünmüyor)"}'
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
    okunabilir: !!sonuc.okunabilir,
    seriNo: sonuc.seri_no || null,
    aciklama: sonuc.aciklama || ""
  };
}

module.exports = { ruhsatFotografiAnalizEt };
