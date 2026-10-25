import { type AccessMap, can } from "./access";
import { GAME, T } from "./edition";

/*
 * Tutorial do primeiro acesso: só as fases que a pessoa usa de verdade (montadas
 * pelas permissões dela), em linguagem simples. Abre sozinho uma vez por usuário
 * e pode ser revisto pelo menu do nome.
 */

export type TutorialScene =
  | "start"
  | "scoreboard"
  | "queue"
  | "form"
  | "vouchers"
  | "gate"
  | "training"
  | "entries"
  | "house"
  | "admin"
  | "levelup";

export interface TutorialStep {
  id: string;
  scene: TutorialScene;
  title: string;
  bullets: string[];
  /** Botão extra da fase (ex.: abrir o treino da portaria). */
  action?: { href: string; label: string };
}

/** Treino relâmpago obrigatório: quem registra entradas e não administra o acesso ao sistema. */
export function gateTrainingRequired(access: AccessMap): boolean {
  return can(access, "checkIn") && !can(access, "manageUsers");
}

/** Treino da mesa dos kits obrigatório: quem entrega kits e não administra o acesso ao sistema. */
export function deskTrainingRequired(access: AccessMap): boolean {
  return can(access, "deliverKits") && !can(access, "manageUsers");
}

/** Só a mesa dos kits: entrega kits e não registra entradas (o tutorial pula a portaria). */
function deskOnly(access: AccessMap): boolean {
  return can(access, "deliverKits") && !can(access, "checkIn");
}

function firstNameOf(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function tutorialSteps(access: AccessMap, name: string): TutorialStep[] {
  const steps: TutorialStep[] = [];
  const add = (step: TutorialStep | null) => {
    if (step && step.bullets.length) steps.push(step);
  };

  add({
    id: "boas-vindas",
    scene: "start",
    title: `Bem-vindo(a) à equipe, ${firstNameOf(name)}!`,
    bullets: [
      "Este é o sistema da festa: inscrições, vouchers com QR Code, portaria e kits. Em poucas fases você aprende o essencial.",
      ...(can(access, "search") ? ["A busca lá em cima acha qualquer pessoa pelo nome, CPF ou matrícula."] : []),
    ],
  });

  add(
    can(access, "viewDashboard")
      ? {
          id: "placar",
          scene: "scoreboard",
          title: "Placar: a festa em números",
          bullets: [
            `Quantas pessoas se inscreveram, quantas já estão prontas para entrar e quantas já estão na ${GAME.floor}.`,
            "O que falta resolver aparece em amarelo, aqui e no menu (com o número ao lado).",
          ],
        }
      : null,
  );

  add(
    can(access, "viewRegistrations")
      ? {
          id: "inscricoes",
          scene: "queue",
          title: "Conferir inscrições",
          bullets: [
            can(access, "validateAffiliation")
              ? "Em Inscrições → Para conferir estão as pessoas que disseram ser filiadas. Confira e toque em Confirmar (ou Não confirmar)."
              : `Em Inscrições você vê cada grupo (${T.person} e convidado), quem já entrou e os kits.`,
            ...(can(access, "validateAffiliation")
              ? ["Sem tempo de conferir todas? Confirmar todas libera a fila de uma vez; quem não for filiado(a) você desfaz depois em Não é filiado(a)."]
              : []),
            "O botão verde abre o WhatsApp da pessoa com a mensagem pronta.",
            ...(can(access, "registerAtEvent") ? ["Chegou alguém sem inscrição? Use Cadastrar na hora."] : []),
            "A cada inscrição nova, o painel toca um level up e mostra o nome.",
          ],
        }
      : null,
  );

  add(
    can(access, "viewForms")
      ? {
          id: "fichas",
          scene: "form",
          title: "Fichas de filiação",
          bullets: [
            "Quem ainda não é filiado(a) preenche a ficha no site; na recepção, é só assinar.",
            "Sem a cópia do RG e do contracheque, a assinatura fica travada.",
            ...(can(access, "newAffiliation")
              ? [
                  "Dá para fazer a ficha na hora, pelo botão Nova ficha.",
                  "Antes da festa, dá para assinar pelo gov.br: na ficha, Mandar no WhatsApp; o PDF assinado volta para a secretaria, você anexa e confirma.",
                ]
              : []),
          ],
        }
      : null,
  );

  const staffVouchers = can(access, "reissueVoucher");
  const houseVouchers = can(access, "viewEmployees");
  add(
    staffVouchers || houseVouchers
      ? {
          id: "vouchers",
          scene: "vouchers",
          title: "Vouchers",
          bullets: [
            "Cada pessoa tem o próprio voucher com QR Code, que já sai pronto na inscrição.",
            ...(staffVouchers ? ["No cadastro da pessoa: Imprimir vouchers ou Novo link de vouchers (se ela perdeu)."] : []),
            ...(houseVouchers ? ["Colaboradores e cortesias: botão Voucher em cada nome, ou mande os de um grupo inteiro no WhatsApp."] : []),
            "Perdeu o link? A pessoa também recupera sozinha no site, com o CPF e o WhatsApp.",
          ],
        }
      : null,
  );

  add(
    can(access, "viewGate") && !deskOnly(access)
      ? {
          id: "portaria",
          scene: "gate",
          title: "Portaria: entrada em segundos",
          bullets: [
            "Leia o QR Code com a câmera ou busque pelo nome, CPF ou código do voucher.",
            ...(can(access, "registerAtEvent")
              ? ["Chegou sem inscrição? Na busca, toque em Cadastrar agora: o cadastro rápido já vem com o nome digitado."]
              : []),
            ...(can(access, "createCourtesyAtGate")
              ? ["A organização mandou entrar alguém que não está na lista? Na busca, toque em Entrar como cortesia (com ou sem kit)."]
              : []),
            "A tela diz na hora: LIBERADO, ou o motivo do bloqueio e o que fazer.",
            ...(can(access, "checkIn")
              ? [
                  "Toque em Confirmar entrada: o kit sai junto (ou, quando a festa usa a mesa dos kits, a tela manda a pessoa para a mesa).",
                  "Antes do horário da festa, o sistema pede uma confirmação a mais.",
                  ...(can(access, "manageGuests") || can(access, "manageEmployees")
                    ? ["Colaborador(a) chegou com alguém sem direito a kit? Abra o nome dele(a) e toque em Convidado sem kit."]
                    : []),
                ]
              : ["Seu acesso é só para consultar: quem registra a entrada é a equipe da portaria."]),
          ],
        }
      : null,
  );

  add(
    can(access, "checkIn")
      ? {
          id: "treino",
          scene: "training",
          title: "Treino relâmpago",
          bullets: [
            "As situações da porta em 1 minuto: verde, amarelo, vermelho, convidado que chega antes, QR que não serve, fila do kit.",
            gateTrainingRequired(access)
              ? "É obrigatório antes de abrir a portaria. Dá para repetir quando quiser: menu do seu nome → Treino da portaria."
              : "Dá para repetir quando quiser: menu do seu nome → Treino da portaria.",
          ],
          action: { href: "/portaria/treino", label: "Treinar agora" },
        }
      : null,
  );

  add(
    can(access, "deliverKits")
      ? {
          id: "mesa",
          scene: "training",
          title: "Mesa dos kits",
          bullets: [
            "A segurança registra a entrada; a pessoa vem à mesa buscar o kit.",
            "Ache a pessoa pelo nome, CPF ou código do voucher (ou toque no nome na fila da mesa) e confira se foi validada na entrada.",
            "Toque em Entregar kit: o estoque baixa e o kit não sai de novo para ela.",
            "Voucher amarelo (Inscrição na hora): o kit é o da caixa da gordura.",
            deskTrainingRequired(access)
              ? "Antes de abrir a mesa, tem um treino rápido com uma entrega de mentira (nada fica gravado)."
              : "Tem um treino rápido com uma entrega de mentira (nada fica gravado): Mesa dos kits → Treinar.",
          ],
          action: { href: "/portaria/mesa/treino", label: "Treinar a mesa" },
        }
      : null,
  );

  add(
    can(access, "viewEntries") || can(access, "viewKits")
      ? {
          id: "na-festa",
          scene: "entries",
          title: "Entradas e kits",
          bullets: [
            ...(can(access, "viewEntries") ? ["Entradas: quem entrou, a que horas e quem registrou (tem planilha para o Excel)."] : []),
            ...(can(access, "viewKits")
              ? [
                  "Kits e estoque: o quadro Pessoas e kits compara, grupo por grupo, quem vem e quem tem direito a kit (e manda o resumo no WhatsApp).",
                  "O estoque avisa quando estiver acabando.",
                ]
              : []),
          ],
        }
      : null,
  );

  add(
    can(access, "viewEmployees")
      ? {
          id: "casa",
          scene: "house",
          title: "Colaboradores e cortesias",
          bullets: [
            "Colaboradores do SINDSERM (diretoria, funcionários e prestadores): voucher próprio, 1 kit e 1 convidado.",
            "Cortesias: amigos e familiares da organização, com ou sem kit, agrupados por quem convidou.",
            "Convidado sem kit de um(a) colaborador(a): na tela da pessoa, botão Convidado sem kit (voucher próprio, sem mexer no estoque).",
          ],
        }
      : null,
  );

  add(
    can(access, "manageUsers") || can(access, "manageSettings") || can(access, "viewAudit") || can(access, "adminCorrections")
      ? {
          id: "administracao",
          scene: "admin",
          title: "Administração",
          bullets: [
            ...(can(access, "manageUsers") ? ["Acesso ao sistema: crie o login de cada pessoa da equipe e escolha o que ela pode ver ou editar."] : []),
            ...(can(access, "manageSettings") ? ["Configurações: data, horários, local, WhatsApp de ajuda e ícone do site."] : []),
            ...(can(access, "adminCorrections") ? ["Errou? As correções (estornos) ficam no cadastro da pessoa."] : []),
            ...(can(access, "viewAudit") ? ["Auditoria: tudo o que foi feito, por quem e quando."] : []),
          ],
        }
      : null,
  );

  add({
    id: "pronto",
    scene: "levelup",
    title: "Pronto! Bora pra festa",
    bullets: [
      "Dá para rever este tutorial quando quiser no menu do seu nome, no canto de cima.",
      `No mesmo menu você liga ou desliga os ${GAME.sounds.toLowerCase()}.`,
    ],
  });

  return steps;
}
