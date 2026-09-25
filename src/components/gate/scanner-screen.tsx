"use client";

import type { IScannerControls } from "@zxing/browser";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Cancel,
  Keyboard,
  Lightbulb,
  LightbulbOff,
  Loader,
  QrCode,
  Repeat,
  Search,
  User,
  Volume,
  VolumeOff,
  Warning,
} from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAction } from "@/lib/call-action";
import { formatDateTime } from "@/lib/datetime";
import { vibrate } from "@/lib/haptics";
import { scrollToTop } from "@/lib/scroll";
import { setAutoNext, useAutoNext } from "@/lib/gate-prefs";
import { playSound, setSoundEnabled, useSoundEnabled } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { confirmEntryAction, gateViewAction, type LookupResult, lookupCodeAction, scanQrAction } from "@/server/actions/gate";
import type { GateView } from "@/server/services/gate-view";
import type { EntryKitResult } from "@/server/services/checkin";
import { EarlyEntryDialog } from "./early-entry-dialog";
import { EntryPromptDialog } from "./entry-prompt";
import { Disclosure } from "./disclosure";
import { canConfirmEntry, ConfirmEntryButton, deliveredKitCount, GateResult } from "./gate-result";
import { PersonOperations } from "./person-operations";

type CameraState = "starting" | "scanning" | "error";

/** Depois de uma entrada confirmada, o leitor reabre sozinho neste tempo (um toque na tela segura). */
const AUTO_NEXT_MS = 6000;
type Feedback = "idle" | "read" | "invalid";

interface Current {
  view: GateView;
  voucherId: string | null;
  method: "QR" | "CODE";
  justCheckedIn: boolean;
  /** O que aconteceu com o kit na entrada que acabou de ser confirmada. */
  entryKit?: EntryKitResult | null;
  /** Na chegada do(a) professor(a): o kit do convidado que já tinha entrado. */
  entryGuestKit?: EntryKitResult | null;
}

/** "Volta ao leitor em 5 s": a contagem da volta automática, segundo a segundo. */
function AutoNextHint({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = window.setInterval(() => setLeft((value) => Math.max(1, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p className="pixel mx-auto mb-2 max-w-2xl text-center text-[0.5rem] text-fg-muted" data-testid="auto-next-hint" aria-live="polite">
      Volta ao leitor em <span className="text-fg tabular">{left}</span> s · toque na tela para ficar aqui
    </p>
  );
}

function cameraErrorMessage(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "A câmera só funciona em conexão segura (HTTPS). Use a busca por nome, CPF ou código.";
  }
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "Permissão da câmera negada. Libere o acesso nas configurações do navegador.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nenhuma câmera disponível neste aparelho.";
  if (name === "NotReadableError") return "A câmera está em uso por outro aplicativo.";
  return "Não foi possível abrir a câmera.";
}

export function ScannerScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const [camera, setCamera] = useState<CameraState>("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const [current, setCurrent] = useState<Current | null>(null);
  const [entryPrompt, setEntryPrompt] = useState(false);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [problem, setProblem] = useState<{ title: string; detail: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [combo, setCombo] = useState(0);
  const [confirming, startConfirm] = useTransition();
  /** Quando o leitor reabre sozinho (null = parado). */
  const [autoNextAt, setAutoNextAt] = useState<number | null>(null);
  const soundOn = useSoundEnabled();
  const autoNextOn = useAutoNext();

  const showLookup = useCallback((result: LookupResult, method: "QR" | "CODE") => {
    if (result.kind === "FOUND") {
      setFeedback("read");
      playSound("blip");
      vibrate(60);
      setCurrent({ view: result.view, voucherId: result.voucherId, method, justCheckedIn: false });
      return;
    }
    setFeedback("invalid");
    playSound("error");
    vibrate([80, 60, 80]);
    if (result.kind === "REVOKED") {
      setProblem({ title: "QR CODE CANCELADO", detail: `Este voucher foi cancelado em ${formatDateTime(result.revokedAt)}. Localize a pessoa pela busca.` });
    } else if (result.kind === "NOT_FOUND") {
      setProblem({ title: "VOUCHER NÃO ENCONTRADO", detail: "Este QR/código não pertence a nenhuma inscrição. Use a busca por nome ou CPF." });
    } else {
      setProblem({ title: "QR CODE NÃO RECONHECIDO", detail: "Não é um voucher desta festa. Peça o QR do voucher ou busque por nome/CPF." });
    }
  }, []);

  const handleText = useCallback(
    async (text: string) => {
      const now = Date.now();
      // Evita reler o mesmo QR logo após voltar ao leitor.
      if (lastRef.current.text === text && now - lastRef.current.at < 3000) return;
      lastRef.current = { text, at: now };
      busyRef.current = true;
      setLookingUp(true);
      const result = await callAction(scanQrAction(text));
      setLookingUp(false);
      if (!result.ok) {
        toast.error(result.error);
        busyRef.current = false;
        return;
      }
      showLookup(result.data, "QR");
    },
    [showLookup],
  );

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setCamera("starting");
      setCameraError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: "SecurityError" });
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 700 });
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current!,
          (result) => {
            if (result && !busyRef.current) void handleText(result.getText());
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setTorchAvailable(typeof controls.switchTorch === "function");
        setCamera("scanning");
      } catch (error) {
        if (cancelled) return;
        setCamera("error");
        setCameraError(cameraErrorMessage(error));
      }
    }
    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [facing, handleText]);

  const resume = useCallback(() => {
    setAutoNextAt(null);
    setEntryPrompt(false);
    setCurrent(null);
    setProblem(null);
    setFeedback("idle");
    busyRef.current = false;
    lastRef.current = { text: lastRef.current.text, at: Date.now() };
  }, []);

  useEffect(() => {
    if (autoNextAt === null) return;
    const timer = window.setTimeout(resume, Math.max(0, autoNextAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [autoNextAt, resume]);

  /** Qualquer toque no resultado segura a tela (para ler com calma ou fazer outra coisa). */
  function holdResult() {
    if (autoNextAt !== null) setAutoNextAt(null);
  }

  function toggleAutoNext() {
    const next = !autoNextOn;
    setAutoNext(next);
    playSound(next ? "coin" : "blip");
    toast.success(
      next ? "Volta automática ligada" : "Volta automática desligada",
      { description: next ? "Depois de confirmar a entrada, o leitor reabre sozinho." : "Depois de confirmar, toque em Ler próximo." },
    );
  }

  async function toggleTorch() {
    try {
      await controlsRef.current?.switchTorch?.(!torchOn);
      setTorchOn((v) => !v);
    } catch {
      toast.error("Lanterna indisponível neste aparelho.");
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    busyRef.current = true;
    setLookingUp(true);
    const result = await callAction(lookupCodeAction(code));
    setLookingUp(false);
    if (!result.ok) {
      toast.error(result.error);
      busyRef.current = false;
      return;
    }
    setCodeOpen(false);
    setCode("");
    showLookup(result.data, "CODE");
  }

  /** Antes do horário de início, pede a confirmação a mais (`early`). */
  function confirmEntry(early = false) {
    if (!current) return;
    setEntryPrompt(false);
    if (!early && !current.view.eventStart.started) {
      playSound("warn");
      setEarlyOpen(true);
      return;
    }
    startConfirm(async () => {
      const result = await callAction(
        confirmEntryAction({
          personId: current.view.personId,
          method: current.method,
          voucherId: current.voucherId,
          early,
        }),
      );
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
      if (entered) setCombo((c) => c + 1);
      if (entered && autoNextOn) setAutoNextAt(Date.now() + AUTO_NEXT_MS);
      setCurrent({
        ...current,
        view: result.data.view,
        justCheckedIn: entered,
        entryKit: result.data.kit,
        entryGuestKit: result.data.guestKit,
      });
      // O resultado (entrada + kit) fica no topo do painel.
      scrollToTop(resultRef.current);
    });
  }

  async function refreshCurrent() {
    if (!current) return;
    const result = await callAction(gateViewAction(current.view.personId));
    if (result.ok) setCurrent({ ...current, view: result.data });
  }

  const overlayOpen = Boolean(current || problem);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink text-fg">
      <header className="safe-top relative z-20 flex items-center justify-between gap-2 border-b border-line bg-ink/80 px-3 pt-3 pb-2 backdrop-blur">
        <Button asChild variant="ghost">
          <Link href="/portaria">
            <ArrowLeft /> Voltar
          </Link>
        </Button>
        <div className="flex flex-col items-center leading-none">
          <span className="pixel text-[0.5rem] text-red">Leitor</span>
          {combo > 0 ? (
            <motion.span key={combo} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="pixel mt-1 text-[0.55rem] text-fg" data-testid="scanner-combo">
              {`COMBO x${combo}`}
            </motion.span>
          ) : null}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleAutoNext}
            aria-pressed={autoNextOn}
            aria-label={autoNextOn ? "Desligar a volta automática ao leitor" : "Ligar a volta automática ao leitor"}
            title="Volta automática ao leitor depois de confirmar"
            data-testid="scanner-auto"
          >
            <span className={cn("pixel text-[0.5rem]", autoNextOn ? "text-fg" : "text-fg-dim line-through")}>Auto</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSoundEnabled(!soundOn);
              if (!soundOn) playSound("coin");
            }}
            aria-label={soundOn ? "Desligar sons 8-bit" : "Ligar sons 8-bit"}
          >
            {soundOn ? <Volume /> : <VolumeOff />}
          </Button>
          {torchAvailable ? (
            <Button variant="ghost" size="icon" onClick={toggleTorch} aria-label="Lanterna">
              {torchOn ? <LightbulbOff /> : <Lightbulb />}
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Trocar câmera">
            <Repeat />
          </Button>
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay />
        <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "relative aspect-square w-[72vw] max-w-[320px] rounded-2xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)] transition-[box-shadow] duration-200",
              feedback === "read" && "shadow-[0_0_0_100vmax_rgba(0,0,0,0.6),0_0_0_6px_var(--success),0_0_40px_var(--success)]",
              feedback === "invalid" && "shadow-[0_0_0_100vmax_rgba(0,0,0,0.6),0_0_0_6px_var(--danger),0_0_40px_var(--danger)]",
            )}
            style={{ ["--scan-size" as string]: "min(72vw, 320px)" }}
          >
            {/* cantos do visor */}
            {["top-0 left-0 border-t-4 border-l-4", "top-0 right-0 border-t-4 border-r-4", "bottom-0 left-0 border-b-4 border-l-4", "right-0 bottom-0 border-r-4 border-b-4"].map((corner) => (
              <span key={corner} className={cn("absolute size-10 border-red drop-shadow-[0_0_8px_var(--red)]", corner)} aria-hidden />
            ))}
            {camera === "scanning" && !overlayOpen ? (
              <span className="animate-scan-beam absolute inset-x-3 top-0 h-1 rounded-full bg-red shadow-[0_0_24px_6px_var(--red)]" />
            ) : null}
            {lookingUp ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                <Loader className="size-10 animate-spin-steps text-white" />
              </span>
            ) : null}
          </div>
        </div>

        {camera === "starting" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-fg-muted">
            <Camera className="size-9 animate-pulse text-red" />
            <p className="pixel text-[0.55rem]">
              Ligando a câmera<span className="animate-blink">_</span>
            </p>
          </div>
        ) : null}
        {camera === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink px-8 text-center">
            <Warning className="size-12 text-warning" />
            <p className="max-w-xs text-base font-semibold text-fg">{cameraError}</p>
            <Button asChild size="lg">
              <Link href="/portaria">
                <Search /> Buscar por nome ou CPF
              </Link>
            </Button>
          </div>
        ) : null}

        <p className="pixel absolute inset-x-0 bottom-28 text-center text-[0.55rem] text-fg">
          {camera === "scanning" ? "Aponte para o QR Code do voucher" : ""}
        </p>
      </div>

      <footer className="safe-bottom relative z-20 grid grid-cols-2 gap-2 border-t border-line bg-ink px-3 pt-3">
        <Button asChild variant="secondary" size="lg">
          <Link href="/portaria">
            <Search /> Buscar nome/CPF
          </Link>
        </Button>
        <Button variant="secondary" size="lg" onClick={() => setCodeOpen(true)}>
          <Keyboard /> Digitar código
        </Button>
      </footer>

      <AnimatePresence>
        {codeOpen ? (
          <motion.form
            key="code"
            onSubmit={submitCode}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="safe-bottom absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border-t-2 border-red/60 bg-surface-2 p-5 shadow-2xl"
          >
            <p className="display text-2xl text-fg">Código do voucher</p>
            <p className="text-sm text-fg-muted">Os 8 caracteres embaixo do QR Code (ex.: K7F3-9QXA).</p>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="pixel mt-4 h-14 text-center text-lg tracking-[0.25em]"
              maxLength={9}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="lg" onClick={() => setCodeOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="lg" disabled={lookingUp}>
                {lookingUp ? <Loader className="animate-spin-steps" /> : <Search />} Buscar
              </Button>
            </div>
          </motion.form>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {overlayOpen ? (
          <motion.div
            key="result"
            ref={resultRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            className="absolute inset-0 z-40 overflow-y-auto overscroll-contain bg-ink"
            onPointerDownCapture={holdResult}
            onKeyDownCapture={holdResult}
          >
            <div className="mx-auto max-w-2xl space-y-4 px-3 pt-3 pb-44">
              {current ? (
                <>
                  <GateResult
                    view={current.view}
                    justCheckedIn={current.justCheckedIn}
                    entryKit={current.entryKit}
                    entryGuestKit={current.entryGuestKit}
                    mode="gate"
                    hintClassName="z-50 bottom-32"
                  />
                  {current.view.permissions.deliverKits ? (
                    // Liberado (ou acabou de entrar): as outras ações ficam a um toque, sem empurrar o botão de entrada.
                    current.view.entry.kind === "ALLOWED" || current.justCheckedIn ? (
                      <Disclosure
                        variant="plain"
                        title="Mais ações do atendimento"
                        hint="Convidado, kits e cadastro"
                        testId="gate-more-actions"
                      >
                        <PersonOperations
                          view={current.view}
                          personBasePath="/portaria/pessoa"
                          onChanged={refreshCurrent}
                          onEntryUnlocked={() => setEntryPrompt(true)}
                        />
                      </Disclosure>
                    ) : (
                      <PersonOperations
                        view={current.view}
                        personBasePath="/portaria/pessoa"
                        onChanged={refreshCurrent}
                        onEntryUnlocked={() => setEntryPrompt(true)}
                      />
                    )
                  ) : null}
                  <EntryPromptDialog
                    view={current.view}
                    open={entryPrompt && current.view.entry.kind === "ALLOWED" && current.view.permissions.checkIn && !confirming}
                    onConfirm={() => confirmEntry()}
                    onClose={() => setEntryPrompt(false)}
                  />
                  <EarlyEntryDialog
                    open={earlyOpen}
                    name={current.view.fullName}
                    startLabel={current.view.eventStart.label}
                    startAt={current.view.eventStart.at}
                    pending={confirming}
                    onConfirm={() => confirmEntry(true)}
                    onCancel={() => setEarlyOpen(false)}
                  />
                </>
              ) : problem ? (
                <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface" role="alert">
                  <div className="hazard bg-danger px-5 py-6 text-white">
                    <div className="flex items-center gap-4">
                      <span className="inline-flex size-14 items-center justify-center rounded-xl bg-black/20">
                        {problem.title.includes("CANCELADO") ? <Cancel className="size-9" /> : <Warning className="size-9" />}
                      </span>
                      <div>
                        <p className="pixel text-[0.55rem] opacity-80">Game over</p>
                        <p className="display mt-1 text-3xl leading-none" data-testid="gate-status-title">
                          {problem.title}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-bold">{problem.detail}</p>
                  </div>
                  <div className="p-5">
                    <Button asChild variant="outline" size="lg" className="w-full">
                      <Link href="/portaria">
                        <User /> Buscar pessoa manualmente
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            {/* A ação da vez fica sempre à vista, no polegar: confirmar a entrada ou ler o próximo. */}
            <div className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 px-3 pt-3 backdrop-blur">
              {autoNextAt !== null ? <AutoNextHint key={autoNextAt} seconds={AUTO_NEXT_MS / 1000} /> : null}
              <div className="mx-auto flex max-w-2xl gap-2">
                {current && canConfirmEntry(current.view) && !current.justCheckedIn ? (
                  <>
                    <ConfirmEntryButton view={current.view} confirming={confirming} onConfirm={() => confirmEntry()} className="min-w-0 flex-1" />
                    <Button
                      variant="outline"
                      size="xl"
                      onClick={resume}
                      className="h-auto min-h-16 w-[4.5rem] shrink-0 flex-col gap-1.5 px-0"
                      aria-label="Pular: ler outro QR sem registrar esta entrada"
                      data-testid="scan-skip"
                    >
                      <QrCode className="size-6" />
                      <span className="pixel text-[0.5rem]">Pular</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={resume} size="xl" className="relative min-w-0 flex-1 overflow-hidden" data-testid="scan-next">
                      {autoNextAt !== null ? (
                        <motion.span
                          key={autoNextAt}
                          aria-hidden
                          className="absolute inset-0 origin-left bg-white/25"
                          initial={{ scaleX: 1 }}
                          animate={{ scaleX: 0 }}
                          transition={{ duration: AUTO_NEXT_MS / 1000, ease: "linear" }}
                        />
                      ) : null}
                      <span className="relative flex items-center gap-3">
                        <QrCode /> Ler próximo
                      </span>
                    </Button>
                    {current ? (
                      <Button asChild variant="outline" size="xl" className="shrink-0 text-base">
                        <Link href={`/portaria/pessoa/${current.view.personId}`}>Cadastro</Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
