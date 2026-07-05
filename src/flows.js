// Her urun icin sorulacak sorular burada tanimlanir.
// Yeni bir sigorta urunu eklemek icin bu dosyaya yeni bir key eklemeniz yeterli.
//
// question.type: "text" (serbest metin) | "choice" (secenekli - WhatsApp buton/liste ile sorulur)
// question.text: normalde bir string'dir. Bazen (orn. "kiracıysanız ev sahibinin TC'si"
//   gibi) onceki cevaba gore soru metninin degismesi gerekir - bu durumda text bir
//   fonksiyon olabilir: (answers) => "soru metni". answers, o ana kadar verilen
//   tum cevaplari icerir (id -> cevap).
// question.validate: (metin) => true/false. Sadece "text" tipi sorularda kullanilir.
//   Belirtilirse ve false donerse, bot ayni soruyu question.validationError mesajiyla
//   birlikte tekrar sorar (bir sonraki soruya gecmez).
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
  plakaGecerliMi
} = require("./validators");

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
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihiniz nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyetiniz nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" },
      {
        id: "mulkiyet_durumu",
        text: "Sigortalanacak konut size mi ait, yoksa kiracı mısınız?",
        type: "choice",
        options: ["Ev Sahibiyim", "Kiracıyım"]
      },
      {
        id: "tc_kimlik",
        text: (answers) =>
          answers.mulkiyet_durumu === "Kiracıyım"
            ? "Ev sahibinin T.C. kimlik numarasını yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)"
            : "T.C. kimlik numaranızı yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      },
      {
        id: "daini_murtehin",
        text:
          "Poliçe üzerinde dain-i mürtehin (ipotekli banka) var mı? Varsa Banka Adı, Banka Şubesi ve Kredi Döviz Türünü yazar mısınız? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      { id: "adres", text: "Sigortalanacak konutun açık adresi nedir?", type: "text" },
      {
        id: "yuz_olcumu",
        text: "Konutun yüz ölçümü (m²) nedir?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Yüz ölçümünü sadece rakamla yazar mısınız? (Örn: 120)"
      },
      {
        id: "insaat_yili",
        text: "Binanın inşaat yılı nedir?",
        type: "text",
        validate: yilGecerliMi,
        validationError: "İnşaat yılını 4 haneli olarak yazar mısınız? (Örn: 2015)"
      },
      {
        id: "bina_kat_sayisi",
        text: "Binanın kat sayısı kaçtır?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Kat sayısını sadece rakamla yazar mısınız? (Örn: 5)"
      },
      { id: "dairenin_bulundugu_kat", text: "Dairenin bulunduğu kat kaçıncı kattır?", type: "text" }
    ]
  },

  konut: {
    label: "Konut Sigortası",
    agentNumber: "905380711711", // Bahadır - elementer branş (Konut)
    questions: [
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihiniz nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyetiniz nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" },
      {
        id: "mulkiyet_durumu",
        text: "Sigortalanacak konut size mi ait, yoksa kiracı mısınız?",
        type: "choice",
        options: ["Ev Sahibiyim", "Kiracıyım"]
      },
      {
        id: "tc_kimlik",
        text: (answers) =>
          answers.mulkiyet_durumu === "Kiracıyım"
            ? "Ev sahibinin T.C. kimlik numarasını yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)"
            : "T.C. kimlik numaranızı yazar mısınız? (Poliçeyi bu bilgiyle hazırlayacağız)",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      },
      {
        id: "daini_murtehin",
        text:
          "Poliçe üzerinde dain-i mürtehin (ipotekli banka) var mı? Varsa Banka Adı, Banka Şubesi ve Kredi Döviz Türünü yazar mısınız? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      { id: "adres", text: "Sigortalanacak konutun açık adresi nedir?", type: "text" },
      {
        id: "yuz_olcumu",
        text: "Konutun yüz ölçümü (m²) nedir?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Yüz ölçümünü sadece rakamla yazar mısınız? (Örn: 120)"
      },
      {
        id: "insaat_yili",
        text: "Binanın inşaat yılı nedir?",
        type: "text",
        validate: yilGecerliMi,
        validationError: "İnşaat yılını 4 haneli olarak yazar mısınız? (Örn: 2015)"
      },
      {
        id: "bina_kat_sayisi",
        text: "Binanın kat sayısı kaçtır?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Kat sayısını sadece rakamla yazar mısınız? (Örn: 5)"
      },
      { id: "dairenin_bulundugu_kat", text: "Dairenin bulunduğu kat kaçıncı kattır?", type: "text" }
    ]
  },

  trafik: {
    label: "Trafik Sigortası",
    agentNumber: "905380711711", // Bahadır - elementer branş (Trafik)
    qrTrigger: /trafik/i,
    qrGreeting:
      "Merhaba! 😊 Yeni aracınız hayırlı olsun, güle güle kullanın! 🚗✨ Trafik sigortanızı en kısa sürede hazırlayabilmemiz için birkaç küçük bilgiye ihtiyacımız olacak, hemen başlayalım mı?",
    questions: [
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "tc_kimlik",
        text: "T.C. kimlik numaranızı yazar mısınız?",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihiniz nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyetiniz nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" },
      {
        id: "plaka",
        text: "Aracınızın plakası nedir? (Örn: 34 ABC 123)",
        type: "text",
        validate: plakaGecerliMi,
        validationError: "Plakayı doğru formatta yazar mısınız? (Örn: 34 ABC 123)"
      },
      { id: "ruhsat_seri_no", text: "Ruhsat belge seri numarası nedir?", type: "text" }
    ]
  },

  kasko: {
    label: "Kasko Sigortası",
    agentNumber: "905380711711", // Bahadır - elementer branş (Kasko)
    questions: [
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "tc_kimlik",
        text: "T.C. kimlik numaranızı yazar mısınız?",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihiniz nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyetiniz nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" },
      {
        id: "plaka",
        text: "Aracınızın plakası nedir? (Örn: 34 ABC 123)",
        type: "text",
        validate: plakaGecerliMi,
        validationError: "Plakayı doğru formatta yazar mısınız? (Örn: 34 ABC 123)"
      },
      { id: "ruhsat_seri_no", text: "Ruhsat belge seri numarası nedir?", type: "text" }
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
      { id: "ad_soyad", text: "Sigortalanacak kişinin ad soyadı nedir?", type: "text" },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihi nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyeti nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "boy_kilo", text: "Boyu ve kilosu nedir? (Örn: 170 cm / 70 kg)", type: "text" },
      { id: "meslek", text: "Mesleği nedir?", type: "text" },
      { id: "il", text: "İkamet ettiği il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiği ilçe neresidir?", type: "text" },
      {
        id: "tc_kimlik",
        text:
          "Teklifinizi hazırlayabilmemiz için son olarak T.C. kimlik numarasına ihtiyacımız var. Bu bilgi sadece teklif hazırlığı amacıyla kullanılacak ve güvenle saklanacaktır.",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      }
    ]
  },

  tss: {
    label: "TSS (Tamamlayıcı Sağlık Sigortası)",
    agentNumber: "905380711711", // Bahadır - elementer branş (TSS)
    questions: [
      {
        id: "kimin_icin",
        text: "Kimin için sigorta yaptırmak istiyorsunuz?",
        type: "choice",
        options: ["Kendim", "Eşim", "Çocuğum", "Ailem (Birden Fazla)"]
      },
      { id: "ad_soyad", text: "Sigortalanacak kişinin ad soyadı nedir?", type: "text" },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihi nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyeti nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "boy_kilo", text: "Boyu ve kilosu nedir? (Örn: 170 cm / 70 kg)", type: "text" },
      { id: "meslek", text: "Mesleği nedir?", type: "text" },
      { id: "il", text: "İkamet ettiği il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiği ilçe neresidir?", type: "text" },
      {
        id: "tc_kimlik",
        text:
          "Teklifinizi hazırlayabilmemiz için son olarak T.C. kimlik numarasına ihtiyacımız var. Bu bilgi sadece teklif hazırlığı amacıyla kullanılacak ve güvenle saklanacaktır.",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      }
    ]
  },

  hayat: {
    label: "Prim İadeli Hayat Sigortası",
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
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "yas",
        text: "Kaç yaşındasınız?",
        type: "text",
        validate: yasGecerliMi,
        validationError: "Yaşınızı sadece rakamla yazar mısınız? (Örn: 35)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyetiniz nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" }
    ]
  },

  bes: {
    label: "Bireysel Emeklilik Sistemi (BES)",
    agentNumber: "905326876126", // Enbel - BES doğrudan buraya gider
    questions: [
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "yas",
        text: "Kaç yaşındasınız?",
        type: "text",
        validate: yasGecerliMi,
        validationError: "Yaşınızı sadece rakamla yazar mısınız? (Örn: 35)"
      },
      {
        id: "cinsiyet",
        text: "Cinsiyetiniz nedir?",
        type: "choice",
        options: ["Kadın", "Erkek"]
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" },
      {
        id: "bes_var_mi",
        text: "Herhangi bir şirkette bireysel emekliliğiniz var mı?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      {
        id: "bes_sirket",
        text: "Varsa hangi şirkette? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      },
      {
        id: "bes_birikim",
        text: "Yaklaşık birikim tutarınız nedir? Yoksa 'yok' yazabilirsiniz.",
        type: "text"
      }
    ]
  },

  malpraktis: {
    label: "Hekim Sorumluluk Sigortası (Malpraktis)",
    agentNumber: "905380711711", // Bahadır - elementer branş (Malpraktis)
    questions: [
      { id: "ad_soyad", text: "Ad soyadınızı yazar mısınız?", type: "text" },
      {
        id: "tc_kimlik",
        text: "T.C. kimlik numaranızı yazar mısınız?",
        type: "text",
        validate: tcKimlikGecerliMi,
        validationError:
          "Girdiğiniz T.C. kimlik numarası geçerli görünmüyor. 11 haneli olarak tekrar yazar mısınız?"
      },
      {
        id: "dogum_tarihi",
        text: "Doğum tarihiniz nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.1990)"
      },
      { id: "meslek", text: "Mesleğiniz nedir?", type: "text" },
      { id: "uzmanlik_dali", text: "Uzmanlık dalınız nedir?", type: "text" },
      {
        id: "adres_tipi",
        text: "Adres tipi nedir?",
        type: "choice",
        options: ["Ev", "İş", "Muayenehane"]
      },
      {
        id: "yillik_hasta_sayisi",
        text: "Yıllık hasta sayınız yaklaşık kaçtır?",
        type: "text",
        validate: pozitifSayiMi,
        validationError: "Hasta sayısını sadece rakamla yazar mısınız? (Örn: 500)"
      },
      {
        id: "tescil_turu",
        text: "Tescil türü nedir?",
        type: "choice",
        options: ["Diploma Tescil", "Uzmanlık Tescil"]
      },
      { id: "tescil_no", text: "Tescil numaranız nedir?", type: "text" },
      {
        id: "tescil_tarihi",
        text: "Tescil tarihiniz nedir? (GG.AA.YYYY)",
        type: "text",
        validate: tarihGecerliMi,
        validationError: "Tarihi GG.AA.YYYY formatında yazar mısınız? (Örn: 15.05.2015)"
      },
      {
        id: "asistan_mi",
        text: "Asistan mısınız?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      {
        id: "sigorta_ettiren_turu",
        text: "Sigorta ettiren türü nedir?",
        type: "choice",
        options: ["Serbest Çalışan", "Kurum"]
      },
      { id: "saglik_kurumu", text: "Bağlı olduğunuz sağlık kurumu neresidir?", type: "text" },
      {
        id: "sadece_idari_gorev_mi",
        text: "Sadece idari görev mi yapıyorsunuz?",
        type: "choice",
        options: ["Evet", "Hayır"]
      },
      { id: "il", text: "İkamet ettiğiniz il neresidir?", type: "text" },
      { id: "ilce", text: "İkamet ettiğiniz ilçe neresidir?", type: "text" }
    ]
  }
};
