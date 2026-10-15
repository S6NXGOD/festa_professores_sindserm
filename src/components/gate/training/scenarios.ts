import { ENTRY_BLOCK_MESSAGE, ENTRY_KIT_MESSAGE, KIT_BLOCK_MESSAGE, KIT_TYPE_LABEL } from "@/domain/labels";
import type { KitBlockCode } from "@/domain/rules";
import type { AffiliationStatus } from "@/domain/types";
import { formatDateTime } from "@/lib/datetime";
import type { EntryKitResult } from "@/server/services/checkin";
import type { GateView, GuestView, KitOnEntry, KitView } from "@/server/services/gate-view";

/*
 * Treino da portaria: situações da porta com a mesma tela da portaria de
 * verdade (o cartão é o componente real, com dados de mentira). A resposta
 * certa depende do que a pessoa pode fazer no sistema (ex.: quem confere
 * filiação resolve ali mesmo; quem não confere encaminha ao Atendimento).
 */

/** O que a pessoa pode fazer na portaria (muda a resposta certa de algumas situações). */
export interface TrainingAbilities {
  /** Conferir filiação (Inscrições: editar). */
  resolve: boolean;
  /** Fichas: imprimir, anexar e confirmar a assinatura. */
  forms: boolean;
  /** Cadastro rápido de quem chegou sem inscrição. */
  register: boolean;
  /** Cortesia na portaria. */
  courtesy: boolean;
}

export interface TrainingContext {
  abilities: TrainingAbilities;
  /** Kits guardados até este horário ("22:30"); null = guardados a festa toda. */
  kitDeadline: { label: string; at: string } | null;
  /** Início da festa ("19h") e o instante (as horas de mentira partem dele). */
  startClock: string | null;
  startsAt: string | null;
  /** A montagem tem kit próprio para menor de 18. */
  minorKit: boolean;
}

export interface TrainingOption {
  label: string;
  correct: boolean;
  /** Por que está certo ou errado (aparece depois de responder). */
  why: string;
}

export type TrainingScreen =
  /** O cartão da portaria (o mesmo da leitura do QR). */
  | { kind: "card"; view: GateView }
  /** A faixa vermelha de QR que não vale. */
  | { kind: "problem"; title: string; detail: string }
  /** O leitor aberto, com a busca e o código embaixo. */
  | { kind: "scanner" }
  /** A busca da portaria sem ninguém encontrado (com os botões que a pessoa vê de verdade). */
  | { kind: "search"; query: string; register: boolean; courtesy: boolean }
  /** O cartão com o aviso de "a festa ainda não começou" por cima. */
  | { kind: "early"; view: GateView };

export interface TrainingScenario {
  id: string;
  phase: string;
  story: string;
  screen: TrainingScreen;
  options: TrainingOption[];
  /** A tela depois da ação certa (entrada confirmada e o que saiu de kit). */
  after?: { view: GateView; entryKit: EntryKitResult; entryGuestKit?: EntryKitResult | null };
  /** A regra, numa linha, para guardar. */
  lesson: string;
}

const PHASES = { basics: "O básico", stops: "Quando trava", special: "Casos especiais" } as const;

const blocked = (code: KitBlockCode, message = KIT_BLOCK_MESSAGE[code]): KitView => ({ kind: "BLOCKED", code, message });

function delivered(at: Date, beneficiaryName: string, byName = "Você"): KitView {
  return { kind: "DELIVERED", deliveryId: "treino", at, byName, beneficiaryName };
}

function guest(fullName: string, checkedIn: boolean, isMinor = false): GuestView {
  return { guestLinkId: "treino-convidado", personId: "treino-convidado", fullName, isMinor, checkedIn, replaceable: !checkedIn };
}

function deliveredKit(kitType: "MEMBER" | "GUEST" | "EMPLOYEE", beneficiaryName: string, available = 214, low = false): EntryKitResult {
  return { kind: "DELIVERED", kitType, beneficiaryName, available, low, pool: "ALL" };
}

function willDeliver(count: 1 | 2, label: string, detail: string, minors = 0): KitOnEntry {
  return minors > 0 ? { kind: "WILL_DELIVER", count, label, detail, minors } : { kind: "WILL_DELIVER", count, label, detail };
}

function teacher(status: AffiliationStatus, kits: { MEMBER: KitView; GUEST: KitView }, guestView: GuestView | null = null) {
  return { id: "treino-inscricao", status, isTeacher: true, canHaveGuest: true, guest: guestView, kits };
}

/** Embaralha as respostas sem sorteio de verdade (o mesmo no servidor e no navegador). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = (seed * 7919 + 17) % 233280;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 9301 + 49297) % 233280;
    const j = Math.floor((state / 233280) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function trainingScenarios(ctx: TrainingContext): TrainingScenario[] {
  const { abilities } = ctx;
  const start = ctx.startsAt ? new Date(ctx.startsAt).getTime() : Date.UTC(2026, 9, 16, 22, 0);
  /** Horas de mentira, contadas do início da festa. */
  const at = (minutes: number) => new Date(start + minutes * 60_000);
  const deadline = ctx.kitDeadline;
  const dl = deadline?.label ?? null;

  const view = (over: Partial<GateView>): GateView => ({
    eventStart: { started: true, label: null, at: null },
    personId: "treino",
    fullName: "Ana Lima",
    cpf: "***.482.917-**",
    hasCpf: true,
    isMinor: false,
    voucherCode: "K7F3-9QXA",
    role: "MEMBER",
    ownRegistration: null,
    employee: null,
    host: null,
    guestKit: null,
    kitDeadline: deadline ? { at: new Date(deadline.at), passed: false } : null,
    minorKit: ctx.minorKit,
    entry: { kind: "ALLOWED", role: "MEMBER" },
    kitOnEntry: null,
    pastGuestLinks: [],
    openAffiliationForm: null,
    permissions: {
      checkIn: true,
      validateAffiliation: false,
      deliverKits: false,
      manageGuests: false,
      newAffiliation: false,
      registerAtEvent: false,
      adminCorrections: false,
      manageEmployees: false,
    },
    ...over,
  });

  /** A mesma pessoa, logo depois de "Confirmar entrada". */
  const entered = (before: GateView, minutes: number, over: Partial<GateView> = {}): GateView => ({
    ...before,
    entry: { kind: "ALREADY_IN", at: at(minutes), byName: "Você", method: "QR" },
    kitOnEntry: null,
    ...over,
  });

  const blockedEntry = (code: keyof typeof ENTRY_BLOCK_MESSAGE): GateView["entry"] => ({ kind: "BLOCKED", code, ...ENTRY_BLOCK_MESSAGE[code] });

  const scenarios: TrainingScenario[] = [];

  // ——— O básico ———
  const ana = view({
    ownRegistration: teacher("CONFIRMED", { MEMBER: blocked("MEMBER_NOT_CHECKED_IN"), GUEST: blocked("GUEST_NOT_CHECKED_IN") }, guest("Bruno Lima", false)),
    kitOnEntry: willDeliver(1, "1 kit de consumação", KIT_TYPE_LABEL.MEMBER),
  });
  scenarios.push({
    id: "liberado",
    phase: PHASES.basics,
    story: "Ana Lima, professora, chegou e mostrou o QR Code do voucher.",
    screen: { kind: "card", view: ana },
    options: [
      {
        label: "Toco em Confirmar entrada e entrego 1 kit",
        correct: true,
        why: "Isso! O botão verde já diz quantos kits saem. Confirmou, o estoque baixa sozinho: ninguém anota retirada de kit.",
      },
      {
        label: "Confirmo e mando ela buscar o kit em outro lugar",
        correct: false,
        why: "Não: o kit sai ali mesmo, junto com a entrada. Não existe outro ponto de retirada.",
      },
      {
        label: "Peço um documento com foto antes de liberar",
        correct: false,
        why: "Não precisa: o QR do voucher já identifica a pessoa. O aviso amarelo pede só para conferir, de olho, se ela é mesmo professora.",
      },
    ],
    after: {
      view: entered(ana, 12, {
        ownRegistration: teacher("CONFIRMED", { MEMBER: delivered(at(12), "Ana Lima"), GUEST: blocked("GUEST_NOT_CHECKED_IN") }, guest("Bruno Lima", false)),
      }),
      entryKit: deliveredKit("MEMBER", "Ana Lima"),
    },
    lesson: "LIBERADO (verde): Confirmar entrada. O kit sai junto, na hora.",
  });

  const paulo = view({
    fullName: "Paulo Reis",
    cpf: "***.193.554-**",
    voucherCode: "P4UL-0R3S",
    ownRegistration: teacher(
      "CONFIRMED",
      { MEMBER: blocked("MEMBER_NOT_CHECKED_IN"), GUEST: blocked("HOST_NOT_CHECKED_IN") },
      guest("Lucas Reis", true),
    ),
    kitOnEntry: willDeliver(2, "2 kits: o de Paulo e o do convidado Lucas Reis, que já entrou", "O de Paulo e o do convidado Lucas Reis, que já entrou"),
  });
  scenarios.push({
    id: "dois-kits",
    phase: PHASES.basics,
    story: "Paulo Reis, professor, chegou agora. O convidado dele, Lucas, entrou há 20 minutos, sem kit: o Paulo ainda não tinha chegado.",
    screen: { kind: "card", view: paulo },
    options: [
      {
        label: "Confirmo e entrego 2 kits ao Paulo: um é do Lucas",
        correct: true,
        why: "Isso! O kit do convidado espera quem convidou. Quando o Paulo entra, os dois saem juntos e ele leva o do Lucas.",
      },
      {
        label: "Entrego só o do Paulo; o Lucas volta aqui depois",
        correct: false,
        why: "Não: a tela já diz 2 kits. O do Lucas sai agora, junto com a entrada do Paulo.",
      },
      {
        label: "Não entrego o do Lucas, porque ele já entrou",
        correct: false,
        why: "O Lucas entrou sem kit justamente para esperar o Paulo. Agora é a vez do kit dele.",
      },
    ],
    after: {
      view: entered(paulo, 40, {
        ownRegistration: teacher(
          "CONFIRMED",
          { MEMBER: delivered(at(40), "Paulo Reis"), GUEST: delivered(at(40), "Lucas Reis") },
          guest("Lucas Reis", true),
        ),
      }),
      entryKit: deliveredKit("MEMBER", "Paulo Reis", 212),
      entryGuestKit: deliveredKit("GUEST", "Lucas Reis", 211),
    },
    lesson: "O kit do convidado sai quando quem convidou chega (às vezes, 2 kits de uma vez).",
  });

  const julia = view({
    fullName: "Júlia Mendes",
    cpf: "Sem CPF",
    hasCpf: false,
    voucherCode: "JU7A-M3ND",
    role: "GUEST",
    host: {
      kind: "MEMBER",
      category: null,
      registrationId: "treino-carla",
      employeeId: null,
      guestLinkId: "treino-convidado",
      personId: "treino-carla",
      fullName: "Carla Mendes",
      status: "CONFIRMED",
      active: true,
      checkedIn: false,
    },
    guestKit: { delivered: false, deliveredAt: null, deliveredForOther: false },
    entry: { kind: "ALLOWED", role: "GUEST" },
    kitOnEntry: { kind: "WAITING", message: "O kit deste convidado sai quando Carla Mendes chegar." },
  });
  scenarios.push({
    id: "convidado-antes",
    phase: PHASES.basics,
    story: "Júlia Mendes é convidada da professora Carla Mendes. Chegou sozinha: a Carla ainda não entrou.",
    screen: { kind: "card", view: julia },
    options: [
      {
        label: "Confirmo a entrada da Júlia, sem kit por enquanto",
        correct: true,
        why: "Isso! Convidado de professora liberada já pode entrar. O kit da Júlia sai quando a Carla chegar (a Carla leva para ela).",
      },
      {
        label: "Peço para a Júlia esperar a Carla do lado de fora",
        correct: false,
        why: "Não precisa: a Júlia já está liberada. Só o kit dela espera.",
      },
      {
        label: "Entrego o kit da Júlia agora",
        correct: false,
        why: "Ainda não: o kit do convidado só sai quando quem convidou chega.",
      },
    ],
    after: {
      view: entered(julia, 25),
      entryKit: { kind: "WAITING", message: "O kit deste convidado sai quando Carla Mendes chegar." },
    },
    lesson: "Convidado pode entrar antes. O kit espera quem convidou.",
  });

  scenarios.push({
    id: "sem-qr",
    phase: PHASES.basics,
    story: "O celular do professor Diego Rocha descarregou, e ele não imprimiu o voucher.",
    screen: { kind: "scanner" },
    options: [
      {
        label: "Toco em Buscar nome/CPF, acho o Diego e confirmo",
        correct: true,
        why: "Isso! A busca acha pelo nome, CPF ou código do voucher. A entrada fica anotada como pesquisa manual.",
      },
      {
        label: "Peço para ele carregar o celular e voltar",
        correct: false,
        why: "Não precisa: a busca resolve em segundos.",
      },
      {
        label: "Deixo entrar sem registrar",
        correct: false,
        why: "Não: sem registro, o kit não sai e o placar fica errado.",
      },
    ],
    lesson: "Sem QR? Busca por nome, CPF ou código do voucher.",
  });

  // ——— Quando trava ———
  scenarios.push({
    id: "conferencia",
    phase: PHASES.stops,
    story: "Marcos Silva disse na inscrição que é filiado, mas a filiação dele ainda não foi conferida.",
    screen: {
      kind: "card",
      view: view({
        fullName: "Marcos Silva",
        cpf: "***.771.306-**",
        voucherCode: "M4RC-0S1L",
        ownRegistration: teacher("PENDING", { MEMBER: blocked("NOT_ACTIVE_MEMBER"), GUEST: blocked("NOT_ACTIVE_MEMBER") }),
        entry: blockedEntry("MEMBER_PENDING"),
      }),
    },
    options: [
      abilities.resolve
        ? {
            label: "Confiro e toco em Confirmar filiação (logo abaixo do cartão)",
            correct: true,
            why: "Isso! Você pode conferir: confirmada a filiação, a tela vira LIBERADO e a entrada sai com o kit.",
          }
        : {
            label: "Encaminho o Marcos ao Atendimento",
            correct: true,
            why: "Isso! A faixa amarela não deixa registrar a entrada. O Atendimento confere a filiação e ele volta liberado.",
          },
      {
        label: "Deixo entrar e anoto para conferir depois",
        correct: false,
        why: "Não: sem a filiação conferida, a entrada não pode ser registrada.",
      },
      {
        label: "Faço uma inscrição nova para ele",
        correct: false,
        why: "Não: ele já tem inscrição. O caminho é conferir a filiação.",
      },
    ],
    lesson: "AMARELO: falta resolver algo antes de entrar.",
  });

  scenarios.push({
    id: "ficha",
    phase: PHASES.stops,
    story: "Rosa Alves preencheu a ficha de filiação no site e veio assinar na festa.",
    screen: {
      kind: "card",
      view: view({
        fullName: "Rosa Alves",
        cpf: "***.208.649-**",
        voucherCode: "R0SA-4LV5",
        ownRegistration: teacher("AWAITING_SIGNATURE", { MEMBER: blocked("NOT_ACTIVE_MEMBER"), GUEST: blocked("NOT_ACTIVE_MEMBER") }),
        entry: blockedEntry("MEMBER_AWAITING_SIGNATURE"),
      }),
    },
    options: [
      abilities.forms
        ? {
            label: "Imprimo a ficha, ela assina e eu toco em Confirmar assinatura",
            correct: true,
            why: "Isso! Sem a cópia do RG e do contracheque, o botão fica travado: aí é preciso anexar antes.",
          }
        : {
            label: "Encaminho a Rosa ao Atendimento para assinar",
            correct: true,
            why: "Isso! O Atendimento imprime a ficha, ela assina e a entrada é liberada na hora.",
          },
      {
        label: "Deixo entrar: assinar é só um detalhe",
        correct: false,
        why: "Não: a filiação só vale com a ficha assinada. Até lá, a entrada fica travada.",
      },
      {
        label: "Peço para ela voltar em outro dia",
        correct: false,
        why: "Não: dá para assinar ali mesmo, na festa.",
      },
    ],
    lesson: "Ficha para assinar: assina no Atendimento e entra na hora.",
  });

  scenarios.push({
    id: "nao-confirmada",
    phase: PHASES.stops,
    story: "A conferência não encontrou a filiação de Sandra Melo, e ela está na sua frente.",
    screen: {
      kind: "card",
      view: view({
        fullName: "Sandra Melo",
        cpf: "***.655.120-**",
        voucherCode: "S4ND-M3L0",
        ownRegistration: teacher("REJECTED", { MEMBER: blocked("NOT_ACTIVE_MEMBER"), GUEST: blocked("NOT_ACTIVE_MEMBER") }),
        entry: blockedEntry("MEMBER_REJECTED"),
      }),
    },
    options: [
      abilities.resolve
        ? {
            label: "Se ela comprovar (ex.: contracheque com o desconto), confirmo ali mesmo",
            correct: true,
            why: "Isso! Com a comprovação, confirme no cartão dela. Sem comprovação, ela pode se filiar ou entrar como convidada de um(a) professor(a).",
          }
        : {
            label: "Encaminho ao Atendimento, que vê a comprovação",
            correct: true,
            why: "Isso! Se ela comprovar que é filiada (ex.: contracheque com o desconto do SINDSERM), o Atendimento confirma na hora.",
          },
      {
        label: "Deixo entrar, porque ela diz que é filiada",
        correct: false,
        why: "Não: vermelho é parada. Sem confirmação, a entrada não sai.",
      },
      {
        label: "Mando embora sem explicar",
        correct: false,
        why: "Não: ela ainda tem saída. A faixa vermelha diz o que fazer: comprovar, se filiar ou entrar como convidada.",
      },
    ],
    lesson: "VERMELHO: parou. A faixa diz o motivo e o que fazer.",
  });

  scenarios.push({
    id: "ja-entrou",
    phase: PHASES.stops,
    story: "Alguém mostra o QR de Beatriz Costa. Só que esse QR já foi usado hoje.",
    screen: {
      kind: "card",
      view: view({
        fullName: "Beatriz Costa",
        cpf: "***.940.381-**",
        voucherCode: "B34T-C0ST",
        ownRegistration: teacher("CONFIRMED", { MEMBER: delivered(at(64), "Beatriz Costa", "Joana"), GUEST: blocked("NO_GUEST") }),
        entry: { kind: "ALREADY_IN", at: at(64), byName: "Joana", method: "QR" },
      }),
    },
    options: [
      {
        label: "Confiro se é a mesma pessoa e não registro de novo",
        correct: true,
        why: "Isso! Entrada e kit não saem duas vezes. Se quem está na sua frente não for a Beatriz, chame a organização.",
      },
      {
        label: "Registro de novo para sair outro kit",
        correct: false,
        why: "Não dá: a entrada já está registrada e o kit já saiu.",
      },
      {
        label: "Peço para a pessoa se inscrever de novo",
        correct: false,
        why: "Não: a Beatriz já tem inscrição e já entrou.",
      },
    ],
    lesson: "ENTRADA JÁ REGISTRADA: confira quem é. Nada sai de novo.",
  });

  scenarios.push({
    id: "qr-cancelado",
    phase: PHASES.stops,
    story: "A pessoa mostra um print antigo do voucher. Ontem ela pediu um link novo.",
    screen: {
      kind: "problem",
      title: "QR CODE CANCELADO",
      detail: `Este voucher foi cancelado em ${formatDateTime(at(-22 * 60))}. Localize a pessoa pela busca.`,
    },
    options: [
      {
        label: "Busco a pessoa pelo nome ou CPF e confirmo por lá",
        correct: true,
        why: "Isso! Só aquele QR antigo deixou de valer. Pela busca (ou com o voucher novo), a entrada sai normal.",
      },
      {
        label: "Mando embora: o QR está cancelado",
        correct: false,
        why: "Não: a pessoa continua inscrita. Só o QR antigo deixou de valer.",
      },
      {
        label: "Deixo passar sem registrar",
        correct: false,
        why: "Não: toda entrada é registrada (é o que solta o kit e conta no placar).",
      },
    ],
    lesson: "QR cancelado ou não encontrado: use a busca.",
  });

  // ——— Casos especiais ———
  scenarios.push({
    id: "sem-inscricao",
    phase: PHASES.special,
    story: "Helena Prado, professora, chegou sem ter feito inscrição. Na busca, o nome dela não aparece.",
    screen: { kind: "search", query: "Helena Prado", register: abilities.register, courtesy: abilities.courtesy },
    options: [
      abilities.register
        ? {
            label: "Toco em Cadastrar agora e, depois, confirmo a entrada",
            correct: true,
            why: "Isso! O cadastro rápido já vem com o nome digitado e funciona mesmo com as inscrições do site encerradas.",
          }
        : {
            label: "Chamo o Atendimento para o cadastro rápido",
            correct: true,
            why: "Isso! O Atendimento cadastra na hora (mesmo com o site encerrado) e ela entra em seguida.",
          },
      {
        label: "Deixo entrar sem cadastro",
        correct: false,
        why: "Não: sem cadastro não há entrada registrada, nem kit.",
      },
      {
        label: "Peço para ela se inscrever pelo site",
        correct: false,
        why: "Não: na festa, quem cadastra é a equipe (o site pode já estar encerrado).",
      },
    ],
    lesson: "Sem inscrição: cadastro rápido, feito pela equipe.",
  });

  scenarios.push({
    id: "fora-da-lista",
    phase: PHASES.special,
    story: "A organização pede para deixar entrar Sônia Freitas, amiga da diretoria. Ela não está em nenhuma lista.",
    screen: { kind: "search", query: "Sônia Freitas", register: abilities.register, courtesy: abilities.courtesy },
    options: [
      abilities.courtesy
        ? {
            label: "Toco em Entrar como cortesia (com ou sem kit, como a organização disser)",
            correct: true,
            why: "Isso! A cortesia ganha voucher próprio e a entrada fica registrada.",
          }
        : {
            label: "Chamo quem pode cadastrar cortesia",
            correct: true,
            why: "Isso! Cortesia é cadastrada por quem tem essa permissão (a organização ou o(a) responsável pela porta).",
          },
      {
        label: "Deixo entrar sem registrar",
        correct: false,
        why: "Não: toda entrada fica registrada.",
      },
      {
        label: "Cadastro como professora para sair kit",
        correct: false,
        why: "Não: cada pessoa na categoria certa. Cortesia é cortesia (com kit, se a organização disser).",
      },
    ],
    lesson: "Fora da lista, com o ok da organização: cortesia.",
  });

  const lia = view({
    fullName: "Lia Santos",
    cpf: "***.317.062-**",
    voucherCode: "L14S-4NT0",
    eventStart: { started: false, label: ctx.startClock ? `hoje, às ${ctx.startClock}` : null, at: ctx.startsAt },
    ownRegistration: teacher("CONFIRMED", { MEMBER: blocked("MEMBER_NOT_CHECKED_IN"), GUEST: blocked("NO_GUEST") }),
    kitOnEntry: willDeliver(1, "1 kit de consumação", KIT_TYPE_LABEL.MEMBER),
  });
  scenarios.push({
    id: "antes-da-hora",
    phase: PHASES.special,
    story: `Faltam 20 minutos para a festa começar${ctx.startClock ? ` (${ctx.startClock})` : ""}. Lia Santos, professora, está liberada e você tocou em Confirmar entrada.`,
    screen: { kind: "early", view: lia },
    options: [
      {
        label: "Toco em Esperar o horário (só registro antes se a organização liberar)",
        correct: true,
        why: "Isso! A regra é registrar entradas só a partir do início. Se a organização liberar antes, toque em Registrar mesmo assim: fica anotado na auditoria.",
      },
      {
        label: "Toco em Registrar mesmo assim, sem falar com ninguém",
        correct: false,
        why: "Não: antes do horário, só com a organização liberando. E fica anotado quem registrou.",
      },
      {
        label: "Deixo entrar agora e registro quando começar",
        correct: false,
        why: "Não: a entrada é registrada na hora em que a pessoa entra (o kit sai junto).",
      },
    ],
    lesson: "Antes do horário: espere, ou registre só com a organização liberando (fica anotado).",
  });

  const fabiana = view({
    fullName: "Fabiana Nunes",
    cpf: "***.580.734-**",
    voucherCode: "F4B1-NUN3",
    ownRegistration: teacher("CONFIRMED", {
      MEMBER: blocked("KIT_WAITLIST", "Na fila do kit (inscrição depois que os kits acabaram): só sai se vagar kit."),
      GUEST: blocked("NO_GUEST"),
    }),
    kitOnEntry: { kind: "NONE", message: ENTRY_KIT_MESSAGE.KIT_WAITLIST },
  });
  scenarios.push({
    id: "fila-do-kit",
    phase: PHASES.special,
    story: "Fabiana Nunes se inscreveu depois que os kits acabaram: o kit dela está na fila do kit.",
    screen: { kind: "card", view: fabiana },
    options: [
      {
        label: dl ? `Confirmo sem kit e explico: depois das ${dl}, se sobrar, sai` : "Confirmo sem kit e explico: só sai se sobrar",
        correct: true,
        why: dl
          ? `Isso! A entrada é normal. Até as ${dl}, cada kit está guardado para quem se inscreveu antes; depois, as sobras saem para quem entrar, por ordem de chegada.`
          : "Isso! A entrada é normal. Se sobrar kit de quem não veio, a equipe dos kits pode entregar pelo botão Entregar kit de sobra.",
      },
      {
        label: "Não deixo entrar, porque está sem kit",
        correct: false,
        why: "Não: a fila é só do kit. A entrada vale normalmente.",
      },
      {
        label: "Pego o kit de outra pessoa e entrego",
        correct: false,
        why: dl ? `Não: até as ${dl}, cada kit está guardado para quem se inscreveu.` : "Não: cada kit está guardado para quem se inscreveu.",
      },
    ],
    after: { view: entered(fabiana, 30), entryKit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.KIT_WAITLIST } },
    lesson: "Fila do kit: entra normal; o kit só sai se sobrar.",
  });

  if (deadline && dl) {
    const rafael = view({
      fullName: "Rafael Lopes",
      cpf: "***.402.875-**",
      voucherCode: "R4F4-L0P3",
      kitDeadline: { at: new Date(deadline.at), passed: true },
      ownRegistration: teacher("CONFIRMED", { MEMBER: blocked("MEMBER_NOT_CHECKED_IN"), GUEST: blocked("NO_GUEST") }),
      kitOnEntry: willDeliver(1, "1 kit de consumação", KIT_TYPE_LABEL.MEMBER),
    });
    scenarios.push({
      id: "sobras",
      phase: PHASES.special,
      story: `Já passou das ${dl}. Rafael Lopes, que estava na fila do kit, chegou agora.`,
      screen: { kind: "card", view: rafael },
      options: [
        {
          label: "Confirmo e entrego o kit: agora as sobras saem por ordem de chegada",
          correct: true,
          why: "Isso! A tela já diz Entregue 1 kit. Quando o estoque acabar, ela avisa: Sem kit, o estoque acabou.",
        },
        {
          label: "Não entrego: ele estava na fila do kit",
          correct: false,
          why: `Depois das ${dl}, a fila não espera mais: quem chega leva, enquanto houver.`,
        },
        {
          label: "Guardo o kit para quem se inscreveu antes e ainda não veio",
          correct: false,
          why: `Depois das ${dl}, os kits não ficam mais guardados. Vale a ordem de chegada.`,
        },
      ],
      after: {
        view: entered(rafael, 240, {
          ownRegistration: teacher("CONFIRMED", { MEMBER: delivered(at(240), "Rafael Lopes"), GUEST: blocked("NO_GUEST") }),
        }),
        entryKit: deliveredKit("MEMBER", "Rafael Lopes", 3, true),
      },
      lesson: `Depois das ${dl}: sobras por ordem de chegada, enquanto houver.`,
    });
  }

  const theo = view({
    fullName: "Theo Barros",
    cpf: "Sem CPF",
    hasCpf: false,
    isMinor: true,
    voucherCode: "TH30-B4RR",
    role: "GUEST",
    host: {
      kind: "MEMBER",
      category: null,
      registrationId: "treino-andre",
      employeeId: null,
      guestLinkId: "treino-convidado",
      personId: "treino-andre",
      fullName: "André Barros",
      status: "CONFIRMED",
      active: true,
      checkedIn: true,
    },
    guestKit: { delivered: false, deliveredAt: null, deliveredForOther: false },
    entry: { kind: "ALLOWED", role: "GUEST" },
    kitOnEntry: willDeliver(1, "1 kit de convidado", KIT_TYPE_LABEL.GUEST, 1),
  });
  scenarios.push({
    id: "menor",
    phase: PHASES.special,
    story: "Theo Barros, de 16 anos, é convidado do professor André Barros, que já entrou.",
    screen: { kind: "card", view: theo },
    options: ctx.minorKit
      ? [
          {
            label: "Confirmo e entrego o kit de menor de 18",
            correct: true,
            why: "Isso! A montagem tem um kit próprio para menores, e o cartão avisa em amarelo. Entregue esse, não o comum.",
          },
          {
            label: "Entrego o kit comum, igual ao dos outros",
            correct: false,
            why: "Não: para menor de 18 existe o kit de menor (o cartão avisa).",
          },
          {
            label: "Não deixo entrar: é menor de idade",
            correct: false,
            why: "Não: menor pode entrar como convidado. O aviso é para o kit e para ficar de olho.",
          },
        ]
      : [
          {
            label: "Confirmo, entrego o kit e fico de olho: é menor de idade",
            correct: true,
            why: "Isso! O aviso MENOR DE 18 é para a equipe ficar atenta (ex.: bebida alcoólica). Se a organização montar um kit de menor, o cartão passa a dizer qual entregar.",
          },
          {
            label: "Não deixo entrar: é menor de idade",
            correct: false,
            why: "Não: menor pode entrar como convidado. O aviso é para ficar de olho.",
          },
          {
            label: "Ignoro o aviso: o QR está liberado",
            correct: false,
            why: "Não: o aviso existe para a equipe ficar atenta (ex.: bebida alcoólica).",
          },
        ],
    after: { view: entered(theo, 70, { guestKit: { delivered: true, deliveredAt: at(70), deliveredForOther: false } }), entryKit: deliveredKit("GUEST", "Theo Barros") },
    lesson: ctx.minorKit ? "MENOR DE 18: entregue o kit de menor." : "MENOR DE 18: atenção redobrada.",
  });

  const vera = view({
    fullName: "Vera Dias",
    cpf: "***.836.517-**",
    voucherCode: "V3R4-D14S",
    role: "EMPLOYEE",
    employee: {
      employeeId: "treino-cortesia",
      active: true,
      jobTitle: null,
      category: "COURTESY",
      guest: null,
      kits: { EMPLOYEE: blocked("WITHOUT_KIT"), GUEST: blocked("NO_GUEST") },
      withKit: false,
      broughtBy: null,
      companions: [],
    },
    entry: { kind: "ALLOWED", role: "EMPLOYEE" },
    kitOnEntry: { kind: "NONE", message: ENTRY_KIT_MESSAGE.WITHOUT_KIT },
  });
  scenarios.push({
    id: "cortesia-sem-kit",
    phase: PHASES.special,
    story: "Vera Dias foi cadastrada pela organização como cortesia, sem kit.",
    screen: { kind: "card", view: vera },
    options: [
      {
        label: "Confirmo a entrada, sem kit",
        correct: true,
        why: "Isso! A cortesia sem kit foi combinada no cadastro. A entrada vale normalmente.",
      },
      {
        label: "Entrego um kit mesmo assim",
        correct: false,
        why: "Não: ela foi cadastrada sem kit. Se a organização mudar isso, muda no cadastro dela.",
      },
      {
        label: "Não deixo entrar, porque está sem kit",
        correct: false,
        why: "Não: sem kit não quer dizer sem entrada.",
      },
    ],
    after: { view: entered(vera, 55), entryKit: { kind: "NONE", message: ENTRY_KIT_MESSAGE.WITHOUT_KIT } },
    lesson: "Sem kit não é sem entrada.",
  });

  return scenarios;
}
