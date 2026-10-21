/**
 * Gera as versões otimizadas das artes a partir dos arquivos originais em
 * /public (logo_festa.png, logo_base.png, logo_base_branca.png e, da festa
 * das servidoras e servidores, sunset_sindserm.png).
 *
 *   npm run brand
 *
 * Se o cartaz da festa mudar, ajuste EMBLEM_CROP (área do emblema dentro do
 * cartaz, em pixels) e rode de novo.
 */
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const EMBLEM_CROP = { left: 88, top: 182, width: 904, height: 776 };
const OUT = "public/brand";

mkdirSync(OUT, { recursive: true });

const emblem = sharp("public/logo_festa.png").extract(EMBLEM_CROP);
await emblem.clone().webp({ quality: 88 }).toFile(`${OUT}/festa-emblema.webp`);
// JPEG para o cartão em PNG do voucher (o gerador de imagens não lê WEBP).
await emblem.clone().resize({ width: 640 }).jpeg({ quality: 86, mozjpeg: true }).toFile(`${OUT}/festa-emblema.jpg`);
await sharp("public/logo_festa.png").resize({ width: 720 }).jpeg({ quality: 84, mozjpeg: true }).toFile(`${OUT}/festa-cartaz.jpg`);
await sharp("public/logo_base_branca.png").resize({ width: 700 }).png({ compressionLevel: 9 }).toFile(`${OUT}/sindserm-branca.png`);
await sharp("public/logo_base.png").resize({ width: 700 }).png({ compressionLevel: 9 }).toFile(`${OUT}/sindserm.png`);
await sharp("src/app/icon.svg", { density: 300 }).resize(180, 180).png().toFile("src/app/apple-icon.png");

// Festa das servidoras e servidores (verão): a arte oficial, de fundo transparente,
// recortada e centralizada no mesmo quadro do emblema (904 × 776), sem ampliar.
const SERVIDORES_ART = "public/sunset_sindserm.png";
if (existsSync(SERVIDORES_ART)) {
  mkdirSync(`${OUT}/servidores`, { recursive: true });
  const art = await sharp(SERVIDORES_ART)
    .trim({ threshold: 10 })
    .resize({ width: 874, height: 746, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const framed = await sharp({ create: { width: 904, height: 776, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toBuffer();
  await sharp(framed).webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT}/servidores/emblema.webp`);
  // PNG (com a transparência) para a prévia do link, o voucher em imagem, os PDFs e o ícone (o gerador de imagens não lê WEBP).
  await sharp(framed).png({ palette: true, quality: 92, compressionLevel: 9 }).toFile(`${OUT}/servidores/emblema.png`);
}

console.log("Artes geradas em public/brand e src/app/apple-icon.png");
