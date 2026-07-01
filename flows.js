// Her urun icin sorulacak sorular burada tanimlanir.
// Yeni bir sigorta urunu eklemek icin bu dosyaya yeni bir key eklemeniz yeterli.
// type: "text" (serbest metin) | "choice" (secenekli - WhatsApp buton/liste ile sorulur)

module.exports = {
  kasko: {
    label: "Kasko Sigortasi",
    questions: [
      { id: "plaka", text: "Aracinizin plakasini yazar misiniz? (Orn: 34 ABC 123)", type: "text" },
      { id: "marka_model", text: "Aracin marka ve modeli nedir? (Orn: Toyota Corolla)", type: "text" },
      { id: "model_yili", text: "Aracin model yili nedir?", type: "text" },
      {
        id: "kullanim_amaci",
        text: "Araci ozel mi yoksa ticari amacla mi kullaniyorsunuz?",
        type: "choice",
        options: ["Ozel", "Ticari"]
      },
      { id: "hasarsizlik", text: "Hasarsizlik basamaginizi biliyor musunuz? Biliyorsaniz yazin, bilmiyorsaniz 'bilmiyorum' yazabilirsiniz.", type: "text" },
      { id: "onceki_police", text: "Daha once kaskonuz var miydi? Varsa hangi sirketteydi ve police bitis tarihi nedir?", type: "text" },
      { id: "surucu_dogum", text: "Surucunun dogum tarihi nedir? (GG.AA.YYYY)", type: "text" },
      { id: "ehliyet_tarihi", text: "Ehliyet alma tarihiniz nedir? (GG.AA.YYYY)", type: "text" }
    ]
  },

  trafik: {
    label: "Trafik Sigortasi",
    questions: [
      { id: "plaka", text: "Aracinizin plakasini yazar misiniz? (Orn: 34 ABC 123)", type: "text" },
      { id: "tescil_tarihi", text: "Aracin ilk tescil tarihi nedir? (GG.AA.YYYY)", type: "text" },
      { id: "tc_kimlik", text: "Ruhsat sahibinin T.C. kimlik numarasi nedir?", type: "text" },
      { id: "onceki_sirket", text: "Su anki/onceki trafik sigortaniz hangi sirkette, police bitis tarihi nedir?", type: "text" }
    ]
  },

  saglik: {
    label: "Saglik Sigortasi",
    questions: [
      { id: "ad_soyad", text: "Sigorta yaptirilacak kisinin ad soyadi nedir?", type: "text" },
      { id: "dogum_tarihi", text: "Dogum tarihi nedir? (GG.AA.YYYY)", type: "text" },
      { id: "tc_kimlik", text: "T.C. kimlik numarasi nedir?", type: "text" },
      {
        id: "sigara",
        text: "Sigara kullaniyor musunuz?",
        type: "choice",
        options: ["Evet", "Hayir"]
      },
      { id: "kronik_rahatsizlik", text: "Bilinen bir kronik rahatsizliginiz veya suregelen tedaviniz var mi? Varsa kisaca belirtir misiniz?", type: "text" },
      {
        id: "aile_dahil",
        text: "Policeye es/cocuk gibi aile bireylerini de dahil etmek ister misiniz?",
        type: "choice",
        options: ["Evet", "Hayir"]
      }
    ]
  },

  dask: {
    label: "DASK (Zorunlu Deprem Sigortasi)",
    questions: [
      { id: "adres", text: "Sigortalanacak konutun tam adresi nedir? (Il / Ilce / Mahalle)", type: "text" },
      { id: "bina_yasi", text: "Binanin yapim yili (yaklasik) nedir?", type: "text" },
      {
        id: "yapi_tarzi",
        text: "Binanin yapi tarzi nedir?",
        type: "choice",
        options: ["Betonarme", "Yigma", "Diger"]
      },
      { id: "metrekare", text: "Konutun brut metrekaresi nedir?", type: "text" },
      { id: "kat_sayisi", text: "Binanin kat sayisi ve dairenin bulundugu kat kacinci kattir?", type: "text" }
    ]
  },

  konut: {
    label: "Konut Sigortasi",
    questions: [
      { id: "adres", text: "Sigortalanacak konutun tam adresi nedir?", type: "text" },
      { id: "metrekare", text: "Konutun brut metrekaresi nedir?", type: "text" },
      { id: "bina_yasi", text: "Binanin yapim yili (yaklasik) nedir?", type: "text" },
      {
        id: "mulkiyet",
        text: "Konut size mi ait, yoksa kiraci misiniz?",
        type: "choice",
        options: ["Ev sahibiyim", "Kiraciyim"]
      },
      { id: "esya_degeri", text: "Ev esyalarinizin yaklasik toplam degeri nedir? (TL)", type: "text" }
    ]
  },

  seyahat: {
    label: "Seyahat Sigortasi",
    questions: [
      { id: "gidilecek_ulke", text: "Hangi ulke/ulkelere seyahat edeceksiniz?", type: "text" },
      { id: "tarihler", text: "Seyahat baslangic ve bitis tarihleri nedir? (GG.AA.YYYY - GG.AA.YYYY)", type: "text" },
      { id: "kisi_sayisi", text: "Kac kisi icin sigorta yaptirmak istiyorsunuz?", type: "text" },
      { id: "yas_bilgileri", text: "Seyahat edecek kisilerin dogum tarihlerini yazar misiniz?", type: "text" },
      { id: "seyahat_amaci", text: "Seyahat amaciniz nedir? (Turizm, is, egitim vb.)", type: "text" }
    ]
  }
};
