// Her urun icin sorulacak sorular burada tanimlanir.
// Yeni bir sigorta urunu eklemek icin bu dosyaya yeni bir key eklemeniz yeterli.
//
// question.type: "text" (serbest metin) | "choice" (secenekli - WhatsApp buton/liste ile sorulur)
// question.text: normalde bir string'dir. Bazen (orn. "kiracıysanız ev sahibinin TC'si"
//   gibi) onceki cevaba gore soru metninin degismesi gerekir - bu durumda text bir
//   fonksiyon olabilir: (answers) => "soru metni". answers, o ana kadar verilen
//   tum cevaplari icerir (id -> cevap).
// question.validate: (deger, answers) => true/false. Sadece "text" tipi sorularda
//   kullanilir. Onceki cevaplara da bakabilir (orn. daire kati, bina kat sayisindan
//   fazla olamaz). false donerse, bot ayni soruyu validationError mesajiyla tekrar
//   sorar (bir sonraki soruya gecmez).
// question.validationError: string ya da (deger, answers) => string. Dogrulama
//   basarisiz olunca gosterilecek mesaj.
// question.sameAsAccountHolder: true ise ve musterinin ismi zaten biliniyorsa
//   (WhatsApp konusmasinin basinda alinmis), bu soru tekrar sorulmaz, otomatik doldurulur.
//
// NOT: Nezaket ifadeleri (ogrenebilir miyim / paylasir misiniz / belirtir misiniz vb.)
// bilinçli olarak cesitlendirilmistir, ayni sohbette hep ayni kalip tekrar etmesin diye.
//
// product.agentNumber: bu urunle ilgilenen calisanin WhatsApp numarasi (basinda ulke
//   kodu, orn: 905321234567). Doldurulmazsa (yani "905XXXXXXXXX" placeholder olarak
//   kalirsa) sistem otomatik olarak Railway'deki genel AGENT_WHATSAPP_NUMBER'a duser.

const {
  tcKimlikGecerliMi,
  tarihGecerliMi,
  yasGecerliMi,
  pozitifSayiMi,
  yilGecerliMi,
  plakaGecerliMi,
  ruhsatSeriNoGecerliMi
} = require("./validators");

const MESLEK_SORU = {
  id: "meslek",
  text: "Mesleğinizi paylaşır mısınız? Bazı mesleklerde indirim uygulanabildiği için bu bilgiyi soruyoruz.",
  type: "text"
};

const MESLEK_SORU_SON = {
  id: "meslek",
  text: "Son olarak mesleğinizi paylaşır mısınız? Bazı mesleklerde indirim uygulanabildiği için bu bilgiyi soruyoruz.",
  type: "text"
};

const MESLEK_SORU_UCUNCU_SAHIS = {
  id: "meslek",
  text: "Sigortalanacak kişinin mesleğini söyler misiniz? Bazı mesleklerde indirim uygulanabildiği için bu bilgiyi soruyoruz.",
  type: "text"
};

const TC_KIMLIK_SORU = {
  id: "tc_kimlik",
  text: "Son olarak T.C. kimlik numaranızı yazar mısınız?",
  type: "text",
  validate: tcKimlikGecerliMi,
  validationError:
    "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
};

// Trafik/Kasko'da sorulan TC, hesap sahibinin degil ruhsat sahibinin TC'sidir
// (arac baskasi adina kayitli olabilir, poliçe ruhsat sahibi uzerinden hazirlanir).
const RUHSAT_SAHIBI_TC_SORU = {
  id: "tc_kimlik",
  text: "Son olarak ruhsat sahibinin T.C. kimlik numarasını yazar mısınız?",
  type: "text",
  validate: tcKimlikGecerliMi,
  validationError:
    "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
};

// Ruhsat belge seri no, ruhsatin sag alt kosesinde yer alir; harflerle baslayip
// rakamlarla devam eder (orn. "AE123456").
const RUHSAT_SERI_NO_SORU = {
  id: "ruhsat_seri_no",
  text:
    "Ruhsat belge seri numarasını belirtir misiniz? (Ruhsatın sağ alt köşesinde yer alan, harflerle başlayıp rakamlarla devam eden seri numarasıdır. Örn: AE123456)",
  type: "text",
  validate: ruhsatSeriNoGecerliMi,
  validationError:
    "Lütfen ruhsat seri numarasını doğru formatta yazar mısınız? Harflerle başlayıp rakamlarla devam etmesi gerekiyor. (Örn: AE123456)"
};

const SEHIR_SORU = {
  id: "sehir",
  text: "Hangi şehirden bize ulaştığınızı öğrenebilir miyim?",
  type: "text"
};

// Bina kat sayisi + dairenin bulundugu kat, DASK ve Konut'ta ortak kullanilan
// iki soru. Daire kati, binanin toplam kat sayisindan fazla olamaz - bunu
// kucuk, mizahi bir uyariyla kontrol ediyoruz.
const BINA_KAT_SAYISI_SORU = {
  id: "bina_kat_sayisi",
  text: "Binanın toplam kaç kattan oluştuğunu belirtir misiniz?",
  type: "text",
  validate: pozitifSayiMi,
  validationError: "Lütfen kat sayısını sadece rakamla yazar mısınız? (Örn: 5)"
};

const DAIRE_KATI_SORU = {
  id: "dairenin_bulundugu_kat",
  text: "Peki daireniz kaçıncı katta?",
  type: "text",
  validate: (deger, answers) => {
    if (!pozitifSayiMi(deger) && deger.trim() !== "0") return false;
    const binaKatSayisi = parseInt(answers.bina_kat_sayisi, 10);
    const daireKati = parseInt(deger, 10);
    if (!Number.isNaN(binaKatSayisi) && daireKati > binaKatSayisi) return false;
    return true;
  },
  validationError: (deger, answers) =>
    `Vay canına, çatının da üstüne mi çıkmışsınız? 😄 Binanız ${answers.bina_kat_sayisi} kattan oluşuyor, dairenizin bulunduğu katı bu aralıkta tekrar yazar mısınız?`
};

// Insaat yili 1900'den once girilirse (format olarak dogru rakam olsa bile,
// orn. "1850") mizahi bir uyari gosterip gercek yili tekrar sorariz.
const INSAAT_YILI_SORU = {
  id: "insaat_yili",
  text: "Binanın inşaat yılı nedir?",
  type: "text",
  validate: yilGecerliMi,
  validationError: (deger) => {
    const sadeceRakam = /^\d{3,4}$/.test((deger || "").trim());
    const yil = parseInt((deger || "").trim(), 10);
    if (sadeceRakam && yil < 1900) {
      return "Bina o kadar eski olamaz herhalde! 😄 Taş devrinden mi kalma yoksa? Lütfen gerçek inşaat yılını (1900 sonrası) yazar mısınız?";
    }
    return "Lütfen inşaat yılını 4 haneli olarak yazar mısınız? (Örn: 2015)";
  }
};

module.exports = {
  dask: {
    label: "DASK",
    agentNumber: "905380711711", // Bahadır - elementer branş (DASK)
    // QR kodundan gelen hazır mesaj bu metni içeriyorsa, bot direkt bu ürüne geçer
    // ve aşağıdaki sıcak karşılama mesajıyla başlar (ürün seçim listesi atlanır).
    qrTrigger: /dask/i,
    qrGreeting:
      "Merhaba! 😊 Yeni eviniz hayırlı olsun, içinde huzur dolu günler geçirmenizi dileriz! 🏠💛 DASK poliçenizi hemen hazırlayabilmemiz için birkaç bilgi alalım, olur mu?",
    questions: [
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      {
        id: "mulkiyet_durumu",
        text: "Sigortalanacak konut size mi ait, yoksa kiracı mısınız?",
        type: "choice",
        options: ["Ev Sahibiyim", "Kiracıyım"]
      },
      {
        id: "daini_murtehin",
        text:
          "Poliçe üzerinde dain-i mürtehin (ipotekli banka) var mı? Varsa Banka Adı, Banka Şubesi ve Kredi Döviz Türünü belirtir misiniz? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      { id: "adres", text: "Sigortalanacak konutun açık adresini belirtir misiniz?", type: "text" },
      {
        id: "yuz_olcumu",
        text: "Konutun yüz ölçümünü (m²) söyler misiniz?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Lütfen yüz ölçümünü sadece rakamla yazar mısınız? (Örn: 120)"
      },
      { ...INSAAT_YILI_SORU },
      { ...BINA_KAT_SAYISI_SORU },
      { ...DAIRE_KATI_SORU },
      { ...MESLEK_SORU },
      {
        id: "tc_kimlik",
        text: (answers) =>
          answers.mulkiyet_durumu === "Kiracıyım"
            ? "Son olarak ev sahibinin T.C. kimlik numarasını yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)"
            : "Son olarak T.C. kimlik numaranızı yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
      }
    ]
  },

  konut: {
    label: "Konut Sigortası",
    agentNumber: "905380711711", // Bahadır - elementer branş (Konut)
    questions: [
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      // DASK'in aksine Konut Sigortasi mutlaka ev sahibinin uzerine olmak
      // zorunda degil - kiraci da kendi uzerine yaptirabilir. Bu yuzden
      // "kiracı mısınız" yerine dogrudan police kimin uzerine sorusu soruyoruz.
      {
        id: "police_kimin_uzerine",
        text: "Konut sigortasını kendi üzerinize mi, yoksa ev sahibinin üzerine mi yaptıracaksınız?",
        type: "choice",
        options: ["Kendi Üzerime", "Ev Sahibinin Üzerine"]
      },
      {
        id: "daini_murtehin",
        text:
          "Poliçe üzerinde dain-i mürtehin (ipotekli banka) var mı? Varsa Banka Adı, Banka Şubesi ve Kredi Döviz Türünü belirtir misiniz? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      { id: "adres", text: "Sigortalanacak konutun açık adresini belirtir misiniz?", type: "text" },
      {
        id: "yuz_olcumu",
        text: "Konutun yüz ölçümünü (m²) söyler misiniz?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Lütfen yüz ölçümünü sadece rakamla yazar mısınız? (Örn: 120)"
      },
      { ...INSAAT_YILI_SORU },
      { ...BINA_KAT_SAYISI_SORU },
      { ...DAIRE_KATI_SORU },
      { ...MESLEK_SORU },
      {
        id: "tc_kimlik",
        text: (answers) =>
          answers.police_kimin_uzerine === "Ev Sahibinin Üzerine"
            ? "Son olarak ev sahibinin T.C. kimlik numarasını yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)"
            : "Son olarak T.C. kimlik numaranızı yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
      }
    ]
  },

  trafik: {
    label: "Trafik Sigortası",
    intro:
      "Trafik Sigortası, bir kaza durumunda karşı tarafa vereceğiniz zararları güvence altına alan, yasal olarak zorunlu bir sigortadır. Teklifinizi hazırlamak için birkaç bilgi alalım. 🚗",
    agentNumber: "905380711711", // Bahadır - elementer branş (Trafik)
    qrTrigger: /trafik/i,
    qrGreeting:
      "Merhaba! 😊 Yeni aracınız hayırlı olsun, güle güle kullanın! 🚗✨ Trafik sigortanızı en kısa sürede hazırlayabilmemiz için birkaç küçük bilgiye ihtiyacımız olacak, hemen başlayalım mı?",
    questions: [
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      {
        id: "plaka",
        text: "Aracınızın plakasını belirtir misiniz? (Örn: 34 ABC 123)",
        type: "text",
        validate: plakaGecerliMi,
        validationError: "Lütfen plakayı doğru formatta yazar mısınız? (Örn: 34 ABC 123)"
      },
      { ...RUHSAT_SERI_NO_SORU },
      { ...SEHIR_SORU },
      { ...MESLEK_SORU },
      { ...RUHSAT_SAHIBI_TC_SORU }
    ]
  },

  kasko: {
    label: "Kasko Sigortası",
    intro:
      "Kasko, aracınızı kaza, hırsızlık, yangın gibi risklere karşı güvence altına alır. Teklifinizi hazırlamak için birkaç bilgi alalım. 🚗",
    agentNumber: "905380711711", // Bahadır - elementer branş (Kasko)
    questions: [
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      {
        id: "plaka",
        text: "Aracınızın plakasını belirtir misiniz? (Örn: 34 ABC 123)",
        type: "text",
        validate: plakaGecerliMi,
        validationError: "Lütfen plakayı doğru formatta yazar mısınız? (Örn: 34 ABC 123)"
      },
      { ...RUHSAT_SERI_NO_SORU },
      { ...SEHIR_SORU },
      { ...MESLEK_SORU },
      { ...RUHSAT_SAHIBI_TC_SORU }
    ]
  },

  ozel_saglik: {
    label: "Özel Sağlık Sigortası",
    agentNumber: "905380711711", // Bahadır - elementer branş (Özel Sağlık)
    questions: [
      {
        id: "kimin_icin",
        text: "Kimin için sigorta yaptırmak istiyorsunuz?",
        type: "choice",
        options: ["Kendim", "Eşim", "Çocuğum", "Ailem (Birden Fazla)"]
      },
      { id: "ad_soyad", text: "Sigortalanacak kişinin ismini ve soyismini paylaşır mısınız?", type: "text" },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihini belirtir misiniz? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Lütfen tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Sigortalanacak kişinin cinsiyeti nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "boy_kilo", text: "Boyunu ve kilosunu paylaşır mısınız? (Örn: 170 cm / 70 kg)", type: "text" },
      {
        id: "il_ilce",
        text: "İkamet ettiği il ve ilçeyi belirtir misiniz? (Örn: İstanbul / Kadıköy)",
        type: "text"
      },
      { ...MESLEK_SORU_UCUNCU_SAHIS },
      {
        id: "tc_kimlik",
        text:
          "Teklifinizi hazırlayabilmemiz için son olarak T.C. kimlik numarasına ihtiyacımız var. Bu bilgi sadece teklif hazırlığı amacıyla kullanılacak ve güvenle saklanacaktır.",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
      }
    ]
  },

  tss: {
    label: "TSS (Tamamlayıcı Sağlık Sigortası)",
    menuLabel: "TSS (Tamamlayıcı Sig.)", // Urun secim listesinde WhatsApp'in 24 karakter siniri var
    agentNumber: "905380711711", // Bahadır - elementer branş (TSS)
    questions: [
      {
        id: "kimin_icin",
        text: "Kimin için sigorta yaptırmak istiyorsunuz?",
        type: "choice",
        options: ["Kendim", "Eşim", "Çocuğum", "Ailem (Birden Fazla)"]
      },
      { id: "ad_soyad", text: "Sigortalanacak kişinin ismini ve soyismini paylaşır mısınız?", type: "text" },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihini belirtir misiniz? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Lütfen tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Sigortalanacak kişinin cinsiyeti nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "boy_kilo", text: "Boyunu ve kilosunu paylaşır mısınız? (Örn: 170 cm / 70 kg)", type: "text" },
      {
        id: "il_ilce",
        text: "İkamet ettiği il ve ilçeyi belirtir misiniz? (Örn: İstanbul / Kadıköy)",
        type: "text"
      },
      { ...MESLEK_SORU_UCUNCU_SAHIS },
      {
        id: "tc_kimlik",
        text:
          "Teklifinizi hazırlayabilmemiz için son olarak T.C. kimlik numarasına ihtiyacımız var. Bu bilgi sadece teklif hazırlığı amacıyla kullanılacak ve güvenle saklanacaktır.",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor, lütfen 11 haneli olarak tekrar yazar mısınız?"
      }
    ]
  },

  hayat: {
    label: "Prim İadeli Hayat Sigortası",
    menuLabel: "Prim İadeli Hayat Sig.", // Urun secim listesinde WhatsApp'in 24 karakter siniri var
    agentNumber: "905326876126", // Enbel - danışman seçilmezse (Hayır derse) varsayılan buraya düşer
    // QR/link uzerinden gelen hazır mesaj bu metni içeriyorsa, bot direkt bu ürüne geçer.
    qrTrigger: /prim iadeli|hayat sigortas/i,
    qrGreeting:
      "Merhaba! 😊 Hayat sigortası ile ilgilendiğiniz için teşekkür ederiz. Size en uygun teklifi hazırlayabilmemiz için birkaç bilgi alalım, olur mu?",
    // Bu urunle ilgilenen danismanlar. Musteri daha once bir danismanla
    // gorustuyse, toplanan bilgiler o danismanin numarasina gider.
    // Ekip degistikce bu listeyi guncelleyebilirsiniz (isim + WhatsApp numarasi).
    advisors: [
      { name: "Enbel", number: "905326876126" },
      { name: "Fırat", number: "905527902616" },
      { name: "Seda", number: "905324176026" },
      { name: "Bahadır", number: "905380711711" }
    ],
    questions: [
      {
        id: "danisman_gorustu_mu",
        text: "Daha önce acentemizden bir danışmanla görüştünüz mü?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      {
        id: "danisman_adi",
        text: "Hangi danışmanımızla görüştünüz?",
        type: "choice",
        options: ["Enbel", "Fırat", "Seda", "Bahadır"],
        // Sadece bir onceki soruya "Evet" cevabi verildiyse sorulur.
        skipIf: (answers) => answers.danisman_gorustu_mu !== "Evet"
      },
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      {
        id: "yas",
        text: "Kaç yaşında olduğunuzu belirtir misiniz?",
        type: "text",
        validate: yasGecerliMi,
        validationError: "Lütfen yaşınızı sadece rakamla yazar mısınız? (Örn: 35)"
      },
      {
        id: "il_ilce",
        text: "İkamet ettiğiniz il ve ilçeyi söyler misiniz? (Örn: İstanbul / Kadıköy)",
        type: "text"
      },
      { ...MESLEK_SORU_SON }
    ]
  },

  bes: {
    label: "Bireysel Emeklilik Sistemi (BES)",
    menuLabel: "Bireysel Emeklilik(BES)", // Urun secim listesinde WhatsApp'in 24 karakter siniri var
    agentNumber: "905326876126", // Enbel - BES doğrudan buraya gider
    questions: [
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      {
        id: "yas",
        text: "Kaç yaşında olduğunuzu belirtir misiniz?",
        type: "text",
        validate: yasGecerliMi,
        validationError: "Lütfen yaşınızı sadece rakamla yazar mısınız? (Örn: 35)"
      },
      {
        id: "bes_var_mi",
        text: "Herhangi bir şirkette bireysel emekliliğiniz var mı?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      {
        id: "bes_sirket",
        text: "Hangi şirkette olduğunu söyler misiniz? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      {
        id: "bes_birikim",
        text: "Yaklaşık birikim tutarınızı paylaşır mısınız? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      { ...SEHIR_SORU },
      { ...MESLEK_SORU_SON }
    ]
  },

  malpraktis: {
    label: "Hekim Sorumluluk Sigortası (Malpraktis)",
    intro:
      "Hekim Sorumluluk Sigortası, mesleki uygulamalarınız sırasında oluşabilecek olası taleplere karşı sizi güvence altına alır. Teklifinizi hazırlamak için birkaç bilgi alalım. 🩺",
    menuLabel: "Hekim Sor. (Malpraktis)", // Urun secim listesinde WhatsApp'in 24 karakter siniri var
    agentNumber: "905380711711", // Bahadır - elementer branş (Malpraktis)
    // Malpraktis musterilerine (hekimlere) sadece isimleriyle ve "Hocam" diye
    // hitap ediyoruz (soyisim olmadan), daha sicak ve meslege uygun bir ton icin.
    hitapHocam: true,
    // Tum bilgiler alindiktan sonra musteriye gonderilen ozet mesajinin altina
    // eklenen ek bir tanitim mesaji (capraz satis). Baska urunlerde de ayni
    // alani kullanarak benzer bir tanitim eklenebilir.
    crossSellMessage:
      "🩺 Bu arada, doktorlarımızın ülkemizde en yüksek vergi dilimlerinde yer aldığını biliyoruz. " +
      "Prim İadeli Hayat Sigortamız ile ödediğiniz primler ciddi bir vergi avantajı sağlıyor, üstelik " +
      "vade sonunda bir talebiniz olmazsa ödediğiniz primler aynen size geri iade ediliyor. 💰\n\n" +
      "Detaylı bilgi ve teklif için: https://www.wesigorta.com.tr/primiadeli/",
    questions: [
      { id: "ad_soyad", text: "İsim ve soyisminizi paylaşır mısınız?", type: "text", sameAsAccountHolder: true },
      { id: "uzmanlik_dali", text: "Uzmanlık dalınızı belirtir misiniz?", type: "text" },
      {
        id: "adres_tipi",
        text: "Adres tipi nedir?",
        type: "choice",
        options: ["Ev", "İş", "Muayenehane"]
      },
      {
        id: "yillik_hasta_sayisi",
        text: "Yıllık hasta sayınızı yaklaşık olarak söyler misiniz?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Lütfen hasta sayısını sadece rakamla yazar mısınız? (Örn: 500)"
      },
      {
        id: "tescil_turu",
        text: "Tescil türünüz nedir?",
        type: "choice",
        options: ["Diploma Tescil", "Uzmanlık Tescil"]
      },
      { id: "tescil_no", text: "Tescil numaranızı paylaşır mısınız?", type: "text" },
      {
        id: "tescil_tarihi",
        text: "Tescil tarihinizi belirtir misiniz? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Lütfen tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.2015)"
      },
      {
        id: "asistan_mi",
        text: "Asistan mısınız?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      {
        id: "sigorta_ettiren_turu",
        text: "Sigorta ettiren türünüz nedir?",
        type: "choice",
        options: ["Serbest Çalışan", "Kurum"]
      },
      { id: "saglik_kurumu", text: "Bağlı olduğunuz sağlık kurumunu söyler misiniz?", type: "text" },
      {
        id: "sadece_idari_gorev_mi",
        text: "Sadece idari görev mi yapıyorsunuz?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      { ...SEHIR_SORU },
      { ...MESLEK_SORU },
      { ...TC_KIMLIK_SORU }
    ]
  }
};
