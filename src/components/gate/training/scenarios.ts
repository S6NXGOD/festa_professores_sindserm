import { ENTRY_BLOCK_MESSAGE } from "@/domain/labels";
import { EDITION, GAME, T } from "@/domain/edition";

/*
 * Treino relâmpago da portaria: 8 situações em cartões curtos, com as mesmas
 * cores e títulos da portaria de verdade, e 2 respostas cada. A resposta certa
 * segue o que a pessoa pode fazer (quem não confere filiação encaminha ao
 * Atendimento). Errou, a situação volta no fim.
 */

export interface TrainingContext {
  /** Confere filiação (Inscrições: editar): resolve o amarelo ali mesmo. */
  resolve: boolean;
  /** Kits guardados até este horário ("22:30"); null = guardados a festa toda. */
  kitDeadline: string | null;
  /** A montagem tem kit próprio para menor de 18. */
  minorKit: boolean;
  /** O kit sai na mesa dos kits: a portaria só registra a entrada e manda a pessoa à mesa. */
  kitsAtDesk?: boolean;
  /** Kit dividido (um por inscrição, para os dois); sem valor, o da festa (`Edition.sharedKit`). */
  sharedKit?: boolean;
}

export type CardTone = "success" | "warning" | "danger";

/** O cartão da portaria, resumido: a faixa colorida, quem é e o que sai de kit. */
export interface MiniCard {
  tone: CardTone;
  icon: "ok" | "wait" | "again" | "stop";
  kicker: string;
  title: string;
  /** O recado da faixa (o que fazer). */
  detail?: string;
  name?: string;
  /** "Professora · Filiação confirmada", "Convidada de Carla Mendes". */
  role?: string;
  tags?: ("P1" | "P2" | "MINOR" | "WALK_IN")[];
  /** O que sai de kit com a entrada ("desk": a pessoa pega na mesa dos kits). */
  kit?: { kind: "give" | "wait" | "none" | "desk"; title: string; detail: string; count?: 1 | 2 };
}

export interface QuickQuestion {
  id: string;
  card: MiniCard;
  right: string;
  wrong: string;
  /** A regra, numa frase: aparece depois de responder e na cola do fim. */
  lesson: string;
}

export function quickQuestions(ctx: TrainingContext): QuickQuestion[] {
  const after = ctx.kitDeadline;
  // Kit dividido: o convidado de filiado(a) não tem kit próprio; o de quem convidou é para os dois.
  const shared = ctx.sharedKit ?? EDITION.sharedKit;
  const questions: QuickQuestion[] = [
    {
      id: "verde",
      card: {
        tone: "success",
        icon: "ok",
        kicker: GAME.ready,
        title: "LIBERADO PARA ENTRADA",
        name: "Ana Lima",
        role: `${T.female} · Filiação confirmada`,
        tags: ["P1"],
        kit: { kind: "give", title: "Entregue 1 kit", detail: `Kit da ${T.femaleLower}` },
      },
      right: "Confirmar a entrada e entregar o kit",
      wrong: "Mandar buscar o kit depois",
      lesson: "Verde: confirme a entrada. O kit sai junto, na hora.",
    },
    {
      id: "convidado-antes",
      card: {
        tone: "success",
        icon: "ok",
        kicker: GAME.ready,
        title: "LIBERADO PARA ENTRADA",
        name: "Júlia Mendes",
        role: "Convidada de Carla Mendes (ainda não chegou)",
        tags: ["P2"],
        kit: shared
          ? { kind: "none", title: "Sem kit próprio", detail: "O kit da Carla é para as duas" }
          : { kind: "wait", title: "Fica para depois", detail: "Sai quando a Carla chegar" },
      },
      right: shared ? "Confirmar a entrada (o kit é o da Carla)" : "Confirmar a entrada (o kit espera a Carla)",
      wrong: "Pedir para ela esperar a Carla lá fora",
      lesson: shared
        ? "Convidado pode entrar antes e não tem kit próprio: o kit de quem convidou é para os dois."
        : "Convidado pode entrar antes. O kit dele sai quando quem convidou chegar.",
    },
    shared
      ? {
          id: "kit-para-dois",
          card: {
            tone: "success",
            icon: "ok",
            kicker: GAME.ready,
            title: "LIBERADO PARA ENTRADA",
            name: "Paulo Reis",
            role: `${T.male} · Filiação confirmada`,
            tags: ["P1"],
            kit: { kind: "give", title: "Entregue 1 kit", detail: "Para o Paulo e o convidado dividirem" },
          },
          right: "Confirmar e entregar 1 kit, para os dois",
          wrong: "Entregar 2 kits, um para cada",
          lesson: "Um kit por inscrição: o kit de quem convidou é para os dois.",
        }
      : {
          id: "dois-kits",
          card: {
            tone: "success",
            icon: "ok",
            kicker: GAME.ready,
            title: "LIBERADO PARA ENTRADA",
            name: "Paulo Reis",
            role: `${T.male} · Filiação confirmada`,
            tags: ["P1"],
            kit: { kind: "give", title: "Entregue 2 kits", detail: "O dele e o do convidado, que já entrou", count: 2 },
          },
          right: "Confirmar e entregar os 2 kits",
          wrong: "Entregar só o kit do Paulo",
          lesson: "A tela diz quantos kits saem: entregue todos.",
        },
    {
      id: "amarelo",
      card: {
        tone: "warning",
        icon: "wait",
        kicker: GAME.stop,
        title: "FILIAÇÃO AGUARDANDO CONFERÊNCIA",
        detail: ctx.resolve ? "Entrada bloqueada: resolva abaixo ou pelo Atendimento." : ENTRY_BLOCK_MESSAGE.MEMBER_PENDING.detail,
        name: "Marcos Silva",
        role: `${T.male} · Aguardando conferência`,
      },
      right: ctx.resolve ? "Conferir e confirmar a filiação" : "Mandar ao Atendimento",
      wrong: "Deixar entrar assim mesmo",
      lesson: ctx.resolve ? "Amarelo: falta resolver. Você confere a filiação e confirma." : "Amarelo: falta resolver. Quem resolve é o Atendimento.",
    },
    {
      id: "vermelho",
      card: {
        tone: "danger",
        icon: "stop",
        kicker: GAME.stop,
        title: "FILIAÇÃO NÃO CONFIRMADA",
        detail: "Se comprovar que é filiada (ex.: contracheque com o desconto), o Atendimento confirma na hora.",
        name: "Sandra Melo",
        role: `${T.female} · Filiação não confirmada`,
      },
      right: "Ler o motivo e encaminhar ao Atendimento",
      wrong: "Deixar entrar porque ela insiste",
      lesson: "Vermelho: parou. A faixa diz o motivo e o que fazer.",
    },
    {
      id: "ja-entrou",
      card: {
        tone: "warning",
        icon: "again",
        kicker: GAME.again,
        title: "ENTRADA JÁ REGISTRADA",
        detail: "Registrada às 20:04 por Joana (QR Code).",
        name: "Beatriz Costa",
        role: `${T.female} · Filiação confirmada`,
      },
      right: "Ver se é a mesma pessoa (não registra de novo)",
      wrong: "Registrar de novo para sair outro kit",
      lesson: "Já entrou: nada sai de novo. Nome não bate? Chame a organização.",
    },
    {
      id: "qr-cancelado",
      card: {
        tone: "danger",
        icon: "stop",
        kicker: GAME.gameOver,
        title: "QR CODE CANCELADO",
        detail: "Este voucher foi trocado por um novo. Localize a pessoa pela busca.",
      },
      right: "Buscar pelo nome ou CPF",
      wrong: "Mandar a pessoa embora",
      lesson: "QR que não serve (ou celular sem bateria)? Busque pelo nome ou CPF.",
    },
    {
      id: "fila-do-kit",
      card: {
        tone: "success",
        icon: "ok",
        kicker: GAME.ready,
        title: "LIBERADO PARA ENTRADA",
        name: "Fabiana Nunes",
        role: `${T.female} · Filiação confirmada`,
        tags: ["P1"],
        kit: { kind: "none", title: "Sem kit agora", detail: "Está na fila do kit" },
      },
      right: "Confirmar a entrada sem kit",
      wrong: "Não deixar entrar sem kit",
      lesson: after
        ? `Fila do kit: entra sem kit. Depois das ${after}, as sobras saem por ordem de chegada.`
        : "Fila do kit: entra sem kit. O kit só sai se sobrar.",
    },
  ];
  if (ctx.minorKit) {
    questions.push({
      id: "menor",
      card: {
        tone: "success",
        icon: "ok",
        kicker: GAME.ready,
        title: "LIBERADO PARA ENTRADA",
        name: "Theo Barros",
        // Kit dividido: convidado não tem kit próprio; o menor de 18 com kit é uma cortesia.
        role: shared ? "Cortesia do SINDSERM · Convite: André Barros" : "Convidado de André Barros, que já entrou",
        tags: shared ? ["MINOR"] : ["P2", "MINOR"],
        kit: { kind: "give", title: "Entregue 1 kit", detail: "Kit de menor de 18" },
      },
      right: "Entregar o kit de menor de 18",
      wrong: "Entregar o kit comum",
      lesson: "Menor de 18: entregue o kit de menor (o cartão avisa).",
    });
  }
  return ctx.kitsAtDesk ? atDesk(questions, shared) : questions;
}

/**
 * Kits na mesa dos kits: a portaria confirma a entrada e manda a pessoa à mesa.
 * Saem as situações de entregar kit na porta; entra o voucher amarelo (inscrição na hora).
 */
function atDesk(questions: QuickQuestion[], shared: boolean): QuickQuestion[] {
  const desk = { kind: "desk" as const, title: "Pega na mesa", detail: "O kit sai na mesa dos kits" };
  const adapted = questions
    .filter((question) => question.id !== "dois-kits" && question.id !== "kit-para-dois" && question.id !== "menor")
    .map((question): QuickQuestion => {
      if (question.id === "verde") {
        return {
          ...question,
          card: { ...question.card, kit: desk },
          right: "Confirmar a entrada e mandar à mesa dos kits",
          wrong: "Entregar o kit aqui na porta",
          lesson: "Verde: confirme a entrada. O kit sai na mesa dos kits, não na porta.",
        };
      }
      if (question.id === "convidado-antes" && shared) {
        // Kit dividido: o convidado não vai à mesa (o kit é o de quem convidou).
        return {
          ...question,
          right: "Confirmar a entrada (sem kit próprio)",
          lesson: "Convidado entra antes e não tem kit próprio: o kit de quem convidou é para os dois.",
        };
      }
      if (question.id === "convidado-antes") {
        return {
          ...question,
          card: { ...question.card, kit: desk },
          right: "Confirmar a entrada e mandar à mesa",
          wrong: "Pedir para ela esperar a Carla lá fora",
          lesson: "Convidado entra antes e pega o kit na mesa, sem esperar quem convidou.",
        };
      }
      if (question.id === "ja-entrou") {
        return { ...question, wrong: "Registrar a entrada de novo", lesson: "Já entrou: não registra de novo. Nome não bate? Chame a organização." };
      }
      return question;
    });
  adapted.splice(1, 0, {
    id: "na-hora",
    card: {
      tone: "success",
      icon: "ok",
      kicker: GAME.ready,
      title: "LIBERADO PARA ENTRADA",
      name: "Rafael Souza",
      role: `${T.male} · Filiação confirmada`,
      tags: ["P1", "WALK_IN"],
      kit: { kind: "desk", title: "Pega na mesa", detail: "Kit da gordura (inscrição na hora)" },
    },
    right: "Confirmar a entrada e mandar à mesa",
    wrong: "Mandar voltar para se inscrever",
    lesson: "Voucher amarelo (inscrição na hora): entra normal; na mesa, o kit sai da gordura.",
  });
  return adapted;
}

/** Embaralha sem sorteio de verdade (o mesmo no servidor e no navegador). */
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
