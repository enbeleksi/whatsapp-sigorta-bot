// Sisteme (panelden ya da WhatsApp'tan) yuklenebilecek dosya turlerini kisitlar.
// Amac, kotu amacli dosyalarin (calistirilabilir dosyalar, sikistirilmis
// arsivler vb.) sisteme girmesini engellemek - sadece belge/fotograf turleri
// kabul edilir: PDF, Word, Excel, fotograf.

const IZINLI_MIME_TURLERI = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
];

function dosyaTuruIzinliMi(mimeType) {
  return IZINLI_MIME_TURLERI.includes((mimeType || "").toLowerCase());
}

module.exports = { IZINLI_MIME_TURLERI, dosyaTuruIzinliMi };
