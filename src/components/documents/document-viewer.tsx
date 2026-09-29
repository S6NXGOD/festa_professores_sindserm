"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Documento aberto no visualizador. */
export interface ViewerDocument {
  id: string;
  isPdf: boolean;
  /** "RG 1", "Contracheque", "Ficha assinada (gov.br)". */
  label: string;
}

/** O visualizador mostra até esta quantidade de páginas; o resto, no arquivo original. */
const MAX_PAGES = 8;

type PdfState = { kind: "loading" } | { kind: "ready"; first: string; pages: number } | { kind: "error" };

/**
 * Visualizador de documentos da ficha (só a equipe): foto inteira ou as páginas
 * do PDF desenhadas no servidor, uma embaixo da outra. Funciona no celular,
 * que não mostra PDF dentro da página. O arquivo original abre à parte.
 */
export function DocumentViewerDialog({ doc, onClose }: { doc: ViewerDocument | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(doc)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-3 p-3 sm:p-5" data-testid="document-viewer">
        {doc ? <ViewerBody key={doc.id} doc={doc} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ doc }: { doc: ViewerDocument }) {
  const original = `/api/documentos/${doc.id}`;
  const [pdf, setPdf] = useState<PdfState>({ kind: "loading" });

  // PDF: a 1ª página vem com o total de páginas (cabeçalho); as outras entram como imagem, conforme a rolagem.
  useEffect(() => {
    if (!doc.isPdf) return;
    let url: string | null = null;
    let cancelled = false;
    fetch(`${original}?pagina=1`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const pages = Number(response.headers.get("X-Page-Count") ?? "1") || 1;
        url = URL.createObjectURL(await response.blob());
        if (!cancelled) setPdf({ kind: "ready", first: url, pages });
      })
      .catch(() => !cancelled && setPdf({ kind: "error" }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc.isPdf, original]);

  const pages = pdf.kind === "ready" ? pdf.pages : 0;
  return (
    <>
      <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pr-8 text-left">
        <div className="min-w-0">
          <DialogTitle className="truncate">{doc.label}</DialogTitle>
          <DialogDescription>
            {doc.isPdf ? (pages ? `PDF · ${pages === 1 ? "1 página" : `${pages} páginas`}` : "PDF") : "Foto"} · aberto fica na auditoria
          </DialogDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={original} target="_blank" rel="noopener noreferrer" data-testid="viewer-original">
            <ExternalLink /> Abrir original
          </a>
        </Button>
      </DialogHeader>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg bg-ink/70 p-1 sm:p-2">
        {doc.isPdf ? (
          <AnimatePresence mode="wait" initial={false}>
            {pdf.kind === "loading" ? (
              <motion.div key="loading" exit={{ opacity: 0 }} className="flex h-72 flex-col items-center justify-center gap-3 text-fg-muted">
                <Loader className="size-8 animate-spin-steps text-red" />
                <span className="pixel text-[0.55rem]">Carregando páginas_</span>
              </motion.div>
            ) : pdf.kind === "error" ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-72 flex-col items-center justify-center gap-3 p-6 text-center">
                <FileText className="size-10 text-red" />
                <p className="text-sm text-fg-muted">Não deu para mostrar as páginas deste PDF aqui. Use “Abrir original”.</p>
              </motion.div>
            ) : (
              <motion.ol key="pages" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3" data-testid="viewer-pages">
                {Array.from({ length: Math.min(pdf.pages, MAX_PAGES) }, (_, index) => (
                  <li key={index}>
                    {pdf.pages > 1 ? (
                      <p className="pixel mb-1.5 px-1 text-[0.5rem] text-fg-dim">
                        Página {index + 1} de {pdf.pages}
                      </p>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element -- página desenhada no servidor (rota autenticada) */}
                    <img
                      src={index === 0 ? pdf.first : `${original}?pagina=${index + 1}`}
                      alt={`${doc.label}, página ${index + 1}`}
                      loading={index === 0 ? "eager" : "lazy"}
                      className="w-full rounded-md bg-white shadow-[0_8px_30px_-12px_rgb(0_0_0/0.9)]"
                    />
                  </li>
                ))}
                {pdf.pages > MAX_PAGES ? (
                  <li className="p-3 text-center text-sm text-fg-muted">
                    Mais {pdf.pages - MAX_PAGES} páginas no arquivo original.
                  </li>
                ) : null}
              </motion.ol>
            )}
          </AnimatePresence>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- foto do documento (rota autenticada)
          <img src={original} alt={doc.label} className="mx-auto max-h-[78dvh] w-auto rounded-md object-contain" />
        )}
      </div>
    </>
  );
}
