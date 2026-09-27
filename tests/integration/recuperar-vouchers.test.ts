/**
 * Perdeu o link dos vouchers: recupera pelo site com o CPF e o WhatsApp da
 * inscrição. Sem revelar quem está inscrito, sem mudar os QR Codes e com
 * registro na auditoria.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { loadGroupByAccessToken } from "@/server/queries/vouchers";
import type { StaffActor } from "@/server/services/actor";
import { DomainError } from "@/server/services/errors";
import { RECOVERY_NOT_FOUND, recoverRegistrationAccess } from "@/server/services/registration";
import { configureEvent, createStaff, randomCpf, registerMember, registerPreAffiliation, resetDatabase } from "../helpers/factories";

let admin: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  await configureEvent(admin);
});

async function refusedWith(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

describe("recuperar vouchers pelo site", () => {
  it("CPF + WhatsApp da inscrição abrem os vouchers do grupo (com ou sem o 9); o link antigo para de funcionar e os QR Codes continuam os mesmos", async () => {
    const group = await registerMember({ guest: true, memberName: "Paola Francinette Santos" });
    const before = await loadGroupByAccessToken(group.accessToken);
    const qrTokens = [before!.member!.token, ...before!.guests.map((card) => card.token)];

    // Cadastrado como (86) 99999-8888; a pessoa digita sem o 9 e com máscara diferente.
    const { accessToken } = await recoverRegistrationAccess({ cpf: group.state.member.cpf!, whatsapp: "86 9999-8888" });
    expect(accessToken).not.toBe(group.accessToken);
    expect(await loadGroupByAccessToken(group.accessToken)).toBeNull();

    const recovered = await loadGroupByAccessToken(accessToken);
    expect(recovered?.memberName).toBe("Paola Francinette Santos");
    expect([recovered!.member!.token, ...recovered!.guests.map((card) => card.token)]).toEqual(qrTokens);

    const audit = await db
      .select({ summary: auditLog.summary, actorLabel: auditLog.actorLabel })
      .from(auditLog)
      .where(and(eq(auditLog.action, "REGISTRATION_ACCESS_RECOVERED"), eq(auditLog.entityId, group.registrationId)));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.summary).toContain("o link anterior deixou de funcionar");
  });

  it("WhatsApp diferente, CPF sem inscrição e CPF do convidado: a mesma resposta (o site não revela quem está inscrito)", async () => {
    const group = await registerMember({ guest: true });
    const wrongPhone = await refusedWith(recoverRegistrationAccess({ cpf: group.state.member.cpf!, whatsapp: "(86) 98888-7777" }));
    const unknownCpf = await refusedWith(recoverRegistrationAccess({ cpf: randomCpf(), whatsapp: "(86) 99999-8888" }));
    const guestCpf = await refusedWith(recoverRegistrationAccess({ cpf: group.input.guest!.cpf!, whatsapp: "(86) 99999-8888" }));
    for (const error of [wrongPhone, unknownCpf, guestCpf]) {
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toBe(RECOVERY_NOT_FOUND);
    }
    // Nada mudou: o link de antes continua valendo.
    expect(await loadGroupByAccessToken(group.accessToken)).not.toBeNull();
  });

  it("vale também para quem preencheu a ficha de filiação no site", async () => {
    const ficha = await registerPreAffiliation({ fullName: "Beatriz Nova Filiada" });
    const { accessToken } = await recoverRegistrationAccess({ cpf: ficha.input.ficha.cpf, whatsapp: "(86) 98888-7777" });
    const recovered = await loadGroupByAccessToken(accessToken);
    expect(recovered?.status).toBe("AWAITING_SIGNATURE");
    expect(recovered?.memberName).toBe("Beatriz Nova Filiada");
  });

  it("CPF ou WhatsApp inválidos são recusados antes de consultar o banco", async () => {
    const error = await recoverRegistrationAccess({ cpf: "123", whatsapp: "12" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeTruthy();
    expect(error).not.toBeInstanceOf(DomainError);
  });
});
