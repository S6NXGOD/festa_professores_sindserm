import { ENTRY_BLOCK_MESSAGE } from "@/domain/labels";

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
  tags?: ("P1" | "P2" | "MINOR")[];
  /** O que sai de kit com a entrada. */
  kit?: { kind: "give" | "wait" | "none"; title: string; detail: string; count?: 1 | 2 };
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
  const questions: QuickQuestion[] = [
    {
      id: "verde",
      card: {
        tone: "success",
        icon: "ok",
        kicker: "Ready",
        title: "LIBERADO PARA ENTRADA",
        name: "Ana Lima",
        role: "Professora · Filiação confirmada",
        tags: ["P1"],
        kit: { kind: "give", title: "Entregue 1 kit", detail: "Kit da professora" },
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
        kicker: "Ready",
        title: "LIBERADO PARA ENTRADA",
        name: "Júlia Mendes",
        role: "Convidada de Carla Mendes (ainda não chegou)",
        tags: ["P2"],
        kit: { kind: "wait", title: "Fica para depois", detail: "Sai quando a Carla chegar" },
      },
      right: "Confirmar a entrada (o kit espera a Carla)",
      wrong: "Pedir para ela esperar a Carla lá fora",
      lesson: "Convidado pode entrar antes. O kit dele sai quando quem convidou chegar.",
    },
    {
      id: "dois-kits",
      card: {
        tone: "success",
        icon: "ok",
        kicker: "Ready",
        title: "LIBERADO PARA ENTRADA",
        name: "Paulo Reis",
        role: "Professor · Filiação confirmada",
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
        kicker: "Stop",
        title: "FILIAÇÃO AGUARDANDO CONFERÊNCIA",
        detail: ctx.resolve ? "Entrada bloqueada: resolva abaixo ou pelo Atendimento." : ENTRY_BLOCK_MESSAGE.MEMBER_PENDING.detail,
        name: "Marcos Silva",
        role: "Professor · Aguardando conferência",
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
        kicker: "Stop",
        title: "FILIAÇÃO NÃO CONFIRMADA",
        detail: "Se comprovar que é filiada (ex.: contracheque com o desconto), o Atendimento confirma na hora.",
        name: "Sandra Melo",
        role: "Professora · Filiação não confirmada",
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
        kicker: "Continue?",
        title: "ENTRADA JÁ REGISTRADA",
        detail: "Registrada às 20:04 por Joana (QR Code).",
        name: "Beatriz Costa",
        role: "Professora · Filiação confirmada",
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
        kicker: "Game over",
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
        kicker: "Ready",
        title: "LIBERADO PARA ENTRADA",
        name: "Fabiana Nunes",
        role: "Professora · Filiação confirmada",
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
        kicker: "Ready",
        title: "LIBERADO PARA ENTRADA",
        name: "Theo Barros",
        role: "Convidado de André Barros, que já entrou",
        tags: ["P2", "MINOR"],
        kit: { kind: "give", title: "Entregue 1 kit", detail: "Kit de menor de 18" },
      },
      right: "Entregar o kit de menor de 18",
      wrong: "Entregar o kit comum",
      lesson: "Menor de 18: entregue o kit de menor (o cartão avisa).",
    });
  }
  return questions;
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
