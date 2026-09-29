"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Check, FileText, Warning } from "@/components/icons/pixel";
import { DOCUMENT_KIND_LABEL } from "@/domain/labels";
import type { DocumentKind } from "@/domain/types";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { DocumentViewerDialog, type ViewerDocument } from "./document-viewer";

export interface ThumbDocument {
  id: string;
  kind: DocumentKind;
  isPdf: boolean;
}

/** Os dois obrigatórios aparecem sempre (mesmo faltando); a ficha do gov.br, quando chegou. */
const REQUIRED: readonly DocumentKind[] = ["RG", "PAYSLIP"];
const MISSING_LABEL: Partial<Record<DocumentKind, string>> = { RG: "Falta o RG", PAYSLIP: "Falta o contracheque" };

/**
 * Miniaturas dos documentos de uma ficha, na lista: dá para ver de relance que
 * o RG e o contracheque estão lá (e como estão) e, tocando, abrir no
 * visualizador. `interactive={false}` quando a linha inteira já é um link.
 */
export function DocumentThumbs({ documents, interactive = true, testId }: { documents: ThumbDocument[]; interactive?: boolean; testId?: string }) {
  const [viewing, setViewing] = useState<ViewerDocument | null>(null);
  const kinds = [...REQUIRED, ...(documents.some((doc) => doc.kind === "SIGNED_FORM") ? (["SIGNED_FORM"] as const) : [])];
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2" data-testid={testId}>
      {kinds.map((kind) => {
        const files = documents.filter((doc) => doc.kind === kind);
        const label = DOCUMENT_KIND_LABEL[kind];
        return (
          <div key={kind} className="flex flex-col gap-1">
            <div className="flex gap-1">
              {files.length ? (
                files.map((doc, index) => (
                  <Thumb
                    key={doc.id}
                    doc={doc}
                    index={index}
                    label={files.length > 1 ? `${label} ${index + 1}` : label}
                    onOpen={interactive ? (viewer) => setViewing(viewer) : undefined}
                  />
                ))
              ) : (
                <span className="inline-flex h-16 w-12 items-center justify-center rounded-md border-2 border-dashed border-warning/60 bg-warning-soft">
                  <Warning className="size-4 text-warning" />
                </span>
              )}
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[0.68rem] font-bold",
                files.length ? (kind === "SIGNED_FORM" ? "text-[#7dd3fc]" : "text-success-text") : "text-warning",
              )}
            >
              {files.length ? <Check className="size-3" /> : null}
              {files.length ? (kind === "SIGNED_FORM" ? "Ficha gov.br" : label) : MISSING_LABEL[kind]}
            </span>
          </div>
        );
      })}
      {interactive ? <DocumentViewerDialog doc={viewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function Thumb({
  doc,
  index,
  label,
  onOpen,
}: {
  doc: ThumbDocument;
  index: number;
  label: string;
  onOpen?: (viewer: ViewerDocument) => void;
}) {
  const [failed, setFailed] = useState(false);
  const body = failed ? (
    <span className="flex size-full flex-col items-center justify-center gap-0.5 text-fg-muted">
      <FileText className="size-5 text-red" />
      <span className="pixel text-[0.38rem]">{doc.isPdf ? "PDF" : "Foto"}</span>
    </span>
  ) : (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura privada (rota autenticada) */}
      <img
        src={`/api/documentos/${doc.id}?miniatura=1`}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("size-full object-cover", doc.isPdf && "bg-white object-top")}
      />
      {doc.isPdf ? <span className="pixel absolute right-0.5 bottom-0.5 rounded-[2px] bg-red px-0.5 text-[0.36rem] text-white">PDF</span> : null}
    </>
  );
  const className = "relative block h-16 w-12 shrink-0 overflow-hidden rounded-md border border-success/50 bg-ink shadow-[0_0_12px_-6px_var(--success)]";
  return (
    <motion.span
      initial={{ opacity: 0, y: 4, rotate: -3 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ delay: 0.04 * index, type: "spring", stiffness: 420, damping: 24 }}
      className="block"
    >
      {onOpen ? (
        <button
          type="button"
          onClick={() => {
            playSound("blip");
            onOpen({ id: doc.id, isPdf: doc.isPdf, label });
          }}
          className={cn(className, "outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-red")}
          aria-label={`Ver ${label}`}
        >
          {body}
        </button>
      ) : (
        <span className={className}>{body}</span>
      )}
    </motion.span>
  );
}
