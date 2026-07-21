// Bir danismanin WhatsApp uzerinden (aktif bir soru/belge akisi olmadan,
// herhangi bir anda) gonderdigi bir "Araç Satış Sözleşmesi" (noter onaylı
// arac satis sozlesmesi) fotografini Anthropic'in gorsel analiz ozelligini
// kullanarak "okur": belgenin gercekten bu tur bir sozlesme olup olmadigini
// degerlendirir, eski/yeni plaka, motor no, sasi no, satici/alici ad-soyad ve
// TC kimlik numaralarini cikarmaya calisir. ruhsatAnaliz.js/belgeAnaliz.js ile
// AYNI deseni (dogrudan Anthropic Vision API fetch cagrisi) kullanir.
// ANTHROPIC_API_KEY ortam degiskeni gerektirir (Railway'de ayarlanmali - koda
// asla yazilmamali). Anahtar tanimli degilse ya da API bir hata donerse hata
// firlatir; cagiran taraf (advisorEngine.js) bu durumda kullaniciya "belgeyi
// taniyamadim" tarzi guvenli bir mesajla geri donmeli - asla tahmini/uydurma
// bir TC/plaka/sasi no URETILMEMELI.
async function satisSozlesmesiAnalizEt(buffer, mimeType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil - satis sozlesmesi foto analizi devre disi.");
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
      max_tokens: 500,
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
                "Bu fotoğraf Türkiye'de bir noterlik tarafından onaylanmış 'Araç Satış Sözleşmesi' belgesi olabilir " +
                "(başlığında genellikle 'ARAÇ SATIŞ SÖZLEŞMESİ' yazar, noter başlığı/mührü bulunur, PLAKA NO / YENİ PLAKA NO / " +
                "MOTOR NO / ŞASİ NO alanları ile SATICI ve ALICI bölümlerinde ad-soyad + T.C. kimlik numarası bulunur). " +
                "Fotoğrafı dikkatlice incele:\n" +
                "1) Bu GERÇEKTEN bir araç satış sözleşmesi mi (başka bir belge türü - ruhsat, poliçe, kimlik vb. - ise HAYIR de)?\n" +
                "2) Öyleyse aşağıdaki alanları oku. SATICI, poliçenin muhtemel mevcut sigortalısıdır (aracı satan, poliçesi " +
                "iptal edilmesi gereken kişi) - bu yüzden satıcının bilgilerini özenle oku.\n" +
                "SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir metin ekleme:\n" +
                "{\n" +
                '  "arac_satis_sozlesmesi_mi": true ya da false,\n' +
                '  "net_mi": true ya da false (fotoğraf okunabilir/net mi),\n' +
                '  "eski_plaka": "PLAKA NO alanındaki değer ya da null",\n' +
                '  "yeni_plaka": "YENİ PLAKA NO alanındaki değer ya da null",\n' +
                '  "motor_no": "MOTOR NO alanındaki değer ya da null",\n' +
                '  "sasi_no": "ŞASİ NO alanındaki değer ya da null",\n' +
                '  "satici_adi": "SATICI bölümündeki ad-soyad ya da null",\n' +
                '  "satici_tck": "SATICI bölümündeki T.C. kimlik numarası ya da null",\n' +
                '  "alici_adi": "ALICI bölümündeki ad-soyad ya da null",\n' +
                '  "alici_tck": "ALICI bölümündeki T.C. kimlik numarası ya da null",\n' +
                '  "satis_tarihi": "sözleşme tarihi (varsa) ya da null",\n' +
                '  "aciklama": "belge tanınamıyorsa ya da net değilse kısa nedeni, aksi halde boş string"\n' +
                "}"
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
    aracSatisSozlesmesiMi: !!sonuc.arac_satis_sozlesmesi_mi,
    netMi: sonuc.net_mi !== false,
    eskiPlaka: sonuc.eski_plaka || null,
    yeniPlaka: sonuc.yeni_plaka || null,
    motorNo: sonuc.motor_no || null,
    sasiNo: sonuc.sasi_no || null,
    saticiAdi: sonuc.satici_adi || null,
    saticiTck: sonuc.satici_tck || null,
    aliciAdi: sonuc.alici_adi || null,
    aliciTck: sonuc.alici_tck || null,
    satisTarihi: sonuc.satis_tarihi || null,
    aciklama: sonuc.aciklama || ""
  };
}

module.exports = { satisSozlesmesiAnalizEt };
