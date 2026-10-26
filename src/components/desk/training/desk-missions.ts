import { toSearchText } from "@/lib/text";
import type { DeskView } from "@/server/services/desk";
import type { DeskQueueRow } from "../queue-row";
import { EDITION, T } from "@/domain/edition";
import { sharedKitMessage } from "@/domain/labels";

/*
 * Treino da mesa dos kits: cada missão é uma pessoa que chega na mesa. A
 * pessoa do treino acha quem chegou (pelo nome, CPF ou código do voucher, como
 * na mesa de verdade), confere o cartão e faz a coisa certa. Nada é gravado.
 */

export interface DeskTrainingContext {
  /** Kits guardados até este horário ("22:00"); null = guardados a festa toda. */
  kitDeadline: string | null;
  /** A montagem tem kit próprio para menor de 18. */
  minorKit: boolean;
  /** Kit dividido (um por inscrição, para os dois); sem valor, o da festa (`Edition.sharedKit`). */
  sharedKit?: boolean;
}

/** Quem aparece na busca do treino (a pessoa certa e uma de nome parecido). */
export interface RosterPerson {
  personId: string;
  fullName: string;
  cpf: string;
  voucherCode: string;
  entered: boolean;
}

/** O que a pessoa mostra na mesa: o voucher (QR + código) ou o documento. */
export interface Arrival {
  says: string;
  shows: { kind: "voucher"; code: string; walkIn?: boolean } | { kind: "cpf"; cpf: string };
  /** Dica para achar: o que digitar na busca. */
  hint: string;
}

export type MissionAction =
  /** Tocar em Entregar kit (no cartão de verdade). `crate`: depois, pegar o kit da caixa certa. */
  | { kind: "deliver"; crate?: { right: string; wrong: string } }
  /** O cartão não deixa entregar: escolher o que fazer. */
  | { kind: "choose"; right: string; wrong: string }
  /** Botão rápido da fila da mesa: Entregar, conferir na própria linha e confirmar. */
  | { kind: "quick" };

export interface DeskMission {
  id: string;
  title: string;
  arrival: Arrival;
  /** A pessoa certa e a de nome parecido, na ordem em que aparecem na busca. */
  roster: RosterPerson[];
  view: DeskView;
  action: MissionAction;
  /** Missão do botão rápido: a fila da mesa (`right` = quem chegou). */
  queue?: { row: DeskQueueRow; right: boolean; fresh: boolean }[];
  /** A regra, numa frase: aparece depois de responder e na cola do fim. */
  lesson: string;
}

const today = (hours: number, minutes: number) => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

function view(input: Partial<DeskView> & Pick<DeskView, "personId" | "fullName" | "kit">): DeskView {
  return {
    cpf: "***.456.789-**",
    voucherCode: null,
    isMinor: false,
    roleLabel: T.personAffiliated,
    category: "TEACHER",
    entry: { at: today(19, 42), byName: "Carlos (segurança)" },
    walkIn: false,
    kitsAtDesk: true,
    kitDeadline: null,
    ...input,
  };
}

function queueRow(personId: string, fullName: string, voucherCode: string, at: Date, guestOf: string | null = null): DeskQueueRow {
  return {
    personId,
    fullName,
    isMinor: false,
    checkedInAt: at.toISOString(),
    checkedInByName: "Carlos (segurança)",
    roleLabel: guestOf ? `Convidado(a) de ${guestOf}` : T.personAffiliated,
    category: guestOf ? "TEACHER_GUEST" : "TEACHER",
    hostName: guestOf,
    extra: false,
    waitlisted: false,
    voucherCode,
    quick: true,
  };
}

export function deskMissions(ctx: DeskTrainingContext): DeskMission[] {
  const deadline = ctx.kitDeadline ? { label: ctx.kitDeadline, passed: false } : null;
  // Kit dividido: o convidado de filiado(a) não tem kit próprio (nem aparece na fila da mesa).
  const shared = ctx.sharedKit ?? EDITION.sharedKit;
  const missions: DeskMission[] = [
    {
      id: "basico",
      title: "O básico",
      arrival: { says: `Oi! Sou a Ana Lima, ${T.femaleLower}. Vim pegar meu kit!`, shows: { kind: "voucher", code: "K7Q2-9MXA" }, hint: "Ana Lima" },
      roster: [
        { personId: "t-ana", fullName: "Ana Lima", cpf: "***.111.222-**", voucherCode: "K7Q2-9MXA", entered: true },
        { personId: "t-ana-2", fullName: "Ana Lia Lima Souto", cpf: "***.909.808-**", voucherCode: "P3RT-7KLM", entered: false },
      ],
      view: view({
        personId: "t-ana",
        fullName: "Ana Lima",
        cpf: "***.111.222-**",
        voucherCode: "K7Q2-9MXA",
        kitDeadline: deadline,
        kit: { kind: "READY", kitType: "MEMBER", pool: "ALL", extra: false, minor: false },
      }),
      action: { kind: "deliver" },
      lesson: "Achou, conferiu, entregou: o estoque baixa e o kit não sai de novo para ela.",
    },
    {
      id: "rapido",
      title: "O jeito rápido",
      arrival: { says: "Oi! Sou o João Pedro, a segurança acabou de me liberar.", shows: { kind: "voucher", code: "JP26-4XKA" }, hint: "" },
      roster: [],
      queue: [
        { right: false, fresh: true, row: queueRow("t-jpl", "João Paulo Lima", "QW7E-3RTY", today(20, 2)) },
        { right: true, fresh: true, row: queueRow("t-jp", "João Pedro Alves", "JP26-4XKA", today(20, 1)) },
        { right: false, fresh: false, row: queueRow("t-mc", "Maria Clara Souza", "MC55-8ZPD", today(19, 57), shared ? null : "Paulo Reis") },
      ],
      view: view({
        personId: "t-jp",
        fullName: "João Pedro Alves",
        voucherCode: "JP26-4XKA",
        kit: { kind: "READY", kitType: "MEMBER", pool: "ALL", extra: false, minor: false },
      }),
      action: { kind: "quick" },
      lesson: "Acabou de passar pela segurança? Já está no topo da fila: Entregar, confira nome e voucher e confirme.",
    },
    {
      id: "na-hora",
      title: "Voucher amarelo",
      arrival: {
        says: "Boa noite! Me inscrevi agora na porta, olha meu voucher.",
        shows: { kind: "voucher", code: "Z4WD-2HNE", walkIn: true },
        hint: "Z4WD-2HNE",
      },
      roster: [{ personId: "t-rafael", fullName: "Rafael Souza", cpf: "***.333.444-**", voucherCode: "Z4WD-2HNE", entered: true }],
      view: view({
        personId: "t-rafael",
        fullName: "Rafael Souza",
        cpf: "***.333.444-**",
        voucherCode: "Z4WD-2HNE",
        walkIn: true,
        entry: { at: today(20, 5), byName: "Carlos (segurança)" },
        kit: { kind: "READY", kitType: "MEMBER", pool: "EXTRA", extra: true, minor: false },
      }),
      action: { kind: "deliver", crate: { right: "Caixa da gordura", wrong: "Caixa oficial" } },
      lesson: "Voucher amarelo (Inscrição na hora): o kit sai da caixa da gordura.",
    },
    {
      id: "ja-pegou",
      title: "De novo?",
      arrival: { says: "Vim pegar meu kit.", shows: { kind: "cpf", cpf: "123.456.789-09" }, hint: "123.456.789-09" },
      roster: [{ personId: "t-beatriz", fullName: "Beatriz Costa", cpf: "123.456.789-09", voucherCode: "M8XC-4QPA", entered: true }],
      view: view({
        personId: "t-beatriz",
        fullName: "Beatriz Costa",
        cpf: "123.456.789-09",
        voucherCode: "M8XC-4QPA",
        kit: { kind: "DELIVERED", at: today(19, 50), byName: "Maria", extra: false },
      }),
      action: { kind: "choose", right: "Não entregar: ela já pegou às 19:50", wrong: "Entregar outro kit" },
      lesson: "Já pegou: não sai outro. Se a pessoa insistir, chame a organização.",
    },
    {
      id: "nao-entrou",
      title: "Pulou a porta",
      arrival: { says: "Cheguei agora, me dá meu kit?", shows: { kind: "voucher", code: "B6TN-8JRE" }, hint: "Marcos" },
      roster: [{ personId: "t-marcos", fullName: "Marcos Silva", cpf: "***.555.666-**", voucherCode: "B6TN-8JRE", entered: false }],
      view: view({
        personId: "t-marcos",
        fullName: "Marcos Silva",
        cpf: "***.555.666-**",
        voucherCode: "B6TN-8JRE",
        entry: null,
        kit: { kind: "NOT_ENTERED" },
      }),
      action: { kind: "choose", right: "Mandar para a segurança registrar a entrada", wrong: "Entregar o kit assim mesmo" },
      lesson: "Sem entrada validada, sem kit: a segurança registra a entrada primeiro.",
    },
    shared
      ? {
          id: "kit-dividido",
          title: "Convidada sozinha",
          arrival: {
            says: "Sou convidada da Carla Mendes. Ela ainda não chegou, posso pegar o meu kit?",
            shows: { kind: "voucher", code: "J2KF-6WPS" },
            hint: "Júlia",
          },
          roster: [{ personId: "t-julia", fullName: "Júlia Mendes", cpf: "Sem CPF", voucherCode: "J2KF-6WPS", entered: true }],
          view: view({
            personId: "t-julia",
            fullName: "Júlia Mendes",
            cpf: "Sem CPF",
            voucherCode: "J2KF-6WPS",
            roleLabel: "Convidado(a) de Carla Mendes",
            category: "TEACHER_GUEST",
            entry: { at: today(19, 58), byName: "Carlos (segurança)" },
            kit: { kind: "BLOCKED", code: "SHARED_KIT", message: `${sharedKitMessage("Carla Mendes")} Ele sai para Carla Mendes.`, leftover: false },
          }),
          action: { kind: "choose", right: "Explicar: o kit da Carla é para as duas", wrong: "Entregar um kit para a Júlia" },
          lesson: "Convidado não tem kit próprio: o kit de quem convidou é para os dois e sai para quem convidou.",
        }
      : {
          id: "convidada",
          title: "Convidada sozinha",
          arrival: {
            says: "Sou convidada da Carla Mendes. Ela ainda não chegou, posso pegar o meu?",
            shows: { kind: "voucher", code: "J2KF-6WPS" },
            hint: "Júlia",
          },
          roster: [{ personId: "t-julia", fullName: "Júlia Mendes", cpf: "Sem CPF", voucherCode: "J2KF-6WPS", entered: true }],
          view: view({
            personId: "t-julia",
            fullName: "Júlia Mendes",
            cpf: "Sem CPF",
            voucherCode: "J2KF-6WPS",
            roleLabel: "Convidado(a) de Carla Mendes",
            category: "TEACHER_GUEST",
            entry: { at: today(19, 58), byName: "Carlos (segurança)" },
            kit: { kind: "READY", kitType: "GUEST", pool: "ALL", extra: false, minor: false },
          }),
          action: { kind: "deliver" },
          lesson: "Convidado pega o próprio kit depois da entrada, sem esperar quem convidou.",
        },
  ];
  if (ctx.minorKit) {
    missions.push({
      id: "menor",
      title: "Menor de 18",
      arrival: { says: "Sou o Theo, vim com meu pai. Meu kit?", shows: { kind: "voucher", code: "T9MN-3BXQ" }, hint: "Theo" },
      roster: [{ personId: "t-theo", fullName: "Theo Barros", cpf: "Sem CPF", voucherCode: "T9MN-3BXQ", entered: true }],
      view: view({
        personId: "t-theo",
        fullName: "Theo Barros",
        cpf: "Sem CPF",
        voucherCode: "T9MN-3BXQ",
        isMinor: true,
        // Kit dividido: convidado de filiado(a) não tem kit próprio; o de colaborador(a), sim.
        roleLabel: shared ? "Convidado(a) de André Barros (colaborador)" : "Convidado(a) de André Barros",
        category: shared ? "EMPLOYEE_GUEST" : "TEACHER_GUEST",
        kit: { kind: "READY", kitType: "GUEST", pool: shared ? "EMPLOYEE" : "ALL", extra: false, minor: true },
      }),
      action: { kind: "deliver", crate: { right: "Kit de menor de 18", wrong: "Kit comum" } },
      lesson: "Menor de 18: entregue o kit de menor (o cartão avisa).",
    });
  }
  return missions;
}

/** A busca do treino: nome (sem acento), código do voucher ou CPF, como na mesa. */
export function searchRoster(roster: RosterPerson[], query: string): RosterPerson[] {
  const plain = toSearchText;
  const text = plain(query.trim());
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  const code = text.replace(/[^a-z0-9]/g, "");
  return roster.filter(
    (person) =>
      plain(person.fullName).includes(text) ||
      (code.length >= 4 && plain(person.voucherCode).replace(/[^a-z0-9]/g, "").includes(code)) ||
      (digits.length >= 3 && person.cpf.replace(/\D/g, "").includes(digits)),
  );
}
