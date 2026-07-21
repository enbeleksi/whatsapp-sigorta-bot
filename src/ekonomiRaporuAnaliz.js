// Danismanin WhatsApp'tan "BES Fonları" > "Güncel Ekonomi Raporu ve Fon
// Sepeti Önerisi" secenegini sectiginde calisir. besFonVerileri.js'teki
// SABIT fon listesini (kod/ad/risk/ana varlik yapisi) baglam olarak verip,
// Anthropic'in CANLI WEB ARAMASI ozelligini (server-side "web_search" tool)
// kullanarak o ANKI (istek zamanindaki) guncel ekonomik durumu
// arastirmasini ve secilen risk profiline uygun, GUNCEL kosullara gore
// dinamik bir fon sepeti onerisi hazirlamasini istiyoruz.
//
// NEDEN CANLI ARAMA (statik/kopyalanmis sayilar yerine)?
// Kullanicinin actikca istedigi sey ("güncel ekonomik verileri ışığında
// özet ekonomi raporu" + "güncel ekonomiye göre dinamik fon sepeti") zaten
// zaman icinde degisen bir seydir - PDF'ten kopyalanacak herhangi bir
// getiri/faiz/kur sayisi bir kac hafta icinde eskir. Bu yuzden fon
// KIMLIKLERI (kod, ad, risk seviyesi, strateji) sabit veriden gelirken,
// EKONOMIK YORUM VE ONERI her istek aninda YENIDEN uretilir.
//
// ANTHROPIC_API_KEY ortam degiskeni gerektirir (diger analiz dosyalariyla
// - ruhsatAnaliz.js, belgeAnaliz.js, satisSozlesmesiAnaliz.js - AYNI
// gereksinim). Tanimli degilse ya da API bir hata donerse hata firlatir;
// cagiran taraf (advisorEngine.js) kullaniciya "şu an hazırlayamadım"
// tarzi guvenli bir mesajla geri donmeli.
//
// Bu, kesinlikle bir YATIRIM TAVSIYESI degildir - hem promptta hem de
// asagidaki YASAL_UYARI sabitiyle (donen metnin SONUNA HER ZAMAN, modelin
// ne yazdigina bakilmaksizin programatik olarak eklenir) bu acikca
// belirtilir.

const YASAL_UYARI =
  "\n\n⚠️ Bu içerik yapay zeka tarafından, istek anındaki güncel web verileri kullanılarak otomatik oluşturulmuştur. " +
  "Genel bilgilendirme amaçlıdır, yatırım danışmanlığı ya da kesin getiri taahhüdü niteliği taşımaz. " +
  "Kesin işlem kararından önce güncel fon fiyatlarını ve resmi verileri Garanti Emeklilik/KAP üzerinden teyit ediniz.";

async function ekonomiRaporuVeFonSepetiUret(riskProfili, fonListesi) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil - ekonomi raporu/fon sepeti ozelligi devre disi.");
  }

  const bugun = new Date().toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", year: "numeric", month: "long", day: "numeric" });

  const fonListesiMetni = fonListesi
    .map((f) => `- ${f.kod} (${f.ad}) | Risk: ${f.riskDegeri}/7 | ${f.anaVarlikYapisi}`)
    .join("\n");

  const prompt =
    `Bugünün tarihi: ${bugun}. Sen bir Türk emeklilik/sigorta acentesindeki danışmanlara yönelik güncel ekonomi ` +
    `özeti ve fon sepeti önerisi hazırlayan bir asistansın.\n\n` +
    `GÖREV 1 - GÜNCEL EKONOMİ ÖZETİ: Web araması yaparak bugüne en yakın güncel verilerle Türkiye ekonomisindeki ` +
    `durumu kısaca özetle: TCMB politika faizi/son faiz kararı, TÜFE (enflasyon) son durumu ve trendi, USD/TRY ve ` +
    `EUR/TRY kurunun durumu, BIST 100 endeksinin son durumu/trendi, ve varsa piyasaları etkileyebilecek önemli ` +
    `küresel/jeopolitik gelişmeler. 4-6 cümlelik, WhatsApp'ta okunacak sade bir Türkçe özet yaz (madde imi/liste ` +
    `kullanma, akıcı paragraf yaz).\n\n` +
    `GÖREV 2 - FON SEPETİ ÖNERİSİ: Aşağıda Garanti Emeklilik'in BES fonlarının SABİT listesi var (kod, ad, risk ` +
    `seviyesi 1-7, ana varlık yapısı). Danışmanın müşterisi için seçtiği risk profili: "${riskProfili}".\n\n` +
    `${fonListesiMetni}\n\n` +
    `SADECE yukarıdaki listede yer alan fon KODLARINI kullanarak (yeni/uydurma kod ÜRETME), bu risk profiline VE ` +
    `Görev 1'de araştırdığın güncel ekonomik duruma uygun 2-4 fonluk bir sepet öner (yüzdeler toplamı %100 olmalı). ` +
    `Her fon için kısa (1 cümle) bir gerekçe yaz - gerekçe güncel ekonomik duruma (ör. faiz/enflasyon/döviz trendine) ` +
    `atıfta bulunmalı.\n\n` +
    `YANIT FORMATI (düz metin, WhatsApp'a gönderilecek, başında/sonunda başka açıklama olmadan):\n` +
    `📊 *Güncel Ekonomi Özeti* (${bugun})\n` +
    `[Görev 1'deki özet]\n\n` +
    `💼 *${riskProfili} Risk Profili İçin Fon Sepeti Önerisi*\n` +
    `[Her fon için: "• KOD (%yüzde) - gerekçe" formatında bir satır]`;

  // ONEMLI: web_search bir "server-side tool" oldugu icin normalde Anthropic
  // aramayi/aramalari kendi tarafinda yapip TEK bir API cevabinda hem arama
  // sonuclarini hem de Claude'un nihai metnini dondurur. Ancak Claude,
  // max_uses sinirina (asagida 5) yaklasirken ya da uzun bir arastirma
  // gerektiginde cevabi "stop_reason: pause_turn" ile YARIM birakip
  // devam etmemizi bekleyebilir - bu durumda o ana kadarki yaniti bir
  // sonraki istege "assistant" mesaji olarak ekleyip devam etmesini
  // istememiz gerekiyor (Anthropic'in resmi web search dokumantasyonunda
  // belirtilen davranis). Bunu atlarsak (eski kod tam olarak bunu
  // atliyordu) bazen BOS/eksik bir metinle karsilasip "yanit anlasilamadi"
  // hatasi alinabiliyordu - asagidaki dongu bunu bir kac deneme (en fazla 3)
  // ile otomatik tamamliyor.
  const mesajlar = [{ role: "user", content: prompt }];
  let sonVeri = null;

  for (let deneme = 0; deneme < 3; deneme++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5
          }
        ],
        messages: mesajlar
      })
    });

    const data = await response.json();
    if (data?.error) {
      // HTTP durum kodunu da hataya ekliyoruz (429 rate limit, 529 overloaded,
      // 401 gecersiz anahtar, 400 gecersiz istek vb. ayirt edebilmek icin) -
      // Railway loglarinda console.error ile bu satirin tamami goruntulenir.
      throw new Error(`Ekonomi raporu API hatasi (HTTP ${response.status}): ` + JSON.stringify(data.error));
    }

    sonVeri = data;
    if (data.stop_reason === "pause_turn") {
      mesajlar.push({ role: "assistant", content: data.content });
      continue;
    }
    break;
  }

  const icerik = Array.isArray(sonVeri?.content) ? sonVeri.content : [];
  const metinParcalari = icerik.filter((blok) => blok.type === "text").map((blok) => blok.text);
  const metin = metinParcalari.join("\n").trim();

  if (!metin) {
    throw new Error("Ekonomi raporu yanıtı boş döndü: " + JSON.stringify(sonVeri));
  }

  return metin + YASAL_UYARI;
}

module.exports = { ekonomiRaporuVeFonSepetiUret };
