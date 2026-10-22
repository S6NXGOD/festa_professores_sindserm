"use client";

import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CountUp } from "@/components/count-up";
import { Check, Download, Key, Loader, Upload, Users } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confettiLook } from "@/lib/confetti-look";
import { plural } from "@/lib/plural";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

type Counts = { users: number; affiliations: number };
type Preview = { source: string; createdAt: string; counts: Counts; usersAlreadyHere: number };
type Summary = {
  source: string;
  users: { created: number; skipped: number };
  affiliations: { added: number; skipped: number };
};

/** O que já veio de outra festa (filiações guardadas) e quantas inscrições daqui já foram confirmadas por elas. */
export interface PriorAffiliationStatus {
  total: number;
  sources: string[];
  confirmedHere: number;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T; response: Response } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: payload.error ?? "Não deu certo. Tente de novo." };
    }
    return { ok: true, data: (url.endsWith("exportar") ? null : await response.json()) as T, response };
  } catch {
    return { ok: false, error: "Sem conexão. Tente de novo." };
  }
}

/**
 * Mudança entre festas (um sistema por festa): levar a equipe e as filiações
 * já conferidas para o sistema da outra festa, num arquivo trancado com senha.
 * Ninguém entra na outra festa por estar no pacote: as filiações só confirmam
 * na hora quem se inscrever com o mesmo CPF e nome.
 */
export function FestaPackageSettings({ prior }: { prior: PriorAffiliationStatus }) {
  return (
    <div className="space-y-4">
      {prior.total > 0 ? <PriorStatus prior={prior} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <ExportCard />
        <ImportCard />
      </div>
    </div>
  );
}

/** As filiações que vieram de outra festa trabalhando nesta: quantas estão guardadas e quantas já confirmaram inscrições. */
function PriorStatus({ prior }: { prior: PriorAffiliationStatus }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success-soft p-4" data-testid="prior-affiliation-status">
      <Check className="mt-0.5 size-5 shrink-0 text-success-text" />
      <p className="text-sm text-fg">
        <strong className="tabular">{plural(prior.total, "filiação conferida", "filiações conferidas")}</strong> de {prior.sources.join(", ")}{" "}
        {prior.total === 1 ? "está guardada" : "estão guardadas"}: quem se inscrever com o mesmo CPF e nome é confirmado(a) na hora.{" "}
        <span className="text-fg-muted">
          {prior.confirmedHere > 0
            ? `${plural(prior.confirmedHere, "inscrição já foi confirmada", "inscrições já foram confirmadas")} assim.`
            : "Nenhuma inscrição confirmada assim ainda."}
        </span>
      </p>
    </div>
  );
}

function ExportCard() {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Counts | null>(null);

  async function exportPackage() {
    setBusy(true);
    const result = await post<null>("/painel/configuracoes/pacote/exportar", { passphrase });
    setBusy(false);
    if (!result.ok) {
      playSound("error");
      toast.error(result.error);
      return;
    }
    const counts = JSON.parse(result.response.headers.get("X-Pacote-Contagem") ?? "{}") as Counts;
    const blob = await result.response.blob();
    const name = /filename="([^"]+)"/.exec(result.response.headers.get("Content-Disposition") ?? "")?.[1] ?? "pacote-festa.festa";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    setDone(counts);
    playSound("powerup");
    toast.success("Pacote baixado. Guarde a senha: sem ela, ninguém abre o arquivo.");
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4" data-testid="package-export-card">
      <p className="flex items-center gap-2 font-bold text-fg">
        <Download className="size-5 text-red" /> Levar para outra festa
      </p>
      <p className="text-sm text-fg-muted">
        Gera um arquivo com a equipe (logins e perfis) e as filiações já conferidas (com RG e contracheque). Ninguém entra na outra festa por
        estar no pacote: as filiações só confirmam na hora quem se inscrever. Fotos de documentos não vão.
      </p>
      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-fg-muted uppercase">
          <Key className="size-3.5" /> Senha do pacote (mínimo 8)
        </span>
        <Input
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="new-password"
          data-testid="package-export-pass"
        />
      </label>
      <Button type="button" onClick={() => void exportPackage()} disabled={busy || passphrase.length < 8} data-testid="package-export">
        {busy ? <Loader className="animate-spin-steps" /> : <Download />} Gerar e baixar o pacote
      </Button>
      {done ? (
        <p className="flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-sm text-fg" data-testid="package-export-done">
          <Check className="mt-0.5 size-4 shrink-0 text-success-text" />
          {done.users} da equipe e {plural(done.affiliations, "filiação conferida", "filiações conferidas")}. Leve o arquivo e a senha ao
          sistema da outra festa e apague o arquivo depois.
        </p>
      ) : null}
    </div>
  );
}

function ImportCard() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  async function pick(chosen: File | undefined) {
    setPreview(null);
    setSummary(null);
    if (!chosen) return setFile(null);
    setFile({ name: chosen.name, content: await chosen.text() });
    playSound("blip");
  }

  async function send(confirm: boolean) {
    if (!file) return;
    setBusy(confirm ? "import" : "preview");
    const result = await post<{ preview?: Preview; summary?: Summary }>("/painel/configuracoes/pacote/importar", { content: file.content, passphrase, confirm });
    setBusy(null);
    if (!result.ok) {
      playSound("error");
      toast.error(result.error);
      return;
    }
    if (result.data.preview) {
      setPreview(result.data.preview);
      playSound("coin");
      return;
    }
    if (result.data.summary) {
      setSummary(result.data.summary);
      setPreview(null);
      playSound("levelup");
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, ...confettiLook(["#ff2626", "#f8c000", "#ffffff", "#22c55e", "#22d3ee"]), flat: true });
      }
      router.refresh();
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4" data-testid="package-import-card">
      <p className="flex items-center gap-2 font-bold text-fg">
        <Upload className="size-5 text-red" /> Trazer de outra festa
      </p>
      <p className="text-sm text-fg-muted">
        A equipe entra com o mesmo login e cria senha nova no primeiro acesso. As filiações conferidas não colocam ninguém nesta festa: quem
        se inscrever com o mesmo CPF e nome é confirmado(a) na hora. Quem já tem login aqui (mesmo e-mail) fica como está.
      </p>
      <input ref={fileRef} type="file" accept=".festa,application/json,application/octet-stream" className="sr-only" onChange={(event) => void pick(event.target.files?.[0])} data-testid="package-file" />
      <Button type="button" variant="outline" className="w-full justify-start" onClick={() => fileRef.current?.click()}>
        <Upload /> {file ? file.name : "Escolher o arquivo do pacote"}
      </Button>
      <label className="block space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-fg-muted uppercase">
          <Key className="size-3.5" /> Senha do pacote
        </span>
        <Input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoComplete="off" data-testid="package-import-pass" />
      </label>
      {!preview && !summary ? (
        <Button type="button" variant="outline" onClick={() => void send(false)} disabled={!file || passphrase.length < 8 || busy !== null} data-testid="package-preview">
          {busy === "preview" ? <Loader className="animate-spin-steps" /> : <Users />} Ver o que vem
        </Button>
      ) : null}

      <AnimatePresence initial={false}>
        {preview ? (
          <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 rounded-xl border border-red/40 bg-brand-soft p-3" data-testid="package-preview-box">
            <p className="text-xs font-bold tracking-[0.08em] text-fg-muted uppercase">De: {preview.source}</p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <Counter label="da equipe" value={preview.counts.users} />
              <Counter label={preview.counts.affiliations === 1 ? "filiação conferida" : "filiações conferidas"} value={preview.counts.affiliations} />
            </div>
            {preview.usersAlreadyHere ? (
              <p className="text-xs text-fg-muted">
                {preview.usersAlreadyHere === 1 ? "1 da equipe já tem login aqui: fica como está." : `${preview.usersAlreadyHere} da equipe já têm login aqui: ficam como estão.`}
              </p>
            ) : null}
            <Button type="button" className="w-full" onClick={() => void send(true)} disabled={busy !== null} data-testid="package-import">
              {busy === "import" ? <Loader className="animate-spin-steps" /> : <Check />} Trazer agora
            </Button>
          </motion.div>
        ) : null}
        {summary ? (
          <motion.div key="summary" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-2 rounded-xl border border-success/50 bg-success-soft p-3" data-testid="package-summary">
            <p className="display text-xl text-fg">Mudança feita!</p>
            <ul className="space-y-1 text-sm text-fg">
              <SummaryLine created={summary.users.created} skipped={summary.users.skipped} label="da equipe" />
              <SummaryLine
                created={summary.affiliations.added}
                skipped={summary.affiliations.skipped}
                label={`${summary.affiliations.added === 1 ? "filiação conferida" : "filiações conferidas"} (confirmam na hora da inscrição)`}
              />
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-ink/50 px-2 py-2">
      <p className="display text-3xl leading-none text-fg tabular">
        <CountUp value={value} />
      </p>
      <p className="mt-1 text-[0.68rem] leading-tight text-fg-muted">{label}</p>
    </div>
  );
}

function SummaryLine({ created, skipped, label }: { created: number; skipped: number; label: string }) {
  return (
    <li className={cn("flex items-baseline gap-1.5")}>
      <Check className="size-4 shrink-0 self-center text-success-text" />
      <strong className="tabular">{created}</strong> {label}
      {skipped ? <span className="text-fg-muted">· {skipped} já estavam aqui</span> : null}
    </li>
  );
}
