/**
 * Usuários do sistema: apagar (quem tem histórico some da lista e perde o
 * acesso, mas o nome fica nos registros; quem não tem some de vez) e o treino
 * relâmpago obrigatório da portaria (feito e pedido de novo).
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { account, auditLog, checkIn, user } from "@/server/db/schema";
import { listStaffUsers } from "@/server/queries/panel";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { createStaffUser, deleteStaffUser, finishGateTraining, requireGateTrainingAgain } from "@/server/services/users";
import { configureEvent, createStaff, registerMember, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
});

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  return error as DomainError;
}

const row = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];

describe("apagar usuário", () => {
  it("sem histórico, o usuário some de vez (e o e-mail fica livre)", async () => {
    const created = await createStaffUser(admin, { name: "Temporaria Teste", email: "temporaria@teste.local", role: "SECURITY", password: "senha-forte-123" });
    const result = await deleteStaffUser(admin, { userId: created!.userId });
    expect(result).toEqual({ keptInHistory: false });
    expect(await row(created!.userId)).toBeUndefined();
    expect(await db.select().from(account).where(eq(account.userId, created!.userId))).toHaveLength(0);
    // O mesmo e-mail pode ser usado de novo.
    await createStaffUser(admin, { name: "Temporaria Volta", email: "temporaria@teste.local", role: "SECURITY", password: "senha-forte-123" });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "USER_DELETED"));
    expect(audit?.summary).toBe("Usuário Temporaria Teste apagado.");
  });

  it("com histórico, perde o acesso e sai da lista, mas o nome continua nas entradas que registrou", async () => {
    await configureEvent(admin);
    const member = await registerMember();
    await decideAffiliation(attendant, { registrationId: member.registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: member.state.member.id, method: "QR" });

    expect(await deleteStaffUser(admin, { userId: security.userId })).toEqual({ keptInHistory: true });
    const kept = await row(security.userId);
    expect(kept).toMatchObject({ name: "Sergio Seguranca", active: false });
    expect(kept?.deletedAt).toBeInstanceOf(Date);
    expect(kept?.email).toBe(`${security.userId}@usuario-apagado.invalid`);
    // A entrada continua dizendo quem registrou.
    const [entry] = await db.select({ by: checkIn.checkedInByUserId }).from(checkIn);
    expect(entry?.by).toBe(security.userId);
    // Fora da lista; apagar de novo não acha.
    expect((await listStaffUsers()).map((u) => u.name)).not.toContain("Sergio Seguranca");
    expect((await refused(deleteStaffUser(admin, { userId: security.userId }))).code).toBe("NOT_FOUND");
  });

  it("ninguém apaga o próprio usuário, e só quem administra o acesso pode apagar", async () => {
    expect((await refused(deleteStaffUser(admin, { userId: admin.userId }))).message).toBe("Você não pode apagar o próprio usuário.");
    expect((await refused(deleteStaffUser(attendant, { userId: security.userId }))).code).toBe("FORBIDDEN");
  });
});

describe("treino relâmpago obrigatório", () => {
  it("feito, vale também como tutorial visto; pedido de novo, volta para quem registra entradas (fora os administradores)", async () => {
    await finishGateTraining(db, security);
    await finishGateTraining(db, attendant);
    await finishGateTraining(db, admin);
    expect((await row(security.userId))?.gateTrainingDoneAt).toBeInstanceOf(Date);
    expect((await row(security.userId))?.tutorialSeenAt).toBeInstanceOf(Date);

    expect(await requireGateTrainingAgain(admin)).toEqual({ people: 2 });
    expect((await row(security.userId))?.gateTrainingDoneAt).toBeNull();
    expect((await row(attendant.userId))?.gateTrainingDoneAt).toBeNull();
    // Administrador não é obrigado (é quem pede o treino).
    expect((await row(admin.userId))?.gateTrainingDoneAt).toBeInstanceOf(Date);
    expect((await refused(requireGateTrainingAgain(security))).code).toBe("FORBIDDEN");
  });
});
