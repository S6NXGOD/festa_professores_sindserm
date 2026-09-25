"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Camera, Check, Download, Trophy, Whatsapp } from "@/components/icons/pixel";
import { PixelTag } from "@/components/retro/bits";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/clipboard";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export interface MissionVoucher {
  personId: string;
  token: string;
  fullName: string;
  kind: "MEMBER" | "GUEST";
}

const EVENT = "festa:missao";
const storageKey = (id: string) => `festa:missao:${id}`;

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

/**
 * "Missão bônus" depois da inscrição: salvar os vouchers no celular e mandar
 * o do convidado. Cada tarefa feita marca o check (com som de moeda); o
 * progresso fica lembrado neste aparelho.
 */
export function SaveVouchersMission({
  vouchers,
  missionId,
  eventName,
}: {
  vouchers: MissionVoucher[];
  missionId: string;
  eventName: string;
}) {
  const stored = useSyncExternalStore(
    subscribe,
    () => readDone(missionId),
    () => "[]",
  );
  // Vale também sem armazenamento (navegação anônima): o que foi feito nesta visita.
  const [session, setSession] = useState<string[]>([]);
  const done = useMemo(() => new Set([...parse(stored), ...session]), [stored, session]);
  const complete = vouchers.every((voucher) => done.has(voucher.personId));

  function mark(personId: string) {
    if (done.has(personId)) {
      playSound("blip");
      return;
    }
    const next = [...done, personId];
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
        colors: ["#ff2626", "#e3000f", "#ffffff", "#22c55e"],
        shapes: ["square"],
        ticks: 160,
        flat: true,
      });
    }
  }

  function sendToGuest(voucher: MissionVoucher) {
    const first = voucher.fullName.split(" ")[0];
    const url = `${window.location.origin}/v/${voucher.token}`;
    const text = `Oi, ${first}! Este é o seu voucher da ${eventName}. Mostre o QR Code na entrada: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    mark(voucher.personId);
  }

  return (
    <section
      className={cn(
        "no-print rounded-2xl border-2 p-4 sm:p-5",
        complete ? "border-success/50 bg-success-soft" : "border-red/50 bg-[linear-gradient(135deg,rgb(227_0_15/0.18),rgb(8_8_8/0.6))]",
      )}
      aria-labelledby="mission-title"
      data-testid="save-mission"
    >
      <div className="flex items-center justify-between gap-3">
        <PixelTag tone={complete ? "success" : "red"}>{complete ? "Missão cumprida" : "Missão bônus"}</PixelTag>
        <span className="pixel text-[0.6rem] text-fg-muted tabular">
          {vouchers.filter((voucher) => done.has(voucher.personId)).length}/{vouchers.length}
        </span>
      </div>
      <h2 id="mission-title" className="display mt-3 text-2xl text-fg sm:text-3xl">
        {complete ? "Vouchers salvos. É só curtir a festa!" : "Agora salve os vouchers no celular"}
      </h2>

      <ul className="mt-4 space-y-2">
        {vouchers.map((voucher) => {
          const checked = done.has(voucher.personId);
          const first = voucher.fullName.split(" ")[0];
          const isGuest = voucher.kind === "GUEST";
          return (
            <li
              key={voucher.personId}
              className={cn("rounded-xl border bg-ink/60 p-3", checked ? "border-success/40" : "border-line-strong")}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                    checked ? "border-success bg-success text-success-foreground" : "border-line-strong text-transparent",
                  )}
                  aria-hidden
                >
                  <AnimatePresence initial={false}>
                    {checked ? (
                      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} className="inline-flex">
                        <Check className="size-5" />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
                <span className={cn("min-w-0 flex-1 text-sm font-semibold", checked ? "text-fg-muted line-through" : "text-fg")}>
                  {isGuest ? `Mandar o voucher de ${first}` : "Baixar o meu voucher"}
                  <span className="sr-only">{checked ? " (feito)" : ""}</span>
                </span>
              </div>
              {/* Botões embaixo da tarefa: no celular, o texto não fica espremido. */}
              <div className="mt-3 flex gap-2 pl-11">
                {isGuest ? (
                  <Button type="button" size="sm" variant="success" className="flex-1 sm:flex-none" onClick={() => sendToGuest(voucher)}>
                    <Whatsapp /> WhatsApp
                  </Button>
                ) : null}
                <Button asChild size="sm" variant={isGuest ? "outline" : "default"} className="flex-1 sm:flex-none">
                  <a
                    href={`/v/${voucher.token}/imagem`}
                    download={`voucher-${slugify(voucher.fullName)}.png`}
                    onClick={() => mark(voucher.personId)}
                    data-testid={`mission-download-${voucher.kind.toLowerCase()}`}
                  >
                    <Download /> {isGuest ? "Baixar" : "Baixar imagem"}
                  </a>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
        <Camera className="mt-0.5 size-4 shrink-0 text-red" />
        <span>
          <strong className="text-fg">Sem tempo?</strong> Tire um print do QR Code de cada pessoa (logo abaixo). O print
          também vale na entrada.
        </span>
      </p>
      {complete ? (
        <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-success-text">
          <Trophy className="size-4" /> Mostre o QR Code de cada pessoa na entrada da festa.
        </p>
      ) : null}
    </section>
  );
}
