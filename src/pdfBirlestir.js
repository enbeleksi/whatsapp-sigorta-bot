// Satis kaydi akisinda danismanin tek tek yukledigi belgeleri (kimlik on/arka
// yuz, imzali acik riza beyani, imzali imza karti, yerlesim yeri belgesi -
// bunlarin her biri fotograf ya da PDF olarak gelebilir) TEK bir PDF dosyasi
// haline getirir. Boylece Garanti Emeklilik'e giden mailde 5 ayri ek yerine
// tek, duzenli bir PDF gidiyor.
//
// Fotograflar (jpg/png) A4 sayfasina, en-boy orani bozulmadan, ortalanarak
// yerlestirilir. Zaten PDF olan belgelerin sayfalari oldugu gibi kopyalanir.
// Belgelerin sirasi, gelen dizideki sirayla (danismanin yukledigi sira ile)
// aynidir.

const { PDFDocument } = require("pdf-lib");

const A4_GENISLIK = 595.28;
const A4_YUKSEKLIK = 841.89;

function resmiA4SayfayaEkle(birlesikPdf, resim) {
  const sayfa = birlesikPdf.addPage([A4_GENISLIK, A4_YUKSEKLIK]);
  const olcek = Math.min(A4_GENISLIK / resim.width, A4_YUKSEKLIK / resim.height);
  const genislik = resim.width * olcek;
  const yukseklik = resim.height * olcek;
  sayfa.drawImage(resim, {
    x: (A4_GENISLIK - genislik) / 2,
    y: (A4_YUKSEKLIK - yukseklik) / 2,
    width: genislik,
    height: yukseklik
  });
}

// belgeler: [{ dosyaAdi, mimeType, veriBase64 }]
// donen deger: Buffer (birlesik PDF'in ham verisi)
//
// ONEMLI - 22.07.2026 tarihli duzeltme (gizli/sessiz BOS PDF hatasi):
// izinliDosyaTurleri.js, yuklemeye "image/webp", "image/heic", "image/heif"
// turlerine de izin veriyor - ama bu fonksiyon SADECE JPEG/PNG/PDF'i
// pdf-lib ile gomebiliyor (pdf-lib'in kendi kisitlamasi). Desteklenmeyen bir
// tur geldiginde eskiden sadece console.warn ile SESSIZCE atlaniyordu - eger
// birlestirilecek TEK belge buysa, sonuc GECERLI ama TAMAMEN BOS (0 sayfali)
// bir PDF oluyordu ve fonksiyon bunu "basarili" gibi geri donduruyordu. Bu,
// hem satis kaydi (Garanti Emeklilik'e giden mail eki) hem de arac satis
// sozlesmesi (Bahadır'a giden belge) akislarinda fark edilmeden BOS bir PDF
// gonderilmesine yol acabilirdi. Artik en az 1 sayfa eklenemezse fonksiyon
// HATA FIRLATIR - cagiran taraf bunu yakalayip (orn. advisorEngine.js'teki
// satistanIptalTalebiOlustur) orijinal dosyayi PDF yerine oldugu gibi
// iletme gibi bir yedek plana gecebilir, ASLA "basarili ama bos" bir PDF
// sessizce gonderilmez.
async function belgeleriTekPdfeBirlestir(belgeler) {
  const birlesikPdf = await PDFDocument.create();
  let eklenenSayfaSayisi = 0;
  const atlananlar = [];

  for (const belge of belgeler || []) {
    const buffer = Buffer.from(belge.veriBase64, "base64");
    const mime = (belge.mimeType || "").toLowerCase();

    try {
      if (mime === "application/pdf") {
        const kaynakPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const kopyalananSayfalar = await birlesikPdf.copyPages(kaynakPdf, kaynakPdf.getPageIndices());
        kopyalananSayfalar.forEach((sayfa) => birlesikPdf.addPage(sayfa));
        eklenenSayfaSayisi += kopyalananSayfalar.length;
      } else if (mime === "image/jpeg" || mime === "image/jpg") {
        const resim = await birlesikPdf.embedJpg(buffer);
        resmiA4SayfayaEkle(birlesikPdf, resim);
        eklenenSayfaSayisi += 1;
      } else if (mime === "image/png") {
        const resim = await birlesikPdf.embedPng(buffer);
        resmiA4SayfayaEkle(birlesikPdf, resim);
        eklenenSayfaSayisi += 1;
      } else {
        console.warn(
          `Belge birlestirmede desteklenmeyen dosya turu atlandi: ${belge.dosyaAdi || "(adsiz)"} (${mime})`
        );
        atlananlar.push(belge.dosyaAdi || "(adsiz)");
      }
    } catch (err) {
      console.error(
        `Belge birlestirmeye eklenemedi, atlandi: ${belge.dosyaAdi || "(adsiz)"} - ${err.message}`
      );
      atlananlar.push(belge.dosyaAdi || "(adsiz)");
    }
  }

  if (eklenenSayfaSayisi === 0) {
    throw new Error(
      `Hiçbir belge PDF'e eklenemedi (desteklenmeyen tür ve/veya bozuk veri): ${atlananlar.join(", ") || "belge listesi boş"}`
    );
  }

  const birlesikBytes = await birlesikPdf.save();
  return Buffer.from(birlesikBytes);
}

module.exports = { belgeleriTekPdfeBirlestir };
