"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { toast } from "sonner";
import { CountUp } from "@/components/count-up";
import { Building, Copy, Heart, Human, Login, type PixelIcon, Teach, Users, Warning, Whatsapp } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import {
  GROUPS_WITHOUT_KIT,
  kitDemandOf,
  PEOPLE_GROUP_LABEL,
  type PeopleGroupId,
  type PeopleGroupRow,
  type PeopleKitComparison,
  peopleGroupDetail,
  POOL_SHORT_LABEL,
  stockBalance,
  sumRows,
  toDeliver,
  visibleRows,
} from "@/domain/kit-comparison";
import type { StockPool } from "@/domain/types";
import { copyText } from "@/lib/clipboard";
import { plural } from "@/lib/plural";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

/** Cor e ícone de cada grupo (as mesmas cores da portaria e dos vouchers). */
const GROUP_STYLE: Record<PeopleGroupId, { icon: PixelIcon; badge: string }> = {
  TEACHERS: { icon: Teach, badge: "bg-red text-white shadow-[0_2px_0_0_var(--brand-strong)]" },
  TEACHER_GUESTS: { icon: Users, badge: "border border-red/45 bg-brand-soft text-red" },
  OTHER_MEMBERS: { icon: Human, badge: "border border-line-strong bg-surface-3 text-fg-muted" },
  EMPLOYEES: { icon: Building, badge: "border border-warning/50 bg-warning/15 text-warning" },
  EMPLOYEE_GUESTS: { icon: Users, badge: "border border-warning/35 bg-warning-soft text-warning" },
  COURTESIES: { icon: Heart, badge: "border border-[#ff4fb4]/50 bg-[#ff4fb4]/15 text-[#ff8fd0]" },
  WITHOUT_KIT: { icon: Login, badge: "border border-line-strong bg-surface-3 text-fg-muted" },
};

/** Colunas no computador: o grupo e os cinco números. */
const ROW_GRID = "md:grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)] md:items-center md:gap-x-2";

/**
 * "Pessoas e kits": cada grupo lado a lado — quantas pessoas, quantas com
 * direito a kit, entregues, que faltam sair e quem já entrou —, com a previsão
 * de kits comparada ao estoque. No celular cada grupo vira um cartão.
 */
export function PeopleKits({
  comparison,
  pools,
  summary,
  links,
}: {
  comparison: PeopleKitComparison;
  /** Estoque cadastrado de cada tipo (para comparar com a previsão). */
  pools: { pool: StockPool; total: number }[];
  /** Resumo em texto, pronto para o WhatsApp. */
  summary: string;
  /** Linhas viram links só para quem pode abrir a lista de destino. */
  links: { registrations: boolean; employees: boolean };
}) {
  const registrations = visibleRows(comparison.registrations);
  const house = visibleRows(comparison.house);
  const totals = sumRows([...comparison.registrations, ...comparison.house]);
  const demand = kitDemandOf(comparison);
  const planned = demand.member + demand.guest + demand.employee;
  const balances = stockBalance(pools, demand);
  const stockTotal = pools.reduce((sum, pool) => sum + pool.total, 0);
  const short = balances.filter((b) => b.balance < 0);
  const hrefFor = (id: PeopleGroupId) =>
    id === "TEACHERS" || id === "TEACHER_GUESTS" || id === "OTHER_MEMBERS"
      ? links.registrations
        ? "/painel/inscricoes?filtro=todas"
        : null
      : links.employees
        ? id === "COURTESIES" || id === "WITHOUT_KIT"
          ? "/painel/cortesias"
          : "/painel/colaboradores"
        : null;

  async function copy() {
    const ok = await copyText(summary);
    playSound(ok ? "coin" : "error");
    if (ok) toast.success("Resumo copiado: é só colar no WhatsApp ou onde quiser.");
    else toast.error("Não deu para copiar neste aparelho. Use o botão do WhatsApp.");
  }

  return (
    <section
      id="comparativo"
      className="relative scroll-mt-20 overflow-clip rounded-2xl border border-line bg-gradient-to-b from-surface to-ink-2 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] sm:p-5"
      data-testid="people-kits"
    >
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pixel text-[0.55rem] text-red">Comparativo</p>
          <h2 className="display mt-1 flex items-center gap-2 text-[1.5rem] leading-none text-fg">Pessoas e kits</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copy} data-testid="people-kits-copy">
            <Copy /> Copiar resumo
          </Button>
          <Button asChild variant="success" size="sm">
            <a href={`https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noopener noreferrer" onClick={() => playSound("coin")}>
              <Whatsapp /> WhatsApp
            </a>
          </Button>
        </div>
      </header>

      {/* Placar do comparativo: quem vem, quantos kits isso dá e o estoque cadastrado. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Headline label="Pessoas" value={totals.people} note="esperadas na festa" testId="people-total" />
        <Headline
          label="Kits previstos"
          value={planned}
          note={totals.pending ? `${totals.withKit} garantidos + ${totals.pending} a confirmar` : `${plural(totals.withKit, "garantido", "garantidos")}`}
          testId="people-planned"
        />
        <Headline
          label="Estoque total"
          value={stockTotal}
          note={
            pools.length === 0 ? (
              "Estoque não cadastrado"
            ) : short.length ? (
              <span className="font-bold text-warning">
                Faltam {short.map((b) => `${-b.balance} ${POOL_SHORT_LABEL[b.pool]}`).join(" e ")}
              </span>
            ) : (
              <span className="font-bold text-success-text">Sobram {stockTotal - planned}</span>
            )
          }
          alert={short.length > 0}
          testId="people-stock"
        />
      </div>

      <div className="mt-5">
        <div className={cn("hidden border-b border-line pb-2 text-right md:grid", ROW_GRID)} aria-hidden>
          <span className="text-left text-[0.62rem] font-bold tracking-[0.1em] text-fg-dim uppercase">Grupo</span>
          {["Pessoas", "Com kit", "Entregues", "Faltam sair", "Entraram"].map((label) => (
            <span key={label} className="text-[0.62rem] font-bold tracking-[0.1em] text-fg-dim uppercase">
              {label}
            </span>
          ))}
        </div>
        <ul>
          <SectionTitle title="Inscrições" people={sumRows(comparison.registrations).people} />
          {registrations.map((row, i) => (
            <GroupRow key={row.id} row={row} comparison={comparison} index={i} href={hrefFor(row.id)} />
          ))}
          <SectionTitle title="SINDSERM" people={sumRows(comparison.house).people} />
          {house.map((row, i) => (
            <GroupRow key={row.id} row={row} comparison={comparison} index={registrations.length + i} href={hrefFor(row.id)} />
          ))}
          <motion.li
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 * (registrations.length + house.length) + 0.1, type: "spring", stiffness: 380, damping: 28 }}
            className={cn(
              "mt-3 grid gap-2 rounded-xl border border-red/45 bg-brand-soft px-3 py-3 shadow-[0_0_28px_-18px_var(--glow)]",
              ROW_GRID,
            )}
            data-testid="people-row-total"
          >
            <p className="display text-xl leading-none text-fg">Total</p>
            <Numbers
              people={totals.people}
              withKit={totals.withKit}
              pending={totals.pending}
              delivered={totals.delivered}
              toDeliver={totals.toDeliver}
              present={totals.present}
            />
          </motion.li>
        </ul>
      </div>

      <ul className="mt-4 space-y-1 text-xs text-fg-muted">
        <li>
          <strong className="text-fg">Faltam sair</strong>: têm direito e ainda não receberam. O kit sai sozinho junto com a entrada.
        </li>
        {totals.pending ? (
          <li>
            <strong className="text-warning">+ a confirmar</strong>: inscrições aguardando conferência ou ficha para assinar. Ganham kit
            quando a filiação for confirmada (já contam nos kits previstos).
          </li>
        ) : null}
        {comparison.rejected ? (
          <li data-testid="people-rejected">
            {plural(comparison.rejected, "inscrição com filiação não confirmada fica", "inscrições com filiação não confirmada ficam")} fora da
            conta.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function Headline({
  label,
  value,
  note,
  alert = false,
  testId,
}: {
  label: string;
  value: number;
  note: React.ReactNode;
  alert?: boolean;
  testId: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border bg-ink/60 p-3 sm:p-4", alert ? "border-warning/60 shadow-[0_0_24px_-14px_var(--color-warning)]" : "border-line")}>
      <p className="flex items-center gap-1.5 text-[0.62rem] font-bold tracking-[0.1em] text-fg-muted uppercase">
        {alert ? <Warning className="size-3.5 shrink-0 animate-blink text-warning" /> : null}
        {label}
      </p>
      <p className="display mt-1.5 text-[2.1rem] leading-none text-fg tabular sm:text-5xl" data-testid={testId}>
        <CountUp value={value} />
      </p>
      <p className="mt-1.5 text-[0.7rem] leading-snug text-fg-muted sm:text-xs">{note}</p>
    </div>
  );
}

function SectionTitle({ title, people }: { title: string; people: number }) {
  return (
    <li className="flex items-center gap-2 pt-4 pb-1" aria-hidden>
      <span className="pixel text-[0.55rem] text-fg">{title}</span>
      <span className="pixel text-[0.5rem] text-fg-dim tabular">· {plural(people, "pessoa", "pessoas")}</span>
      <span className="h-px flex-1 bg-line" />
    </li>
  );
}

function GroupRow({ row, comparison, index, href }: { row: PeopleGroupRow; comparison: PeopleKitComparison; index: number; href: string | null }) {
  const style = GROUP_STYLE[row.id];
  const Icon = style.icon;
  // Grupo sem direito a kit: os números de kit viram um traço (a não ser que um kit já tenha saído).
  const noKit = GROUPS_WITHOUT_KIT.includes(row.id) && row.delivered === 0;
  const label = PEOPLE_GROUP_LABEL[row.id];
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn("grid gap-2.5 border-t border-line/70 py-3 first:border-t-0", ROW_GRID)}
      data-testid={`people-row-${row.id.toLowerCase().replace("_", "-")}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg", style.badge)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          {href ? (
            <Link href={href} className="font-bold leading-tight text-fg hover:text-red hover:underline">
              {label}
            </Link>
          ) : (
            <p className="font-bold leading-tight text-fg">{label}</p>
          )}
          <p className="mt-0.5 text-xs leading-snug text-fg-muted">{peopleGroupDetail(row, comparison)}</p>
        </div>
      </div>
      <Numbers
        people={row.people}
        withKit={noKit ? null : row.withKit}
        pending={row.pending}
        delivered={noKit ? null : row.delivered}
        toDeliver={noKit ? null : toDeliver(row)}
        present={row.present}
      />
    </motion.li>
  );
}

/** Os cinco números da linha: no celular em cartõezinhos com rótulo; no computador, nas colunas da tabela. */
function Numbers({
  people,
  withKit,
  pending,
  delivered,
  toDeliver,
  present,
}: {
  people: number;
  withKit: number | null;
  pending: number;
  delivered: number | null;
  toDeliver: number | null;
  present: number;
}) {
  return (
    <dl className="grid grid-cols-5 gap-1.5 md:contents">
      <Cell label="Pessoas" value={people} strong />
      <Cell label="Com kit" value={withKit} extra={withKit !== null && pending ? `+${pending} a confirmar` : null} />
      <Cell label="Entregues" value={delivered} />
      <Cell label="Faltam" value={toDeliver} warn={Boolean(toDeliver)} />
      <Cell label="Entraram" value={present} />
    </dl>
  );
}

function Cell({ label, value, extra, strong = false, warn = false }: { label: string; value: number | null; extra?: string | null; strong?: boolean; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-line/60 bg-ink/40 px-0.5 py-1.5 text-center md:border-0 md:bg-transparent md:p-0 md:text-right">
      {/* Rótulo inteiro até nos celulares estreitos (no computador, o cabeçalho da tabela faz esse papel). */}
      <dt className="truncate text-[0.52rem] font-bold tracking-normal text-fg-dim uppercase md:sr-only">{label}</dt>
      <dd
        className={cn(
          "display mt-0.5 text-xl leading-none tabular md:mt-0 md:text-2xl",
          value === null ? "text-fg-dim" : warn ? "text-warning" : strong ? "text-fg" : "text-fg/90",
        )}
        aria-label={value === null ? "sem kit" : undefined}
      >
        {value === null ? "—" : value}
      </dd>
      {extra ? <dd className="mt-0.5 text-[0.58rem] leading-tight font-bold text-warning md:text-[0.62rem]">{extra}</dd> : null}
    </div>
  );
}
