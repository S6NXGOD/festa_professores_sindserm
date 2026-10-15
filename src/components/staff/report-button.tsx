import { FileText } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import type { ReportType } from "@/domain/reports";

/** Relatório em PDF da área (abre em outra aba: no celular, dá para ver e compartilhar). */
export function ReportButton({ type }: { type: ReportType }) {
  return (
    <Button asChild variant="outline">
      <a href={`/painel/relatorios/${type}`} target="_blank" rel="noopener" data-testid={`report-${type}`}>
        <FileText /> Relatório PDF
      </a>
    </Button>
  );
}
