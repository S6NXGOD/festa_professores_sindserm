/*
 * Envio de arquivos pelo navegador (foto do local, documentos da ficha): reduz
 * as fotos no próprio celular e envia por uma rota própria, com progresso e
 * tempo máximo — sem passar pela fila das Server Actions.
 */

async function encode(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Reduz a foto (câmeras passam de 5 MB) para no máximo `maxSide` pixels, em
 * JPEG. Se o navegador não conseguir ler o formato, devolve o original e o
 * servidor tenta.
 */
export async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let blob = await encode(canvas, 0.85);
    // Foto com muito detalhe: mais compressão para o envio ser rápido no 4G.
    if (blob && blob.size > 1_500_000) blob = (await encode(canvas, 0.7)) ?? blob;
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export type UploadResponse<T> = { ok: true; body: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** POST com progresso (0–99 durante o envio) e tempo máximo. */
export function uploadWithProgress<T>(
  url: string,
  data: FormData,
  onProgress: (percent: number) => void,
  options: { timeoutMs?: number; fallbackError?: string } = {},
): Promise<UploadResponse<T>> {
  const fallback = options.fallbackError ?? "Não foi possível enviar. Tente de novo.";
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = options.timeoutMs ?? 60_000;
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      const body = xhr.response as (T & { ok?: boolean; error?: string; fieldErrors?: Record<string, string> }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok) resolve({ ok: true, body });
      else resolve({ ok: false, error: body?.error ?? fallback, fieldErrors: body?.fieldErrors });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Falha de conexão ao enviar. Confira a internet e tente de novo." });
    xhr.ontimeout = () => resolve({ ok: false, error: "O envio demorou demais. Tente de novo (de preferência no Wi-Fi)." });
    xhr.send(data);
  });
}
