// Anthropic Messages API'sine (opsiyonel olarak CANLI WEB ARAMASI - server-
// side "web_search" araci - acik) tek bir istek gonderen ORTAK yardimci
// fonksiyon. tefasGetiriAnaliz.js tarafindan kullanilir - "web arama +
// pause_turn devam ettirme + HTTP hata kodu raporlama" mantigi burada TEK
// bir yerde tutuluyor (kod tekrarini/driftini onlemek icin).
//
// NOT (22.07.2026): bu dosyayi ayrica kullanan ekonomiRaporuAnaliz.js
// ("Ekonomiye Göre Fon" ozelligi) kullanici talebiyle kaldirildi - web
// aramasina bagli iki API cagrisi zaman zaman guvenilir calismiyordu.
//
// web_search bir "server-side tool" oldugu icin normalde Anthropic
// aramayi/aramalari kendi tarafinda yapip TEK bir API cevabinda hem arama
// sonuclarini hem de Claude'un nihai metnini dondurur. Ancak Claude,
// max_uses sinirina yaklasirken ya da uzun bir arastirma gerektiginde
// cevabi "stop_reason: pause_turn" ile YARIM birakip devam etmemizi
// bekleyebilir - bu durumda o ana kadarki yaniti bir sonraki istege
// "assistant" mesaji olarak ekleyip devam etmesini istememiz gerekiyor
// (Anthropic'in resmi web search dokumantasyonunda belirtilen davranis).
// Asagidaki dongu bunu bir kac deneme (en fazla 3) ile otomatik tamamliyor.
async function mesajGonder(apiKey, prompt, opts) {
  const aramaAktif = !!(opts && opts.aramaAktif);
  const maxTokens = (opts && opts.maxTokens) || 1024;
  const maxAramaKullanimi = (opts && opts.maxAramaKullanimi) || 5;

  const mesajlar = [{ role: "user", content: prompt }];
  let sonVeri = null;

  for (let deneme = 0; deneme < 3; deneme++) {
    const govde = {
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      messages: mesajlar
    };
    if (aramaAktif) {
      govde.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxAramaKullanimi }];
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(govde)
    });

    const data = await response.json();
    if (data?.error) {
      // HTTP durum kodunu da hataya ekliyoruz (429 rate limit, 529 overloaded,
      // 401 gecersiz anahtar, 400 gecersiz istek vb. ayirt edebilmek icin) -
      // Railway loglarinda console.error ile bu satirin tamami goruntulenir.
      throw new Error(`Anthropic API hatasi (HTTP ${response.status}): ` + JSON.stringify(data.error));
    }

    sonVeri = data;
    if (aramaAktif && data.stop_reason === "pause_turn") {
      mesajlar.push({ role: "assistant", content: data.content });
      continue;
    }
    break;
  }

  const icerik = Array.isArray(sonVeri?.content) ? sonVeri.content : [];
  const metinParcalari = icerik.filter((blok) => blok.type === "text").map((blok) => blok.text);
  const metin = metinParcalari.join("\n").trim();

  if (!metin) {
    throw new Error("API yanıtı boş döndü: " + JSON.stringify(sonVeri));
  }
  return metin;
}

module.exports = { mesajGonder };
