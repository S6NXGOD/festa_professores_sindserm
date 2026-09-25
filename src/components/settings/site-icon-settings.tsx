"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand/brand";
import { useSiteIconUrl } from "@/components/brand/site-icon";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Close, Undo, Upload } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { playSound } from "@/lib/sound";
import { shrinkImage, uploadWithProgress } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { removeSiteIconAction } from "@/server/actions/setup";

const MAX_SIDE = 1024;
const SEGMENTS = 16;

/** Ícone que "pula" ao trocar (a chave é a imagem). */
function PopIcon({ src, className, testId }: { src: string; className?: string; testId?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-ink", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.img
          key={src}
          src={src}
          alt=""
          draggable={false}
          data-testid={testId}
          className="absolute inset-0 size-full object-contain select-none"
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          exit={{ scale: 1.3, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
        />
      </AnimatePresence>
    </span>
  );
}

function MockLabel({ children }: { children: React.ReactNode }) {
  return <p className="pixel mb-2 text-[0.5rem] text-fg-dim">{children}</p>;
}

/** Aba do navegador, no tema escuro e no claro. */
function BrowserTabs({ icon, title }: { icon: string; title: string }) {
  const themes = [
    { bar: "bg-[#202124]", tab: "bg-[#35363a] text-[#e8eaed]" },
    { bar: "bg-[#dee1e6]", tab: "bg-white text-[#3c4043]" },
  ];
  return (
    <div className="space-y-1.5">
      {themes.map((theme, index) => (
        <div key={theme.bar} className={cn("rounded-lg px-2 pt-2", theme.bar)}>
          <div className={cn("flex w-[88%] items-center gap-2 rounded-t-lg px-3 py-2 text-xs", theme.tab)}>
            <PopIcon src={icon} className="size-4 rounded-[3px]" testId={index === 0 ? "site-icon-tab" : undefined} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <Close className="size-3 shrink-0 opacity-60" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tela inicial do celular com o atalho do site entre outros apps. */
function PhoneScreen({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="rounded-[1.4rem] border border-line-strong bg-[radial-gradient(circle_at_20%_0%,#3b0a55_0%,transparent_55%),radial-gradient(circle_at_90%_100%,#5a0710_0%,transparent_60%),#0c0a12] p-4">
      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <PopIcon src={icon} className="size-12 rounded-[0.8rem] shadow-[0_6px_18px_-6px_rgb(0_0_0/0.9)]" />
          <span className="w-full truncate text-center text-[0.6rem] leading-none text-white">{title}</span>
        </div>
        {[0, 1, 2].map((slot) => (
          <div key={slot} className="flex flex-col items-center gap-1.5" aria-hidden>
            <span className="size-12 rounded-[0.8rem] bg-white/10" />
            <span className="h-1.5 w-8 rounded-full bg-white/15" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ícone do site: aba do navegador, tela do celular e marca ao lado do nome da festa. */
export function SiteIconField({ custom, eventName }: { custom: boolean; eventName: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const tabIcon = useSiteIconUrl(32);
  const phoneIcon = useSiteIconUrl(180);
  const busy = progress !== null || refreshing;

  function refresh() {
    // A prévia local some junto com a chegada do ícone novo (mesma transição).
    startRefresh(() => {
      setPreview(null);
      router.refresh();
    });
  }

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/") || file.type.includes("svg")) {
      toast.error("Escolha uma imagem em JPG, PNG ou WEBP.");
      return;
    }
    setProgress(0);
    playSound("blip");
    const blob = await shrinkImage(file, MAX_SIDE);
    const localUrl = URL.createObjectURL(blob);
    setPreview(localUrl);
    const data = new FormData();
    data.append("icon", blob, blob === file ? file.name : "icone.jpg");
    const result = await uploadWithProgress<{ square: boolean }>("/api/icone", data, setProgress, {
      fallbackError: "Não foi possível salvar o ícone. Tente de novo.",
    });
    if (input.current) input.current.value = "";
    setProgress(null);
    if (!result.ok) {
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      playSound("error");
      toast.error(result.error);
      return;
    }
    playSound("powerup");
    toast.success("Ícone do site trocado.", {
      description: result.body.square ? undefined : "A imagem não era quadrada: entrou inteira, com bordas pretas.",
    });
    refresh();
  }

  const lit = Math.round(((progress ?? 0) / 100) * SEGMENTS);
  return (
    <div className="space-y-5">
      <div className="relative">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <MockLabel>Aba do navegador</MockLabel>
            <BrowserTabs icon={preview ?? tabIcon} title={eventName} />
          </div>
          <div>
            <MockLabel>Tela do celular (atalho do site)</MockLabel>
            <PhoneScreen icon={preview ?? phoneIcon} title={eventName} />
          </div>
        </div>
        {progress !== null ? (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-ink/80 px-6 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
          >
            <p className="pixel text-[0.6rem] text-fg">
              Enviando <span className="tabular">{progress}%</span>
            </p>
            <div className="flex w-full max-w-60 gap-[3px]" aria-hidden>
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className={i < lit ? "h-3 flex-1 rounded-[1px] bg-success shadow-[0_0_6px_var(--success)]" : "h-3 flex-1 rounded-[1px] bg-surface-3"}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <MockLabel>Topo do site e do painel</MockLabel>
        <div className="rounded-xl border border-line bg-ink/70 px-3 py-3">
          <BrandLockup name={eventName} kicker="SINDSERM" />
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0])}
        data-testid="site-icon-input"
        aria-label="Escolher imagem do ícone"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy} data-testid="site-icon-upload">
          <Upload /> Trocar ícone
        </Button>
        {custom ? (
          <ConfirmActionDialog
            trigger={
              <Button type="button" variant="ghost" disabled={busy} data-testid="site-icon-reset">
                <Undo /> Voltar ao emblema da festa
              </Button>
            }
            title="Voltar ao emblema da festa?"
            description="O ícone enviado sai da aba do navegador, da tela do celular e do topo do site e do painel."
            confirmLabel="Voltar ao emblema"
            onConfirm={() => removeSiteIconAction()}
            successMessage="Ícone voltou a ser o emblema da festa."
            onDone={refresh}
          />
        ) : (
          <span className="rounded-md border border-line px-2.5 py-1 text-xs text-fg-muted" data-testid="site-icon-default">
            Usando o emblema da festa
          </span>
        )}
      </div>
      <p className="text-xs text-fg-dim">
        Melhor com imagem quadrada, de 512 × 512 px ou mais. Se não for quadrada, ela entra inteira, centralizada com fundo preto. Em
        celulares que já tinham o site na tela inicial, o ícone novo pode demorar a aparecer.
      </p>
    </div>
  );
}
