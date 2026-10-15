import { Building, Clock, Gift, Heart, Hourglass, Notebook, Package, Teach, Users, Warning } from "@/components/icons/pixel";
import type { PixelIcon } from "@/components/icons/pixel";

/**
 * Como funcionam os kits, numa página: quem tem direito, quando sai, de qual
 * estoque, e o que acontece em cada situação (esgotou, vagou, sobrou, acabou na
 * porta). Para a equipe consultar na hora, sem depender de ninguém.
 */
export function KitRules({
  deadlineLabel,
  separateStock,
  sharedStock = false,
}: {
  deadlineLabel: string | null;
  separateStock: boolean;
  /** Estoque único para todos (inclusive colaboradores e cortesias). */
  sharedStock?: boolean;
}) {
  const rules: { icon: PixelIcon; title: string; text: string }[] = [
    {
      icon: Teach,
      title: "Quem tem kit",
      text: "Professora ou professor filiado(a): 1 kit, e mais 1 para o convidado, que sai depois que quem convidou chegar. Filiado(a) que não é professor(a) entra sem kit.",
    },
    {
      icon: Building,
      title: "Colaboradores e cortesias",
      text: `Colaborador(a) do SINDSERM: 1 kit e mais 1 para o convidado. Cortesia: com ou sem kit, como foi cadastrada. ${sharedStock ? "Todos tiram do mesmo estoque." : "Os três saem do estoque dos colaboradores."}`,
    },
    {
      icon: Clock,
      title: "Quando sai",
      text: `Na portaria, junto com a entrada (ninguém registra retirada: entrou, saiu 1 kit).${deadlineLabel ? ` Até as ${deadlineLabel}, cada kit fica guardado para quem se inscreveu; depois, as sobras saem por ordem de chegada, enquanto houver.` : ""}`,
    },
    {
      icon: Package,
      title: "Guardado por ordem de inscrição",
      text: `Cada inscrição guarda o kit dela (inclusive quem ainda aguarda conferência ou assinatura)${separateStock ? ", no estoque de professores ou de convidados" : ""}.`,
    },
    {
      icon: Hourglass,
      title: "Esgotou",
      text: "Quem se inscreve depois entra na fila do kit: o site avisa e pede confirmação, e o voucher mostra o lugar na fila. A entrada continua garantida.",
    },
    {
      icon: Users,
      title: "Vagou kit",
      text: "Inscrição recusada, ficha cancelada ou estoque aumentado: a fila anda sozinha, por ordem, e o voucher de quem saiu da fila já mostra o kit.",
    },
    {
      icon: Gift,
      title: "Sobras (quem não veio)",
      text: `Gente que não veio deixa kit guardado.${deadlineLabel ? ` Depois das ${deadlineLabel}, esses kits saem para quem entrar, inclusive da fila.` : ""} Quem da fila já tinha entrado pode receber pelo botão Entregar agora.`,
    },
    {
      icon: Warning,
      title: "Acabou na porta",
      text: "Se o estoque físico acabar (ex.: kits a menos do que o cadastrado), a pessoa entra do mesmo jeito, sem kit. Repôs? Entregue pelo botão no cadastro dela.",
    },
    {
      icon: Heart,
      title: "Menor de 18",
      text: "A portaria vê o aviso. Se o kit tem bebida alcoólica, monte o kit de menor em Montagem e custo para comprar a quantidade certa.",
    },
  ];
  return (
    <details className="group rounded-2xl border border-line bg-gradient-to-b from-surface to-ink-2 p-4 sm:p-5" data-testid="kit-rules">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="display flex items-center gap-2 text-[1.35rem] text-fg">
          <Notebook className="size-5 text-red" /> Como funcionam os kits
        </span>
        <span className="pixel text-[0.5rem] text-fg-dim group-open:hidden">Abrir</span>
        <span className="pixel hidden text-[0.5rem] text-fg-dim group-open:inline">Fechar</span>
      </summary>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {rules.map((rule) => (
          <li key={rule.title} className="flex items-start gap-3 rounded-xl border border-line bg-ink/40 p-3">
            <rule.icon className="mt-0.5 size-5 shrink-0 text-red" />
            <span>
              <span className="block text-sm font-bold text-fg">{rule.title}</span>
              <span className="block text-sm text-fg-muted">{rule.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
