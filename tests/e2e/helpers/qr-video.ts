import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

/**
 * Gera um vídeo Y4M com um QR Code, usado como câmera falsa do Chromium
 * (--use-file-for-fake-video-capture). Cada quadro varia levemente escala,
 * posição e rotação — como uma câmera na mão —, exercitando o leitor ZXing de
 * forma realista.
 */
export function writeQrVideo(path: string, text: string, { width = 640, height = 480, frames = 24 } = {}) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const isDark = (row: number, col: number) =>
    row >= 0 && col >= 0 && row < size && col < size && qr.modules.get(row, col) === 1;
  const baseModule = (Math.min(width, height) * 0.7) / (size + 8);
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  const parts: Buffer[] = [header];

  for (let frame = 0; frame < frames; frame++) {
    const moduleSize = baseModule * (1 + 0.08 * Math.sin(frame * 0.9));
    const angle = ((4 * Math.sin(frame * 0.7)) * Math.PI) / 180;
    const centerX = width / 2 + 18 * Math.cos(frame * 0.8);
    const centerY = height / 2 + 12 * Math.sin(frame * 1.1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const luma = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let dark = 0;
        // Supersampling 2×2 para bordas suaves (como uma lente real).
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const dx = x + sx * 0.5 - centerX;
            const dy = y + sy * 0.5 - centerY;
            const u = (dx * cos + dy * sin) / moduleSize + size / 2;
            const v = (-dx * sin + dy * cos) / moduleSize + size / 2;
            if (isDark(Math.floor(v), Math.floor(u))) dark++;
          }
        }
        luma[y * width + x] = Math.round(228 - (dark / 4) * 196);
      }
    }
    parts.push(Buffer.from("FRAME\n"), luma, chroma, chroma);
  }
  writeFileSync(path, Buffer.concat(parts));
}
