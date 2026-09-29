"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Close, Sparkles } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { REGISTRATION_ORIGIN_LABEL } from "@/domain/labels";
import type { AffiliationStatus, RegistrationOrigin } from "@/domain/types";
import { playSound } from "@/lib/sound";
import { properName } from "@/lib/text";

/*
 * Radar do painel: a cada inscrição nova (pelo site, ficha ou na hora por outra
 * pessoa da equipe), toca o level up, mostra quem chegou e atualiza os números.
 * Com a aba em segundo plano, o título da aba conta as novidades: "(2) ...".
 */

interface RadarItem {
  registrationId: string;
  personId: string;
  fullName: string;
  guestName: string | null;
  status: AffiliationStatus;
  origin: RegistrationOrigin;
  isTeacher: boolean;
  createdAt: string;
}

interface RadarResponse {
  now: string;
  items: RadarItem[];
  pending: number;
  registrations: number;
  today: number;
}

/** De quanto em quanto tempo o painel pergunta (a aba escondida o navegador desacelera sozinho). */
const POLL_MS = 15_000;
/** Quanto tempo cada aviso fica na tela. */
const NOTICE_MS = 9_000;

interface Notice {
  id: number;
  items: RadarItem[];
  registrations: number;
  today: number;
}

const STATUS_SHORT: Record<AffiliationStatus, string> = {
  PENDING: "para conferir",
  AWAITING_SIGNATURE: "ficha: assina na festa",
  CONFIRMED: "confirmada",
  REJECTED: "não confirmada",
  JOINED_AT_EVENT: "assinou a ficha",
};

function RadarToast({
  items,
  registrations,
  today,
  canOpenPeople,
  onClose,
}: {
  items: RadarItem[];
  registrations: number;
  today: number;
  canOpenPeople: boolean;
  onClose: () => void;
}) {
  const single = items.length === 1 ? items[0]! : null;
  const toCheck = items.some((item) => item.status === "PENDING");
  const href =
    single && canOpenPeople ? `/painel/participantes/${single.personId}` : toCheck ? "/painel/inscricoes?filtro=conferir" : "/painel/inscricoes?filtro=todas";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.85, y: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
      className="pointer-events-auto w-full overflow-hidden rounded-xl border-2 border-warning/70 bg-surface-2 text-fg shadow-[0_18px_40px_-14px_rgb(0_0_0/0.9),0_0_30px_-10px_rgb(248_192_0/0.6)]"
      data-testid="new-registration-toast"
    >
      <div className="flex items-center gap-2 bg-warning px-3 py-1.5 text-warning-foreground">
        <motion.span initial={{ rotate: -30, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 10 }}>
          <Sparkles className="size-4" />
        </motion.span>
        <span className="pixel text-[0.6rem]">
          LEVEL UP! +{items.length} {items.length === 1 ? "INSCRIÇÃO" : "INSCRIÇÕES"}
        </span>
        <button type="button" onClick={onClose} className="ml-auto rounded p-0.5 hover:bg-black/15" aria-label="Fechar aviso">
          <Close className="size-4" />
        </button>
      </div>
      <div className="p-3">
        <ul className="grid gap-1.5">
          {items.slice(0, 3).map((item) => (
            <li key={item.registrationId} className="leading-tight">
              <span className="font-bold">{properName(item.fullName)}</span>
              {item.guestName ? <span className="text-fg-muted"> + {properName(item.guestName)}</span> : null}
              <span className="block text-xs text-fg-muted">
                {REGISTRATION_ORIGIN_LABEL[item.origin]} · {STATUS_SHORT[item.status]}
                {item.isTeacher ? "" : " · sem kit"}
              </span>
            </li>
          ))}
        </ul>
        {items.length > 3 ? <p className="mt-1 text-xs font-semibold text-fg-muted">e mais {items.length - 3}</p> : null}
        {/* Barra de "experiência" enchendo: é o level up da festa. */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="pixel text-[0.45rem] text-warning">XP</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-[2px] bg-line-strong">
            <motion.span className="block h-full bg-warning" initial={{ width: "8%" }} animate={{ width: "100%" }} transition={{ duration: 0.9, ease: "easeOut" }} />
          </span>
          <span className="text-[0.7rem] font-semibold text-fg-muted tabular">
            nº {registrations} · hoje {today}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm" onClick={onClose}>
            <Link href={href} data-testid="new-registration-open">
              {toCheck ? "Conferir" : "Ver"}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Depois
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function RegistrationRadar({ since, canOpenPeople }: { since: string; canOpenPeople: boolean }) {
  const router = useRouter();
  const cursor = useRef(since);
  // A primeira consulta (logo ao abrir) só anota o que já existia: novidade é o que vem depois.
  // Compara por id, não por horário: o relógio do banco e o do servidor podem diferir alguns segundos.
  const baseline = useRef(true);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const unseen = useRef(0);
  const needsRefresh = useRef(false);
  const baseTitle = useRef<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setNotices((list) => list.filter((notice) => notice.id !== id)), []);

  const announce = useCallback(
    (items: RadarItem[], data: RadarResponse) => {
      playSound("levelup");
      const id = nextId.current++;
      // No máximo 3 avisos empilhados: o mais novo por cima.
      setNotices((list) => [{ id, items, registrations: data.registrations, today: data.today }, ...list].slice(0, 3));
      window.setTimeout(() => dismiss(id), NOTICE_MS);
      if (document.visibilityState === "visible") {
        router.refresh();
      } else {
        // Aba escondida: conta no título e atualiza a tela quando a pessoa voltar.
        needsRefresh.current = true;
        unseen.current += items.length;
        baseTitle.current ??= document.title;
        document.title = `(${unseen.current}) ${baseTitle.current}`;
      }
    },
    [dismiss, router],
  );

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch(`/painel/novidades?desde=${encodeURIComponent(cursor.current)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as RadarResponse;
      cursor.current = data.now;
      const fresh = baseline.current ? [] : data.items.filter((item) => !seen.current.has(item.registrationId)).reverse();
      baseline.current = false;
      for (const item of data.items) seen.current.add(item.registrationId);
      if (fresh.length) announce(fresh, data);
    } catch {
      // sem rede: tenta de novo na próxima volta
    } finally {
      busy.current = false;
    }
  }, [announce]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (baseTitle.current) {
        document.title = baseTitle.current;
        baseTitle.current = null;
      }
      unseen.current = 0;
      if (needsRefresh.current) {
        needsRefresh.current = false;
        router.refresh();
      }
      void poll();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll, router]);

  return (
    <div
      className="pointer-events-none fixed inset-x-3 top-3 z-[60] grid gap-2 sm:inset-x-auto sm:top-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {notices.map((notice) => (
          <RadarToast
            key={notice.id}
            items={notice.items}
            registrations={notice.registrations}
            today={notice.today}
            canOpenPeople={canOpenPeople}
            onClose={() => dismiss(notice.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
