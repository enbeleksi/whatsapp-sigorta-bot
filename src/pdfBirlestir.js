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
async function belgeleriTekPdfeBirlestir(belgeler) {
  const birlesikPdf = await PDFDocument.create();

  for (const belge of belgeler || []) {
    const buffer = Buffer.from(belge.veriBase64, "base64");
    const mime = (belge.mimeType || "").toLowerCase();

    try {
      if (mime === "application/pdf") {
        const kaynakPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const kopyalananSayfalar = await birlesikPdf.copyPages(kaynakPdf, kaynakPdf.getPageIndices());
        kopyalananSayfalar.forEach((sayfa) => birlesikPdf.addPage(sayfa));
      } else if (mime === "image/jpeg" || mime === "image/jpg") {
        const resim = await birlesikPdf.embedJpg(buffer);
        resmiA4SayfayaEkle(birlesikPdf, resim);
      } else if (mime === "image/png") {
        const resim = await birlesikPdf.embedPng(buffer);
        resmiA4SayfayaEkle(birlesikPdf, resim);
      } else {
        console.warn(
          `Belge birlestirmede desteklenmeyen dosya turu atlandi: ${belge.dosyaAdi || "(adsiz)"} (${mime})`
        );
      }
    } catch (err) {
      console.error(
        `Belge birlestirmeye eklenemedi, atlandi: ${belge.dosyaAdi || "(adsiz)"} - ${err.message}`
      );
    }
  }

  const birlesikBytes = await birlesikPdf.save();
  return Buffer.from(birlesikBytes);
}

module.exports = { belgeleriTekPdfeBirlestir };
