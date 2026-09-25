"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { QrCode, Search } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/call-action";
import { vibrate } from "@/lib/haptics";
import { scrollToTop } from "@/lib/scroll";
import { playSound } from "@/lib/sound";
import { confirmEntryAction } from "@/server/actions/gate";
import type { EntryKitResult } from "@/server/services/checkin";
import type { GateView } from "@/server/services/gate-view";
import { Disclosure } from "./disclosure";
import { EarlyEntryDialog } from "./early-entry-dialog";
import { EntryPromptDialog } from "./entry-prompt";
import { canConfirmEntry, ConfirmEntryButton, deliveredKitCount, GateResult } from "./gate-result";
import { PersonOperations } from "./person-operations";

/** Tela da pessoa na portaria: status da entrada + ações do atendimento. */
export function GatePersonClient({
  view,
  personBasePath,
  promptEntryOnLoad = false,
}: {
  view: GateView;
  personBasePath: string;
  /** Abre direto a pergunta "registrar a entrada?" (ex.: vindo da ficha assinada). */
  promptEntryOnLoad?: boolean;
}) {
  const router = useRouter();
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [entryKit, setEntryKit] = useState<EntryKitResult | null>(null);
  const [entryGuestKit, setEntryGuestKit] = useState<EntryKitResult | null>(null);
  const [promptEntry, setPromptEntry] = useState(promptEntryOnLoad);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [confirming, startConfirm] = useTransition();
  // Na portaria: decisão rápida (botão na barra fixa, detalhes recolhidos) e,
  // depois de confirmar a filiação, já pergunta pela entrada.
  const atGate = personBasePath.startsWith("/portaria");

  /** Antes do horário de início, pede a confirmação a mais (`early`). */
  function confirmEntry(early = false) {
    setPromptEntry(false);
    if (!early && !view.eventStart.started) {
      playSound("warn");
      setEarlyOpen(true);
      return;
    }
    startConfirm(async () => {
      const result = await callAction(confirmEntryAction({ personId: view.personId, method: "SEARCH", early }));
      setEarlyOpen(false);
      if (!result.ok) {
        if (result.code === "EVENT_NOT_STARTED") {
          playSound("warn");
          setEarlyOpen(true);
          return;
        }
        playSound("error");
        toast.error(result.error);
        return;
      }
      const entered = result.data.outcome === "CHECKED_IN";
      const kits = deliveredKitCount(result.data.kit, result.data.guestKit);
      vibrate(entered ? [40, 40, 120] : [80, 60, 80]);
      playSound(entered ? (kits === 2 ? "fanfare" : kits === 1 ? "powerup" : "coin") : "warn");
      setJustCheckedIn(entered);
      setEntryKit(result.data.kit);
      setEntryGuestKit(result.data.guestKit);
      if (!entered) toast.warning("Esta entrada já havia sido registrada.");
      // O resultado (entrada + kit) aparece no topo, mesmo quando a confirmação veio do aviso.
      scrollToTop();
      router.refresh();
    });
  }

  const operations = (
    <PersonOperations
      view={view}
      personBasePath={personBasePath}
      onChanged={() => router.refresh()}
      onEntryUnlocked={atGate ? () => setPromptEntry(true) : undefined}
    />
  );
  const deciding = canConfirmEntry(view) && !justCheckedIn;

  return (
    <div className={atGate ? "space-y-4 pb-28" : "space-y-4"}>
      <GateResult
        view={view}
        justCheckedIn={justCheckedIn}
        entryKit={entryKit}
        entryGuestKit={entryGuestKit}
        confirming={confirming}
        onConfirm={atGate ? undefined : () => confirmEntry()}
        mode={atGate ? "gate" : "panel"}
      />
      {atGate && (view.entry.kind === "ALLOWED" || justCheckedIn) ? (
        <Disclosure variant="plain" title="Mais ações do atendimento" hint="Convidado, kits e cadastro" testId="gate-more-actions">
          {operations}
        </Disclosure>
      ) : (
        operations
      )}
      {atGate ? (
        // Portaria no celular: a ação da vez fica fixa no pé da tela, sem precisar rolar.
        <div className="safe-bottom no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 px-3 pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-2">
            {deciding ? (
              <ConfirmEntryButton view={view} confirming={confirming} onConfirm={() => confirmEntry()} className="min-w-0 flex-1" />
            ) : (
              <>
                <Button asChild size="xl" className="min-w-0 flex-1 text-lg" data-testid="gate-next-search">
                  <Link href="/portaria">
                    <Search /> Próxima pessoa
                  </Link>
                </Button>
                <Button asChild variant="outline" size="xl" className="shrink-0 text-base">
                  <Link href="/portaria/scanner" aria-label="Abrir o leitor de QR Code">
                    <QrCode /> Ler QR
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
      <EntryPromptDialog
        view={view}
        open={promptEntry && view.entry.kind === "ALLOWED" && view.permissions.checkIn && !confirming}
        onConfirm={() => confirmEntry()}
        onClose={() => setPromptEntry(false)}
      />
      <EarlyEntryDialog
        open={earlyOpen}
        name={view.fullName}
        startLabel={view.eventStart.label}
        startAt={view.eventStart.at}
        pending={confirming}
        onConfirm={() => confirmEntry(true)}
        onCancel={() => setEarlyOpen(false)}
      />
    </div>
  );
}
