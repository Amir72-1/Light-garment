import QRCode from "qrcode";

// The printed QR only carries the short QR code number. The full JSON payload made a dense code
// (about 65x65 modules) that phone cameras could not read from small labels.
export function renderBundleQrImage(qrCodeNumber: string) {
  return QRCode.toDataURL(qrCodeNumber, { errorCorrectionLevel: "Q", margin: 4, width: 320 });
}
