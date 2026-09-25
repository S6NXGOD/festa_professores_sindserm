"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Card, Check, Close, FileText, Loader, type PixelIcon, Receipt, Trash, Upload } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { MAX_FILES_PER_DOCUMENT } from "@/domain/schemas";
import type { DocumentKind } from "@/domain/types";
import { playSound } from "@/lib/sound";
import { shrinkImage, uploadWithProgress } from "@/lib/upload";
import { cn } from "@/lib/utils";

/** Um arquivo já enviado, pronto para mostrar. */
export interface SlotItem {
  id: string;
  /** Miniatura (prévia local ou do servidor). Sem miniatura: ícone de PDF. */
  thumbUrl: string | null;
  isPdf: boolean;
  /** Abre o arquivo inteiro (só para a equipe). */
  openUrl?: string;
}

export interface UploadedDocument {
  id: string;
  kind: DocumentKind;
  isPdf: boolean;
  /** Prévia local (a foto que a pessoa acabou de escolher). */
  previewUrl: string | null;
}

const COPY: Record<DocumentKind, { title: string; hint: string; icon: PixelIcon }> = {
  RG: {
    title: "RG (frente e verso)",
    hint: "Uma foto de cada lado, com a luz boa e sem cortar as bordas. PDF também vale.",
    icon: Card,
  },
  PAYSLIP: {
    title: "Contracheque",
    hint: "O mais recente: PDF do portal da prefeitura, print ou foto legível.",
    icon: Receipt,
  },
};

/** Prévias locais continuam na tela ao voltar e avançar as etapas do formulário. */
const previewCache = new Map<string, { url: string | null; isPdf: boolean }>();

export function cachedPreview(id: string) {
  return previewCache.get(id) ?? null;
}

const SEGMENTS = 8;

interface Pending {
  key: string;
  progress: number;
  previewUrl: string | null;
  isPdf: boolean;
}

/**
 * Espaço para enviar um documento (RG ou contracheque): tirar foto na hora
 * (câmera do celular) ou escolher arquivo. Cada arquivo sobe na hora, com
 * progresso. Com `formId`, o arquivo já entra na ficha (Atendimento).
 */
export function DocumentSlot({
  kind,
  items,
  onUploaded,
  onRemove,
  formId,
  error,
  disabled = false,
  onBusyChange,
  testId,
}: {
  kind: DocumentKind;
  items: SlotItem[];
  onUploaded: (doc: UploadedDocument) => void;
  onRemove?: (id: string) => void | Promise<void>;
  formId?: string;
  error?: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  testId?: string;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const inFlight = useRef(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  // Apagar pede dois toques (o "X" é pequeno e fica fácil tocar sem querer no celular).
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), 3500);
    return () => window.clearTimeout(timer);
  }, [armed]);
  const copy = COPY[kind];
  const Icon = copy.icon;
  const count = items.length;
  const full = count + pending.length >= MAX_FILES_PER_DOCUMENT;
  const busy = pending.length > 0;

  function update(key: string, patch: Partial<Pending> | null) {
    setPending((list) =>
      patch === null ? list.filter((p) => p.key !== key) : list.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }

  async function sendOne(file: File) {
    const key = `${Date.now()}-${Math.random()}`;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    inFlight.current += 1;
    onBusyChange?.(true);
    const blob = isPdf ? file : await shrinkImage(file, 2000);
    const previewUrl = isPdf ? null : URL.createObjectURL(blob);
    setPending((list) => [...list, { key, progress: 0, previewUrl, isPdf }]);
    const data = new FormData();
    data.append("kind", kind);
    if (formId) data.append("formId", formId);
    data.append("file", blob, isPdf ? file.name : `${kind.toLowerCase()}.jpg`);
    const result = await uploadWithProgress<{ document: { id: string } }>(
      "/api/documentos",
      data,
      (progress) => update(key, { progress }),
      { timeoutMs: 90_000, fallbackError: "Não foi possível enviar o arquivo. Tente de novo." },
    );
    update(key, null);
    inFlight.current -= 1;
    onBusyChange?.(inFlight.current > 0);
    if (!result.ok) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      playSound("error");
      toast.error(result.error);
      return;
    }
    playSound("coin");
    previewCache.set(result.body.document.id, { url: previewUrl, isPdf });
    onUploaded({ id: result.body.document.id, kind, isPdf, previewUrl });
  }

  async function pick(files: FileList | null, input: HTMLInputElement | null) {
    const list = Array.from(files ?? []);
    if (input) input.value = "";
    if (list.length === 0) return;
    const room = MAX_FILES_PER_DOCUMENT - count - pending.length;
    if (list.length > room) toast.warning(`No máximo ${MAX_FILES_PER_DOCUMENT} arquivos de ${copy.title.split(" ")[0]}.`);
    playSound("blip");
    for (const file of list.slice(0, Math.max(0, room))) await sendOne(file);
  }

  async function remove(id: string) {
    if (!onRemove) return;
    setRemoving(id);
    try {
      await onRemove(id);
      playSound("blip");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section
      className={cn(
        "rounded-xl border-2 p-4 transition-colors",
        count > 0 ? "border-success/40 bg-success-soft/40" : error ? "border-danger/70 bg-surface-2" : "border-line-strong bg-surface-2",
      )}
      data-testid={testId}
      aria-label={copy.title}
    >
      <header className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-lg",
            count > 0 ? "bg-success text-success-foreground" : "bg-surface-3 text-red",
          )}
        >
          <Icon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-bold text-fg">
            {copy.title}
            {count > 0 ? (
              <span className="pixel inline-flex items-center gap-1 rounded-[3px] bg-success px-1.5 py-1 text-[0.5rem] text-success-foreground">
                <Check className="size-3" /> {count}
              </span>
            ) : (
              <span className="pixel rounded-[3px] bg-warning px-1.5 py-1 text-[0.5rem] text-warning-foreground">Falta</span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{copy.hint}</p>
        </div>
      </header>

      {items.length + pending.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2.5">
          <AnimatePresence initial={false}>
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 420, damping: 24 }}
                className="relative"
              >
                <Tile item={item} label={`${copy.title.split(" ")[0]} ${index + 1}`} />
                {armed === item.id ? (
                  <span className="pointer-events-none absolute inset-0 flex items-end justify-center rounded-lg bg-danger/75 pb-2 text-xs font-bold text-white">
                    Apagar?
                  </span>
                ) : null}
                {onRemove && !disabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (armed === item.id) {
                        setArmed(null);
                        void remove(item.id);
                      } else {
                        setArmed(item.id);
                        playSound("warn");
                      }
                    }}
                    disabled={removing === item.id}
                    className={cn(
                      "absolute -top-2 -right-2 inline-flex size-7 items-center justify-center rounded-full border-2 border-ink bg-danger text-white shadow outline-none focus-visible:ring-2 focus-visible:ring-red",
                      armed === item.id && "scale-110 ring-2 ring-white",
                    )}
                    aria-label={
                      armed === item.id
                        ? `Confirmar: apagar ${copy.title.split(" ")[0]} ${index + 1}`
                        : `Apagar ${copy.title.split(" ")[0]} ${index + 1}`
                    }
                  >
                    {removing === item.id ? (
                      <Loader className="size-3.5 animate-spin-steps" />
                    ) : armed === item.id ? (
                      <Trash className="size-3.5" />
                    ) : (
                      <Close className="size-3.5" />
                    )}
                  </button>
                ) : null}
              </motion.li>
            ))}
            {pending.map((p) => (
              <motion.li
                key={p.key}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="relative size-[5.5rem] overflow-hidden rounded-lg border-2 border-line-strong bg-ink"
                role="status"
                aria-label={`Enviando ${p.progress}%`}
              >
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) antes do envio terminar
                  <img src={p.previewUrl} alt="" className="size-full object-cover opacity-50" />
                ) : (
                  <FileText className="absolute inset-0 m-auto size-9 text-fg-muted" />
                )}
                <div className="absolute inset-x-1.5 bottom-1.5 flex gap-[2px]">
                  {Array.from({ length: SEGMENTS }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-2 flex-1 rounded-[1px]",
                        i < Math.round((p.progress / 100) * SEGMENTS) ? "bg-success shadow-[0_0_6px_var(--success)]" : "bg-surface-3",
                      )}
                    />
                  ))}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={count > 0 ? "outline" : "default"}
          onClick={() => camera.current?.click()}
          disabled={disabled || full}
          data-testid={testId ? `${testId}-camera` : undefined}
        >
          <Camera /> Tirar foto
        </Button>
        <Button type="button" variant="outline" onClick={() => picker.current?.click()} disabled={disabled || full}>
          {busy ? <Loader className="animate-spin-steps" /> : <Upload />} Arquivo
        </Button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void pick(event.target.files, event.target)}
        aria-label={`Tirar foto: ${copy.title}`}
      />
      <input
        ref={picker}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => void pick(event.target.files, event.target)}
        aria-label={`Escolher arquivo: ${copy.title}`}
        data-testid={testId ? `${testId}-input` : undefined}
      />
      {error && count === 0 ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Tile({ item, label }: { item: SlotItem; label: string }) {
  const body = item.thumbUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura privada (prévia local ou rota autenticada)
    <img src={item.thumbUrl} alt={label} className="size-full object-cover" />
  ) : (
    <span className="flex size-full flex-col items-center justify-center gap-1 text-fg-muted">
      <FileText className="size-8 text-red" />
      <span className="pixel text-[0.45rem]">{item.isPdf ? "PDF" : "Foto"}</span>
    </span>
  );
  const className =
    "relative block size-[5.5rem] overflow-hidden rounded-lg border-2 border-success/60 bg-ink shadow-[0_0_18px_-8px_var(--success)]";
  return item.openUrl ? (
    <a href={item.openUrl} target="_blank" rel="noopener noreferrer" className={cn(className, "outline-none focus-visible:ring-2 focus-visible:ring-red")} aria-label={`Abrir ${label}`}>
      {body}
    </a>
  ) : (
    <span className={className}>{body}</span>
  );
}
