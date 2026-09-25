import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/common/print-button";
import { AutoPrint } from "@/components/voucher/auto-print";
import { splitContributionMonth } from "@/domain/affiliation-text";
import { UNION } from "@/domain/union";
import { formatCpf } from "@/lib/cpf";
import { formatPlainDate } from "@/lib/datetime";
import { formatPhone } from "@/lib/phone";
import { getAffiliationForm } from "@/server/queries/panel";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Imprimir ficha" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RED = "#e3000f";

/** Logo do sindicato em alta resolução (a versão colorida, para papel branco). */
function UnionLogoPrint({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- arquivo original em alta resolução para impressão
    <img
      src="/logo_base.png"
      alt="SINDSERMTHE — Sindicato dos Servidores Públicos Municipais de Teresina"
      width={1392}
      height={396}
      className={className}
    />
  );
}

/** Linha "rótulo: ______ valor ______" da ficha. */
function Line({ label, value, className, grow = true }: { label: string; value?: string | null; className?: string; grow?: boolean }) {
  return (
    <div className={`flex items-end gap-1.5 ${grow ? "flex-1" : ""} ${className ?? ""}`}>
      <span className="shrink-0 text-[12.5px]" style={{ color: "#3a3a3a" }}>
        {label}
      </span>
      <span className="min-h-[18px] flex-1 border-b border-black/70 px-1 text-[13px] font-semibold uppercase">{value ?? ""}</span>
    </div>
  );
}

function Signatures() {
  return (
    <div className="mt-9 grid grid-cols-2 gap-12 text-center text-[12px]">
      <div className="border-t border-black/80 pt-1">Diretor(a) do {UNION.shortName}</div>
      <div className="border-t border-black/80 pt-1">Assinatura do(a) Servidor(a)</div>
    </div>
  );
}

export default async function PrintAffiliationFormPage({ params }: PageProps<"/painel/filiacoes/[id]/imprimir">) {
  await requirePageActor("newAffiliation");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await getAffiliationForm(id);
  if (!data) notFound();
  const { form } = data;
  const { month, year } = splitContributionMonth(form.contributionStartMonth);
  const date = formatPlainDate(form.formDate);

  return (
    <div className="mx-auto max-w-[210mm]">
      {/* Folha A4 sem as margens do navegador: sai sem data/endereço da página no papel. */}
      <style>{"@media print { @page { size: A4; margin: 0; } }"}</style>
      <AutoPrint enabled />
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-fg-muted sm:invisible">Folha A4: arraste para o lado para ver tudo.</p>
        <PrintButton label="Imprimir ficha" />
      </div>
      {/* No celular a folha A4 rola dentro deste bloco, sem estourar a largura da página. */}
      <div className="overflow-x-auto rounded-sm print:overflow-visible">
        <article
          className="min-w-[190mm] bg-white p-[9mm] text-black shadow-xl print:min-w-0 print:p-[10mm] print:shadow-none"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          data-testid="printable-ficha"
        >
          {/* FICHA DE FILIAÇÃO */}
          <section className="rounded-[18px] border-[3px] p-4" style={{ borderColor: RED }}>
            <header className="rounded-[14px] border-2 px-4 pt-3 pb-2" style={{ borderColor: RED }}>
              <UnionLogoPrint className="mx-auto h-[24mm] w-auto" />
              <div className="mt-2 border-t pt-1.5 text-center text-[11px] font-semibold" style={{ borderColor: RED, color: "#3a3a3a" }}>
                {UNION.address} / {UNION.phone} / {UNION.email}
                <br />
                CNPJ: {UNION.cnpj}
              </div>
            </header>

            <h1 className="mt-3 text-center text-[20px] font-black italic tracking-wide" style={{ color: RED }}>
              FICHA DE FILIAÇÃO
            </h1>
            <div className="mt-1 flex justify-end">
              <Line label="Data:" value={date} grow={false} className="w-52" />
            </div>

            <div className="mt-2 space-y-2.5">
              <Line label="Nome:" value={form.fullName} />
              <Line label="Mãe:" value={form.motherName} />
              <Line label="Pai:" value={form.fatherName} />
              <Line label="End.:" value={form.address} />
              <div className="flex gap-4">
                <Line label="Bairro:" value={form.neighborhood} className="flex-[3]" />
                <Line label="nº," value={form.addressNumber} className="flex-1" />
              </div>
              <div className="flex gap-4">
                <Line label="E-mail:" value={form.email ? form.email.toLowerCase() : ""} className="flex-[3] [&>span:last-child]:normal-case" />
                <Line label="Fone (whatsapp)" value={formatPhone(form.whatsapp)} className="flex-[2]" />
              </div>
              <div className="flex gap-4">
                <Line label="Data de nasc.:" value={formatPlainDate(form.birthDate)} className="flex-[2]" />
                <Line label="RG.:" value={form.rg} className="flex-[2]" />
                <Line label="CPF:" value={formatCpf(form.cpf)} className="flex-[2.4]" />
              </div>
              <div className="flex gap-4">
                <Line label="Lotação:" value={form.workplace} className="flex-[3]" />
                <Line label="Matrícula:" value={form.registrationNumber} className="flex-[2]" />
              </div>
              <div className="flex gap-4">
                <Line label="Cargo/Função:" value={form.jobTitle} className="flex-[3]" />
                <Line label="Data de admissão:" value={formatPlainDate(form.admissionDate)} className="flex-[2]" />
              </div>
            </div>

            <p className="mt-4 text-[12.5px] leading-relaxed font-bold uppercase">
              Autorizo que seja descontado, em favor do {UNION.shortName}, o valor correspondente a 1% (um por cento) do meu salário
              base, a partir do mês de <span className="border-b border-black px-6 font-black">{month || "            "}</span> do ano de{" "}
              <span className="border-b border-black px-6 font-black">{year || "        "}</span>
            </p>

            <Signatures />
          </section>

          <div className="my-4 flex items-center gap-2 text-[9px] text-black/50" aria-hidden>
            <span className="flex-1 border-t border-dashed border-black/40" />
            destacar
            <span className="flex-1 border-t border-dashed border-black/40" />
          </div>

          {/* COMPROVANTE DE FILIAÇÃO */}
          <section className="rounded-[18px] border-[3px] p-4" style={{ borderColor: RED }}>
            <h2 className="text-center text-[18px] font-black italic tracking-wide" style={{ color: RED }}>
              COMPROVANTE DE FILIAÇÃO
            </h2>
            <div className="mt-1 flex justify-end">
              <Line label="Data:" value={date} grow={false} className="w-52" />
            </div>
            <div className="mt-2 space-y-2.5">
              <Line label="Nome:" value={form.fullName} />
              <div className="flex gap-4">
                <Line label="Lotação:" value={form.workplace} className="flex-[3]" />
                <Line label="Matrícula:" value={form.registrationNumber} className="flex-[2]" />
              </div>
            </div>
            <Signatures />
            <footer className="mt-4 flex items-center gap-3 rounded-[10px] border-2 px-3 py-2" style={{ borderColor: RED }}>
              <UnionLogoPrint className="h-[12mm] w-auto shrink-0" />
              <div className="text-[10px] leading-snug">
                <p className="font-bold" style={{ color: "#3a3a3a" }}>
                  {UNION.fullName}
                </p>
                <p style={{ color: "#3a3a3a" }}>
                  {UNION.address} / {UNION.phone} / {UNION.email} · CNPJ: {UNION.cnpj}
                </p>
              </div>
            </footer>
          </section>

          <p className="mt-2 text-right text-[8px] text-black/40">Ref. {form.id.slice(0, 8).toUpperCase()}</p>
        </article>
      </div>
    </div>
  );
}
