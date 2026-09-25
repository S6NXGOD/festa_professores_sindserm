"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { DocumentKind } from "@/domain/types";
import { callAction } from "@/lib/call-action";
import { removeDocumentAction } from "@/server/actions/affiliation-forms";
import { DocumentSlot, type SlotItem } from "./document-slot";

export interface FormFileView {
  id: string;
  kind: DocumentKind;
  isPdf: boolean;
}

function toItem(file: FormFileView): SlotItem {
  return {
    id: file.id,
    isPdf: file.isPdf,
    thumbUrl: file.isPdf ? null : `/api/documentos/${file.id}?miniatura=1`,
    openUrl: `/api/documentos/${file.id}`,
  };
}

/**
 * Documentos da ficha para a equipe (Atendimento/administração): ver, anexar
 * na hora com a câmera e apagar foto ruim. Os arquivos entram direto na ficha.
 */
export function FormDocuments({
  formId,
  files,
  canRemove,
  onChanged,
  className,
  disabled = false,
}: {
  formId: string;
  files: FormFileView[];
  canRemove: boolean;
  /** Recarrega os dados da tela (padrão: atualizar a página). */
  onChanged?: () => void;
  className?: string;
  /** Só leitura (ex.: ficha cancelada). */
  disabled?: boolean;
}) {
  const router = useRouter();
  const refresh = onChanged ?? (() => router.refresh());
  // Enquanto a tela recarrega, o arquivo novo já aparece (e o apagado já some).
  const [added, setAdded] = useState<(SlotItem & { kind: DocumentKind })[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  async function remove(id: string) {
    const result = await callAction(removeDocumentAction(id));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setRemoved((list) => [...list, id]);
    refresh();
  }

  return (
    <div className={className ?? "grid gap-3 sm:grid-cols-2"}>
      {(["RG", "PAYSLIP"] as const).map((kind) => {
        const known = new Set(files.map((file) => file.id));
        const items = [
          ...files.filter((file) => file.kind === kind).map(toItem),
          ...added.filter((item) => item.kind === kind && !known.has(item.id)),
        ].filter((item) => !removed.includes(item.id));
        return (
          <DocumentSlot
            key={kind}
            kind={kind}
            formId={formId}
            items={items}
            onUploaded={(doc) => {
              setAdded((list) => [...list, { id: doc.id, kind, isPdf: doc.isPdf, thumbUrl: doc.previewUrl }]);
              refresh();
            }}
            onRemove={canRemove ? remove : undefined}
            disabled={disabled}
            testId={`form-doc-${kind.toLowerCase()}`}
          />
        );
      })}
    </div>
  );
}
