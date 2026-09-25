"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { callAction } from "@/lib/call-action";
import { vibrate } from "@/lib/haptics";
import { scrollToTop } from "@/lib/scroll";
import { playSound } from "@/lib/sound";
import { confirmEntryAction } from "@/server/actions/gate";
import type { EntryKitResult } from "@/server/services/checkin";
import type { GateView } from "@/server/services/gate-view";
import { EarlyEntryDialog } from "./early-entry-dialog";
import { EntryPromptDialog } from "./entry-prompt";
import { deliveredKitCount, GateResult } from "./gate-result";
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
  // Na portaria, depois de confirmar a filiação, já pergunta pela entrada.
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

  return (
    <div className="space-y-4">
      <GateResult
        view={view}
        justCheckedIn={justCheckedIn}
        entryKit={entryKit}
        entryGuestKit={entryGuestKit}
        confirming={confirming}
        onConfirm={() => confirmEntry()}
      />
      <PersonOperations
        view={view}
        personBasePath={personBasePath}
        onChanged={() => router.refresh()}
        onEntryUnlocked={atGate ? () => setPromptEntry(true) : undefined}
      />
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
