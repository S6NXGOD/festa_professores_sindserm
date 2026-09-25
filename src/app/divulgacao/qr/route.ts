import QRCode from "qrcode";
import { publicBaseUrl } from "@/server/public-url";

/**
 * QR Code do link de inscrição (para cartaz, telão ou grupo). Público: só
 * contém o endereço do site.
 */
export async function GET(request: Request) {
  const url = publicBaseUrl() ?? new URL(request.url).origin;
  const png = await QRCode.toBuffer(`${url}/`, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 1024,
    color: { dark: "#0a0a0a", light: "#ffffff" },
  });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="qr-inscricao-festa.png"',
      "Cache-Control": "public, max-age=600",
    },
  });
}
