"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Camera, Check, Close, Download, Trophy, Warning, Whatsapp } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { slugify } from "@/lib/clipboard";
import { confettiLook } from "@/lib/confetti-look";
import { playSound } from "@/lib/sound";
import { firstName } from "@/lib/text";
import { cn } from "@/lib/utils";

export interface MissionVoucher {
  personId: string;
  token: string;
  fullName: string;
  kind: "MEMBER" | "GUEST";
}

/** A imagem do voucher já baixada (para o compartilhamento abrir na hora do toque). */
interface Prepared {
  file: File;
  url: string;
}

const EVENT = "festa:missao";
const storageKey = (id: string) => `festa:missao:${id}`;
const fileName = (fullName: string) => `voucher-${slugify(fullName)}.png`;

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function readDone(id: string): string {
  try {
    return window.localStorage.getItem(storageKey(id)) ?? "[]";
  } catch {
    return "[]";
  }
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** iPhone e iPad: "Salvar imagem" do compartilhamento leva direto para a galeria (o download vai para o app Arquivos). */
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function canShareFiles(files: File[]) {
  try {
    return files.length > 0 && typeof navigator.canShare === "function" && navigator.canShare({ files });
  } catch {
    return false;
  }
}

const aborted = (error: unknown) => (error as Error | null)?.name === "AbortError";

const noSubscription = () => () => {};
const isTouch = () => window.matchMedia("(pointer: coarse)").matches;

/** iPhone/iPad e tela de toque (celular): decide entre compartilhar a imagem e baixar. No servidor, nenhum dos dois. */
function usePlatform() {
  const ios = useSyncExternalStore(noSubscription, isIOS, () => false);
  const touch = useSyncExternalStore(noSubscription, isTouch, () => false);
  return { ios, touch };
}

/** Baixa as imagens dos vouchers assim que a página abre (sem rede, os botões usam o link direto). */
function usePreparedVouchers(vouchers: MissionVoucher[]) {
  const [prepared, setPrepared] = useState<Record<string, Prepared>>({});
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    void (async () => {
      for (const voucher of vouchers) {
        try {
          const response = await fetch(`/v/${voucher.token}/imagem`);
          if (!response.ok || cancelled) continue;
          const blob = await response.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const file = new File([blob], fileName(voucher.fullName), { type: "image/png" });
          if (!cancelled) setPrepared((current) => ({ ...current, [voucher.personId]: { file, url } }));
        } catch {
          // sem rede agora: os botões caem no link direto da imagem
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [vouchers]);
  return prepared;
}

/**
 * Depois da inscrição: salvar os vouchers em dois passos claros. O seu vai para
 * o celular (no iPhone, pelo "Salvar imagem", direto na galeria); o do
 * convidado vai para ele como imagem, pelo WhatsApp ou outro app, e não só um
 * link. Quem preferir tira print: o modo print mostra um voucher por tela.
 * Cada passo feito marca o check (com som); o progresso fica lembrado neste
 * aparelho. Com `remind` (inscrição recém-feita), um aviso abre na tela.
 */
export function SaveVouchersMission({
  vouchers,
  missionId,
  eventName,
  remind = false,
}: {
  vouchers: MissionVoucher[];
  missionId: string;
  eventName: string;
  remind?: boolean;
}) {
  const [reminderOpen, setReminderOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const platform = usePlatform();
  // O aviso abre logo depois da comemoração da inscrição.
  useEffect(() => {
    if (!remind) return;
    const timer = window.setTimeout(() => setReminderOpen(true), 1100);
    return () => window.clearTimeout(timer);
  }, [remind]);
  const prepared = usePreparedVouchers(vouchers);
  const stored = useSyncExternalStore(
    subscribe,
    () => readDone(missionId),
    () => "[]",
  );
  // Vale também sem armazenamento (navegação anônima): o que foi feito nesta visita.
  const [session, setSession] = useState<string[]>([]);
  const done = useMemo(() => new Set([...parse(stored), ...session]), [stored, session]);
  const complete = vouchers.every((voucher) => done.has(voucher.personId));
  const allFiles = vouchers.map((voucher) => prepared[voucher.personId]?.file).filter((file): file is File => Boolean(file));
  // No iPhone, um toque salva os dois na galeria ("Salvar 2 imagens").
  const canSaveBoth = vouchers.length > 1 && platform.ios && allFiles.length === vouchers.length && canShareFiles(allFiles);

  function mark(personIds: string[]) {
    const fresh = personIds.filter((personId) => !done.has(personId));
    if (fresh.length === 0) {
      playSound("blip");
      return;
    }
    const next = [...done, ...fresh];
    setSession(next);
    try {
      window.localStorage.setItem(storageKey(missionId), JSON.stringify(next));
    } catch {
      // armazenamento indisponível: vale só nesta visita
    }
    window.dispatchEvent(new Event(EVENT));
    const finished = vouchers.every((voucher) => next.includes(voucher.personId));
    playSound(finished ? "fanfare" : "coin");
    if (finished && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.4 },
        ...confettiLook(["#ff2626", "#e3000f", "#ffffff", "#22c55e"]),
        ticks: 160,
        flat: true,
      });
    }
  }

  function download(voucher: MissionVoucher) {
    const link = document.createElement("a");
    link.href = prepared[voucher.personId]?.url ?? `/v/${voucher.token}/imagem`;
    link.download = fileName(voucher.fullName);
    document.body.append(link);
    link.click();
    link.remove();
  }

  async function save(voucher: MissionVoucher) {
    const file = prepared[voucher.personId]?.file;
    if (file && platform.ios && canShareFiles([file])) {
      try {
        await navigator.share({ files: [file] });
        mark([voucher.personId]);
      } catch (error) {
        if (!aborted(error)) {
          download(voucher);
          mark([voucher.personId]);
        }
      }
      return;
    }
    download(voucher);
    mark([voucher.personId]);
    toast.success(platform.touch ? "Imagem baixada: fica na galeria, na pasta Downloads." : "Imagem baixada.");
  }

  async function saveBoth() {
    try {
      await navigator.share({ files: allFiles });
      mark(vouchers.map((voucher) => voucher.personId));
    } catch (error) {
      if (!aborted(error)) toast.error("Não deu para salvar as duas de uma vez. Salve uma de cada vez.");
    }
  }

  async function sendToGuest(voucher: MissionVoucher) {
    const first = firstName(voucher.fullName);
    const text = `Oi, ${first}! Este é o seu voucher da ${eventName}. Mostre o QR Code na entrada.`;
    const file = prepared[voucher.personId]?.file;
    // No celular, vai a própria imagem (abre na hora, até sem internet na porta da festa).
    if (file && platform.touch && canShareFiles([file])) {
      try {
        await navigator.share({ files: [file], text });
        mark([voucher.personId]);
        return;
      } catch (error) {
        if (aborted(error)) return;
      }
    }
    const url = `${window.location.origin}/v/${voucher.token}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
    mark([voucher.personId]);
  }

  function later() {
    setReminderOpen(false);
    if (!complete) toast.info("O link desta página abre os vouchers de novo. Guarde-o (tem o botão de copiar logo abaixo).");
  }

  function openPrintMode() {
    setReminderOpen(false);
    // Nada por cima do voucher na hora do print (os avisos do topo cobririam o título).
    toast.dismiss();
    setPrintOpen(true);
    playSound("blip");
  }

  const steps = (place: "reminder" | "mission") => (
    <MissionSteps
      vouchers={vouchers}
      done={done}
      prepared={prepared}
      place={place}
      canSaveBoth={canSaveBoth}
      onSave={(voucher) => void save(voucher)}
      onSaveBoth={() => void saveBoth()}
      onSend={(voucher) => void sendToGuest(voucher)}
      onPrintMode={openPrintMode}
    />
  );

  return (
    <>
      <Dialog open={reminderOpen && !complete} onOpenChange={(value) => (value ? setReminderOpen(true) : later())}>
        <DialogContent data-testid="voucher-reminder">
          <DialogHeader>
            <PixelTag tone="red" className="w-fit">
              Missão principal
            </PixelTag>
            <DialogTitle>Não esqueça: salve {vouchers.length > 1 ? "os vouchers" : "o seu voucher"}</DialogTitle>
            <DialogDescription>
              É o QR Code que abre a porta da festa. Salve no celular (ou tire um print): o voucher não é mandado por e-mail.
            </DialogDescription>
          </DialogHeader>
          {steps("reminder")}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={later} data-testid="reminder-later">
              Depois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printOpen ? (
        <ScreenshotMode
          vouchers={vouchers}
          prepared={prepared}
          onClose={() => setPrintOpen(false)}
          onDone={() => {
            setPrintOpen(false);
            mark(vouchers.map((voucher) => voucher.personId));
            if (vouchers.length > 1) toast.success(`Prints feitos! Mande o print de ${firstName(vouchers[1]!.fullName)} pelo WhatsApp.`);
          }}
        />
      ) : null}

      <section
        className={cn(
          "no-print rounded-2xl border-2 p-4 sm:p-5",
          complete ? "border-success/50 bg-success-soft" : "border-red/50 bg-[linear-gradient(135deg,var(--brand-soft),rgb(0_0_0/0.35))]",
        )}
        aria-labelledby="mission-title"
        data-testid="save-mission"
      >
        <div className="flex items-center justify-between gap-3">
          <PixelTag tone={complete ? "success" : "red"}>{complete ? "Missão cumprida" : "Missão bônus"}</PixelTag>
          <span className="pixel text-[0.6rem] text-fg-muted tabular" data-testid="mission-progress">
            {vouchers.filter((voucher) => done.has(voucher.personId)).length}/{vouchers.length}
          </span>
        </div>
        <h2 id="mission-title" className="display mt-3 text-2xl text-fg sm:text-3xl">
          {complete ? "Vouchers salvos. É só curtir a festa!" : vouchers.length > 1 ? "Agora salve os vouchers no celular" : "Agora salve o seu voucher no celular"}
        </h2>
        <div className="mt-4">{steps("mission")}</div>
        {complete ? (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-success-text">
            <Trophy className="size-4" /> Na entrada, cada pessoa mostra o próprio QR Code.
          </p>
        ) : null}
      </section>
    </>
  );
}

/** Os passos da missão: o seu voucher e o do convidado, cada um com a ação principal à mostra. */
function MissionSteps({
  vouchers,
  done,
  prepared,
  place,
  canSaveBoth,
  onSave,
  onSaveBoth,
  onSend,
  onPrintMode,
}: {
  vouchers: MissionVoucher[];
  done: Set<string>;
  prepared: Record<string, Prepared>;
  place: "reminder" | "mission";
  canSaveBoth: boolean;
  onSave: (voucher: MissionVoucher) => void;
  onSaveBoth: () => void;
  onSend: (voucher: MissionVoucher) => void;
  onPrintMode: () => void;
}) {
  return (
    <div className="grid gap-3">
      <ol className="grid gap-2">
        {vouchers.map((voucher, index) => {
          const checked = done.has(voucher.personId);
          const first = firstName(voucher.fullName);
          const isGuest = voucher.kind === "GUEST";
          const preview = prepared[voucher.personId]?.url;
          return (
            <li
              key={voucher.personId}
              className={cn("flex gap-3 rounded-xl border p-3", checked ? "border-success/40 bg-success-soft" : "border-line-strong bg-ink/60")}
              data-testid={`${place}-step-${voucher.kind.toLowerCase()}`}
              data-voucher-token={voucher.token}
            >
              {/* A miniatura do voucher: dá para ver o que está salvando. */}
              <div className="relative h-24 w-[3.4rem] shrink-0 overflow-hidden rounded-md border border-line-strong bg-ink">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem já baixada (blob)
                  <img src={preview} alt="" className="size-full object-cover object-top" />
                ) : (
                  <span className="absolute inset-0 animate-pulse bg-surface-3" aria-hidden />
                )}
                <AnimatePresence initial={false}>
                  {checked ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-success/80 text-success-foreground"
                    >
                      <Check className="size-7" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-fg">
                  {vouchers.length > 1 ? `${index + 1}. ` : ""}
                  {isGuest ? `O voucher de ${first}` : "O seu voucher"}
                  {isGuest ? <span className="font-normal text-fg-muted"> (convidado)</span> : null}
                  <span className="sr-only">{checked ? " (feito)" : ""}</span>
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {isGuest ? `Mande a imagem para ${first}: cada pessoa mostra o próprio QR Code.` : "Guarde no celular para mostrar na entrada."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {isGuest ? (
                    <>
                      <Button type="button" size="sm" variant="success" onClick={() => onSend(voucher)} data-testid={`${place}-send-guest`}>
                        <Whatsapp /> Mandar para {first}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => onSave(voucher)} data-testid={`${place}-download-guest`}>
                        <Download /> Salvar no meu celular
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" onClick={() => onSave(voucher)} data-testid={`${place}-download-member`}>
                      <Download /> Salvar no celular
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {canSaveBoth ? (
        <Button type="button" variant="secondary" onClick={onSaveBoth} data-testid={`${place}-save-both`}>
          <Download /> Salvar os {vouchers.length} de uma vez
        </Button>
      ) : null}
      <button
        type="button"
        onClick={onPrintMode}
        className="flex items-start gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-left text-sm text-fg-muted transition-colors hover:border-red/60 hover:text-fg"
        data-testid={`${place}-print-mode`}
      >
        <Camera className="mt-0.5 size-4 shrink-0 text-red" />
        <span>
          <strong className="text-fg">Prefere tirar print?</strong> Mostramos um voucher por tela, no tamanho certo.
          {vouchers.length > 1 ? " Depois é só mandar o print do convidado para ele." : ""}
        </span>
      </button>
      <p className="flex items-start gap-2 text-xs text-fg-muted">
        <Warning className="mt-0.5 size-3.5 shrink-0 text-warning" /> Sem internet na porta da festa? A imagem salva (ou o print) funciona do mesmo jeito.
      </p>
    </div>
  );
}

/** Modo print: um voucher por tela, do tamanho da tela do celular, com o que fazer em cada passo. */
function ScreenshotMode({
  vouchers,
  prepared,
  onClose,
  onDone,
}: {
  vouchers: MissionVoucher[];
  prepared: Record<string, Prepared>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const nextButton = useRef<HTMLButtonElement>(null);
  const voucher = vouchers[index]!;
  const isGuest = voucher.kind === "GUEST";
  const first = firstName(voucher.fullName);
  const last = index === vouchers.length - 1;

  useEffect(() => {
    nextButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onClose]);

  function next() {
    playSound(last ? "fanfare" : "coin");
    if (last) onDone();
    else setIndex(index + 1);
  }

  // Direto no fim da página: dentro dos blocos animados, o botão de ajuda do WhatsApp ficava por cima.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Modo print" className="no-print fixed inset-0 z-[70] flex flex-col bg-ink" data-testid="print-mode">
      <div className="flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="pixel shrink-0 text-[0.6rem] text-fg-muted tabular">
          {index + 1}/{vouchers.length}
        </span>
        <p className="min-w-0 flex-1 text-center text-sm font-bold text-fg" data-testid="print-mode-title">
          {isGuest ? `Tire o print e mande para ${first}` : "Tire o print do seu voucher"}
        </p>
        <button type="button" onClick={onClose} aria-label="Fechar o modo print" className="shrink-0 rounded-md p-1 text-fg-muted hover:text-fg">
          <Close className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={voucher.personId}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            src={prepared[voucher.personId]?.url ?? `/v/${voucher.token}/imagem`}
            alt={`Voucher de ${voucher.fullName}`}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </AnimatePresence>
      </div>
      <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-fg-muted">Print: botão de ligar + volume (para baixo no Android, para cima no iPhone).</p>
        <Button ref={nextButton} type="button" size="lg" className="mt-2 w-full" onClick={next} data-testid="print-mode-next">
          <Camera />
          {last ? (vouchers.length > 1 ? "Tirei os prints" : "Tirei o print") : `Tirei · próximo: ${firstName(vouchers[index + 1]!.fullName)}`}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
