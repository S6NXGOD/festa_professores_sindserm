import Link from "next/link";
import { Fragment } from "react";

export interface PeopleSumPart {
  id: "registrations" | "organization";
  label: string;
  /** Quem forma a parte: "30 inscritos · 10 convidados". */
  detail: string;
  /** A mesma medida do número grande (prontos ou já entraram) nesta parte. */
  value: number;
  /** Esperados nesta parte. */
  of: number;
  /** Atalhos para quem ainda não entrou (durante a festa). */
  missing?: { href: string; label: string }[];
}

function Operator({ children }: { children: string }) {
  return (
    <span aria-hidden className="display w-3 shrink-0 text-lg leading-none text-fg-dim">
      {children}
    </span>
  );
}

function Pair({ value, of }: { value: number; of: number }) {
  return (
    <p className="display shrink-0 text-xl leading-none whitespace-nowrap text-fg tabular">
      {value.toLocaleString("pt-BR")}
      <span className="text-base text-fg-muted"> / {of.toLocaleString("pt-BR")}</span>
    </p>
  );
}

/**
 * A conta do placar, sem mistério: inscrições + organização = todo mundo. Cada
 * linha mostra a medida do número grande (prontos para entrar, antes da festa;
 * quem já entrou, durante) sobre os esperados daquela parte, e a soma fecha com
 * o número grande. Assim, uma lista inchada aparece na hora.
 */
export function PeopleSum({ measure, parts, total, of }: { measure: string; parts: PeopleSumPart[]; total: number; of: number }) {
  if (parts.length === 0) return null;
  return (
    <div className="relative mt-3 rounded-xl border border-line-strong bg-ink/60 p-3" data-testid="expected-breakdown">
      <p className="pixel text-[0.5rem] text-red">A conta: {measure} / esperados</p>
      <ul className="mt-2.5 grid gap-2.5">
        {parts.map((part, index) => (
          <li key={part.id} className="flex items-start gap-2" data-testid={`breakdown-${part.id}`}>
            <Operator>{index > 0 ? "+" : ""}</Operator>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-bold text-fg">{part.label}</p>
              <p className="mt-0.5 text-xs leading-snug text-fg-muted">{part.detail}</p>
              {part.missing?.length ? (
                <p className="mt-0.5 text-xs">
                  {part.missing.map((link, linkIndex) => (
                    <Fragment key={link.href}>
                      {linkIndex > 0 ? <span className="text-fg-muted"> · </span> : null}
                      <Link href={link.href} className="font-semibold text-red hover:underline">
                        {link.label}
                      </Link>
                    </Fragment>
                  ))}
                </p>
              ) : null}
            </div>
            <Pair value={part.value} of={part.of} />
          </li>
        ))}
        {parts.length > 1 ? (
          <li className="flex items-center gap-2 border-t border-line/70 pt-2.5" data-testid="breakdown-total">
            <Operator>=</Operator>
            <p className="min-w-0 flex-1 text-sm font-bold text-fg">Todo mundo</p>
            <Pair value={total} of={of} />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
