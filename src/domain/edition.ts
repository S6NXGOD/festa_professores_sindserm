/*
 * Qual festa este sistema atende. Um endereço por festa (decisão da
 * organização): o mesmo código serve a festa das professoras e professores e a
 * das servidoras e servidores, cada uma com banco, tema e textos próprios. A
 * escolha vem da variável NEXT_PUBLIC_FESTA_EDICAO (no Railway, "servidores");
 * sem ela, é a festa das professoras e professores, exatamente como sempre foi.
 *
 * Arquivo comum (sem "use client"): servidor e navegador leem o mesmo valor.
 */

export type EditionId = "professores" | "servidores";
/** Visual da festa: anos 80 (professores) ou verão (sol, piscina, pôr do sol). */
export type ThemeId = "anos80" | "verao";

export function editionIdFrom(value: string | undefined | null): EditionId {
  return value === "servidores" ? "servidores" : "professores";
}

/** Como o sistema chama o público da festa (sempre na forma inclusiva). */
export interface EditionTerms {
  /** "professor(a)" */
  person: string;
  /** "Professor(a)" */
  Person: string;
  /** "Professor(a) filiado(a)" */
  personAffiliated: string;
  /** "do(a) professor(a)" */
  ofPerson: string;
  /** "o(a) professor(a)" */
  thePerson: string;
  /** "um(a) professor(a)" */
  aPerson: string;
  /** "professoras e professores" */
  people: string;
  /** "Professoras e professores" */
  People: string;
  /** "professoras, professores" (em listas: "..., convidados, colaboradores e cortesias") */
  peopleList: string;
  /** "Professoras, professores" */
  PeopleList: string;
  /** "das professoras e professores" */
  ofPeople: string;
  /** "professoras e professores filiados(as)" */
  peopleAffiliated: string;
  /** "Professoras e professores filiados(as)" */
  PeopleAffiliated: string;
  /** "Professora e professor" */
  pair: string;
  /** "da professora e do professor" */
  ofPair: string;
  /** "Professora" / "Professor" (exemplos do treino) */
  female: string;
  male: string;
  /** "professora" */
  femaleLower: string;
  /** "Festa das professoras e professores" */
  partyOf: string;
  /** Abreviação nos números curtos ("5 prof. · 1 conv."). */
  short: string;
}

/** As palavras de jogo do tema (fliperama nos anos 80; piscina no verão). */
export interface EditionGame {
  /** Etiqueta do titular e do convidado: "PLAYER 1" / "PLAYER 2". */
  player: Record<1 | 2, string>;
  /** "PLAYER" (cenas do tutorial: "PLAYER AL"). */
  playerWord: string;
  /** Como os textos chamam o titular e o convidado de forma divertida: "Player 1" / "Player 2". */
  player1Name: string;
  player2Name: string;
  /** Primeira tela (configuração): "Player 1 start". */
  start: string;
  /** Vouchers recuperados pelo site: "Fita recuperada". */
  recovered: string;
  ready: string;
  stop: string;
  again: string;
  gameOver: string;
  oneUp: string;
  insertCoin: string;
  admitOne: string;
  levelUp: string;
  /** Contagem regressiva da página inicial. */
  countdownLabel: string;
  /** Os efeitos sonoros do tema ("Sons 8-bit", "Sons do verão"). */
  sounds: string;
  /** Onde a festa acontece, no jogo do tema ("pista", "piscina"). */
  floor: string;
  Floor: string;
  /** O que se procura quando o voucher some ("fita", "pulseira"). */
  tape: string;
  /** Muitas tentativas: espere um pouco ("Pause"). */
  pause: string;
  /** O convite para começar ("Press start"). */
  pressStart: string;
  /** Link ou página que não existe. */
  notFound: string;
  notFoundLine: string;
}

export interface Edition {
  id: EditionId;
  theme: ThemeId;
  /**
   * A pergunta "é professor(a)?" decide quem tem kit e convidado. Sem ela (festa
   * das servidoras e servidores), todo filiado(a) tem 1 kit e leva 1 convidado.
   */
  askTeacher: boolean;
  /** Nome da festa enquanto o painel não tem um configurado. */
  defaultEventName: string;
  /** A arte da festa (emblema; no site, a versão WEBP importada em brand.tsx) e o texto alternativo dela. */
  emblem: {
    /** Para o que o servidor desenha (prévia do link, voucher em imagem, PDF e ícone): JPG ou PNG. */
    raster: string;
    alt: string;
    /** Arte de fundo transparente: aparece como está (sem a mistura do cartaz de fundo preto). */
    transparent: boolean;
  };
  /** Cor do navegador (barra do celular). */
  themeColor: string;
  /** A frase da festa (mensagem de divulgação). */
  tagline: string;
  terms: EditionTerms;
  game: EditionGame;
}

export const EDITIONS: Record<EditionId, Edition> = {
  professores: {
    id: "professores",
    theme: "anos80",
    askTeacher: true,
    defaultEventName: "Festa das Professoras e Professores – SINDSERMTHE",
    emblem: {
      raster: "/brand/festa-emblema.jpg",
      alt: "Festa dos/as professores/as — A luta não sai de moda — Nos embalos de sexta à noite",
      transparent: false,
    },
    themeColor: "#080808",
    tagline: "A luta não sai de moda — nos embalos de sexta à noite!",
    terms: {
      person: "professor(a)",
      Person: "Professor(a)",
      personAffiliated: "Professor(a) filiado(a)",
      ofPerson: "do(a) professor(a)",
      thePerson: "o(a) professor(a)",
      aPerson: "um(a) professor(a)",
      people: "professoras e professores",
      People: "Professoras e professores",
      peopleList: "professoras, professores",
      PeopleList: "Professoras, professores",
      ofPeople: "das professoras e professores",
      peopleAffiliated: "professoras e professores filiados(as)",
      PeopleAffiliated: "Professoras e professores filiados(as)",
      pair: "Professora e professor",
      ofPair: "da professora e do professor",
      female: "Professora",
      male: "Professor",
      femaleLower: "professora",
      partyOf: "Festa das professoras e professores",
      short: "prof.",
    },
    game: {
      player: { 1: "PLAYER 1", 2: "PLAYER 2" },
      playerWord: "PLAYER",
      player1Name: "Player 1",
      player2Name: "Player 2",
      start: "Player 1 start",
      recovered: "Fita recuperada",
      ready: "Ready",
      stop: "Stop",
      again: "Continue?",
      gameOver: "Game over",
      oneUp: "1UP",
      insertCoin: "Insert coin",
      admitOne: "Admit one",
      levelUp: "LEVEL UP!",
      countdownLabel: "A pista abre em",
      sounds: "Sons 8-bit",
      floor: "pista",
      Floor: "Pista",
      tape: "fita",
      pressStart: "Press start",
      pause: "Pause",
      notFound: "Fita não encontrada",
      notFoundLine: "Esta fita não existe.",
    },
  },
  servidores: {
    id: "servidores",
    theme: "verao",
    askTeacher: false,
    defaultEventName: "Festa das Servidoras e Servidores – SINDSERMTHE",
    emblem: {
      raster: "/brand/servidores/emblema.png",
      alt: "Quem luta também se diverte — Festa do Servidor Público Municipal",
      transparent: true,
    },
    themeColor: "#0b1330",
    tagline: "Quem luta também se diverte!",
    terms: {
      person: "servidor(a)",
      Person: "Servidor(a)",
      personAffiliated: "Servidor(a) filiado(a)",
      ofPerson: "do(a) servidor(a)",
      thePerson: "o(a) servidor(a)",
      aPerson: "um(a) servidor(a)",
      people: "servidoras e servidores",
      People: "Servidoras e servidores",
      peopleList: "servidoras, servidores",
      PeopleList: "Servidoras, servidores",
      ofPeople: "das servidoras e servidores",
      peopleAffiliated: "servidoras e servidores filiados(as)",
      PeopleAffiliated: "Servidoras e servidores filiados(as)",
      pair: "Servidora e servidor",
      ofPair: "da servidora e do servidor",
      female: "Servidora",
      male: "Servidor",
      femaleLower: "servidora",
      partyOf: "Festa das servidoras e servidores",
      short: "serv.",
    },
    game: {
      player: { 1: "TITULAR", 2: "+1" },
      playerWord: "VIP",
      player1Name: "Titular",
      player2Name: "+1",
      start: "Partiu, verão",
      recovered: "Pulseira recuperada",
      ready: "Partiu!",
      stop: "Opa!",
      again: "De novo?",
      gameOver: "Maré baixa",
      oneUp: "Splash!",
      insertCoin: "Bora mergulhar",
      admitOne: "Pulseira VIP",
      levelUp: "ONDA NOVA!",
      countdownLabel: "O mergulho começa em",
      sounds: "Sons do verão",
      floor: "piscina",
      Floor: "Piscina",
      tape: "pulseira",
      pressStart: "Vem pro verão",
      pause: "Pausa pro picolé",
      notFound: "Sumiu na maré",
      notFoundLine: "Esta página sumiu na maré.",
    },
  },
};

/**
 * A edição deste sistema. `process.env.NEXT_PUBLIC_FESTA_EDICAO` escrito por
 * extenso: o Next troca pelo valor no navegador (na hora do build); no servidor, vale a variável.
 */
export function currentEditionId(): EditionId {
  return editionIdFrom(process.env.NEXT_PUBLIC_FESTA_EDICAO);
}

export const EDITION: Edition = EDITIONS[currentEditionId()];
/** Os termos do público desta festa ("professor(a)", "servidoras e servidores"...). */
export const T: EditionTerms = EDITION.terms;
/** As palavras de jogo do tema desta festa. */
export const GAME: EditionGame = EDITION.game;
