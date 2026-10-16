"use client";

import type { IScannerControls } from "@zxing/browser";
import { useEffect, useRef, useState } from "react";
import { Close, QrCode } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";

/**
 * Câmera em tela cheia para ler o QR do voucher na mesa dos kits. Só lê: quem
 * decide o que fazer é a mesa (a leitura não entrega nada).
 */
export function QrSheet({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let controls: IScannerControls | null = null;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 700 });
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current!,
          (result) => {
            if (!result || doneRef.current) return;
            doneRef.current = true;
            onResult(result.getText());
          },
        );
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled) setError("Não deu para abrir a câmera. Libere a câmera no navegador ou digite o código do voucher na busca.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Ler QR Code do voucher" data-testid="desk-qr-sheet">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <div className="size-64 rounded-3xl border-4 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]" />
      </div>
      <div className="safe-top relative flex items-center justify-between gap-3 p-4">
        <p className="flex items-center gap-2 rounded-lg bg-black/60 px-3 py-2 text-sm font-semibold text-white">
          <QrCode className="size-5" /> Aponte para o QR do voucher
        </p>
        <Button type="button" variant="light" size="sm" onClick={onClose} data-testid="desk-qr-close">
          <Close /> Fechar
        </Button>
      </div>
      {error ? (
        <p className="relative mx-4 mt-auto mb-8 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white">{error}</p>
      ) : null}
    </div>
  );
}
