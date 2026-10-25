/**
 * Sem tempo de conferir todo mundo (decisão da organização): a fila "Aguardando
 * conferência" é confirmada de uma vez, para ninguém que é filiado(a) ficar de
 * fora. Quem o SINDSERM descobrir depois que não é filiado(a) tem a filiação
 * desfeita e não entra nem recebe o kit (o convidado também não). No site, quem
 * se inscreve declara que é filiado(a) e sabe disso.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, guestLink, registration } from "@/server/db/schema";
import { MEMBER_DECLARATION_MESSAGE } from "@/domain/schemas";
import { BULK_CONFIRM_NOTE, confirmPendingInBulk, decideAffiliation, revokeAffiliation } from "@/server/services/affiliation";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { registerDeclaredMember } from "@/server/services/membership";
import { createRegistration } from "@/server/services/registration";
import { configureEvent, createStaff, registerMember, registerPreAffiliation, registrationInput, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin);
});

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

const statusOf = async (registrationId: string) =>
  (await db.select({ status: registration.status, note: registration.statusNote }).from(registration).where(eq(registration.id, registrationId)))[0];

/** A hora em que a inscrição entrou no banco (a tela "abriu" nesse instante). */
const createdAtOf = async (registrationId: string) =>
  (await db.select({ at: registration.createdAt }).from(registration).where(eq(registration.id, registrationId)))[0]!.at;

describe("confirmar a fila de uma vez", () => {
  it("só quem estava na fila quando a tela abriu; quem chegou depois, fichas e decididas ficam como estão", async () => {
    const ficha = await registerPreAffiliation({ fullName: "Dora Ficha Lima" });
    const ana = await registerMember({ memberName: "Ana Primeira Lima", guest: true, guestName: "Lia Convidada Lima" });
    const recusado = await registerMember({ memberName: "Caio Recusado Lima" });
    await decideAffiliation(attendant, { registrationId: recusado.registrationId, decision: "REJECT" });
    const bia = await registerMember({ memberName: "Bia Segunda Lima" });
    const upTo = await createdAtOf(bia.registrationId);
    const depois = await registerMember({ memberName: "Edu Chegou Depois" });

    expect(await confirmPendingInBulk(attendant, { upTo })).toEqual({ confirmed: 2, stillPending: 1 });

    expect(await statusOf(ana.registrationId)).toEqual({ status: "CONFIRMED", note: BULK_CONFIRM_NOTE });
    expect(await statusOf(bia.registrationId)).toEqual({ status: "CONFIRMED", note: BULK_CONFIRM_NOTE });
    expect((await statusOf(recusado.registrationId))?.status).toBe("REJECTED");
    expect((await statusOf(ficha.registrationId))?.status).toBe("AWAITING_SIGNATURE");
    expect(await statusOf(depois.registrationId)).toEqual({ status: "PENDING", note: null });

    // Cada pessoa fica com a sua linha no histórico, e a operação inteira fica na Auditoria.
    const confirmations = await db.select().from(auditLog).where(eq(auditLog.action, "AFFILIATION_CONFIRMED"));
    expect(confirmations.map((row) => row.summary).sort()).toEqual([
      "Ana Primeira Lima: filiação confirmada em massa, sem conferência.",
      "Bia Segunda Lima: filiação confirmada em massa, sem conferência.",
    ]);
    const [bulk] = await db.select().from(auditLog).where(eq(auditLog.action, "AFFILIATIONS_BULK_CONFIRMED"));
    expect(bulk?.summary).toBe("Confirmação em massa: 2 inscrições confirmadas sem conferência; 1 chegou depois e continua na fila.");

    // Liberados: a confirmada e o convidado dela entram.
    expect(await registerCheckIn(security, { personId: ana.state.guest!.personId, method: "SEARCH" })).toMatchObject({ outcome: "CHECKED_IN" });
  });

  it("o recado que já havia continua junto; convidado(a) que se declarou filiado(a) vira filiado(a)", async () => {
    const host = await registerMember({ memberName: "Rosa Anfitria Lima", guest: true, guestName: "Iara Convidada Rocha" });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const declared = await registerDeclaredMember(attendant, {
      personId: host.state.guest!.personId,
      whatsapp: "86999990000",
      registrationNumber: "4455-1",
      workplace: "Escola Municipal Leste",
      isTeacher: true,
    });
    await db.update(registration).set({ statusNote: "Matrícula a conferir." }).where(eq(registration.id, declared.registrationId));

    expect(await confirmPendingInBulk(attendant, { upTo: new Date(Date.now() + 60_000) })).toEqual({ confirmed: 1, stillPending: 0 });
    expect(await statusOf(declared.registrationId)).toEqual({ status: "CONFIRMED", note: `${BULK_CONFIRM_NOTE} Matrícula a conferir.` });
    // A regra do convidado que vira filiado: o vínculo de convidado da Rosa é encerrado.
    const [link] = await db.select({ status: guestLink.status }).from(guestLink).where(eq(guestLink.registrationId, host.registrationId));
    expect(link?.status).toBe("CONVERTED");
  });

  it("só quem confere filiações; fila vazia não faz nada", async () => {
    await registerMember();
    expect((await refused(confirmPendingInBulk(security, { upTo: new Date() }))).code).toBe("FORBIDDEN");
    expect((await refused(confirmPendingInBulk(attendant, { upTo: new Date("data ruim") }))).code).toBe("VALIDATION");
    expect(await confirmPendingInBulk(attendant, { upTo: new Date(0) })).toEqual({ confirmed: 0, stillPending: 1 });
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "AFFILIATIONS_BULK_CONFIRMED"))).toEqual([]);
  });
});

describe("não é filiado(a): a filiação é desfeita", () => {
  it("não entra nem recebe o kit, e o convidado também não entra; comprovando, dá para confirmar de novo", async () => {
    const marcos = await registerMember({ memberName: "Marcos Mentiu Alves", guest: true, guestName: "Bruna Convidada Alves" });
    await confirmPendingInBulk(attendant, { upTo: new Date(Date.now() + 60_000) });

    await revokeAffiliation(attendant, { registrationId: marcos.registrationId, justification: "Não consta como filiado no sistema do SINDSERM" });
    expect(await statusOf(marcos.registrationId)).toEqual({ status: "REJECTED", note: "Não consta como filiado no sistema do SINDSERM" });
    expect((await refused(registerCheckIn(security, { personId: marcos.state.member.id, method: "SEARCH" }))).code).toBe("ENTRY_BLOCKED");
    expect((await refused(registerCheckIn(security, { personId: marcos.state.guest!.personId, method: "SEARCH" }))).code).toBe("ENTRY_BLOCKED");
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "AFFILIATION_REVOKED"), eq(auditLog.entityId, marcos.registrationId)));
    expect(audit?.summary).toBe("Marcos Mentiu Alves: não é filiado(a), não entra nem recebe o kit (Não consta como filiado no sistema do SINDSERM).");
  });

  it("depois de entrar (a pessoa ou o convidado), estorna antes; só filiação confirmada; só quem confere filiações", async () => {
    const dentro = await registerMember({ memberName: "Joana Ja Entrou" });
    const convidadoDentro = await registerMember({ memberName: "Kiko Convidado Entrou", guest: true });
    const confirmada = await registerMember({ memberName: "Olga Confirmada Dias" });
    const pendente = await registerMember({ memberName: "Paula Pendente Dias" });
    for (const group of [dentro, convidadoDentro, confirmada]) {
      await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
    }
    await registerCheckIn(security, { personId: dentro.state.member.id, method: "SEARCH" });
    await registerCheckIn(security, { personId: convidadoDentro.state.guest!.personId, method: "SEARCH" });

    const motivo = "Não consta como filiada no sistema do SINDSERM";
    for (const group of [dentro, convidadoDentro]) {
      expect((await refused(revokeAffiliation(attendant, { registrationId: group.registrationId, justification: motivo }))).message).toBe(
        "Já entrou na festa (a pessoa ou o convidado): estorne a entrada antes.",
      );
    }
    expect((await refused(revokeAffiliation(attendant, { registrationId: pendente.registrationId, justification: motivo }))).message).toBe(
      "Só dá para desfazer uma filiação confirmada. Atualize a tela.",
    );
    expect((await refused(revokeAffiliation(security, { registrationId: confirmada.registrationId, justification: motivo }))).code).toBe("FORBIDDEN");
    await expect(revokeAffiliation(attendant, { registrationId: confirmada.registrationId, justification: "curto" })).rejects.toThrow(
      "Descreva o motivo (mínimo de 10 caracteres)",
    );
    expect((await statusOf(confirmada.registrationId))?.status).toBe("CONFIRMED");
  });
});

describe("no site, quem se inscreve declara que é filiado(a)", () => {
  it("sem a declaração não grava; com ela, a declaração fica na auditoria; na hora, quem cadastra avisa", async () => {
    const without = await refused(createRegistration(PUBLIC_ACTOR, { ...registrationInput(), memberDeclaration: false }));
    expect(without.code).toBe("VALIDATION");
    expect(without.message).toBe(MEMBER_DECLARATION_MESSAGE);
    expect(without.fieldErrors).toEqual({ memberDeclaration: MEMBER_DECLARATION_MESSAGE });

    const site = await createRegistration(PUBLIC_ACTOR, registrationInput({ memberName: "Sara Site Lima" }));
    const [created] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "REGISTRATION_CREATED"), eq(auditLog.entityId, site.registrationId)));
    expect(created?.after).toMatchObject({ origin: "PUBLIC_FORM", memberDeclaration: true });

    const naHora = await createRegistration(attendant, { ...registrationInput({ memberName: "Nina Na Hora" }), memberDeclaration: undefined });
    expect((await statusOf(naHora.registrationId))?.status).toBe("PENDING");
  });
});
