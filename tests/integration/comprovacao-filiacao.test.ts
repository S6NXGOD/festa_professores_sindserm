/**
 * Filiação marcada como "não confirmada" que a pessoa comprova na hora
 * (ex.: contracheque com o desconto do SINDSERM).
 */
import { eq } from "drizzle-orm";
import { ROLE_PRESETS } from "@/domain/access";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { confirmAfterProof, decideAffiliation } from "@/server/services/affiliation";
import { registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { configureEvent, createStaff, registerMember, reload, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperava erro ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}

const PROOF = "Mostrou o contracheque com o desconto do SINDSERM";

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin);
});

describe("filiação não confirmada, comprovada na hora", () => {
  it("o Atendimento confirma direto, registrando como a pessoa comprovou", async () => {
    const { registrationId, state } = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId, decision: "REJECT", note: "Não encontrada na lista" });
    expect((await loadGateView(db, state.member.id, ROLE_PRESETS.SECURITY))?.entry.kind).toBe("BLOCKED");
    expect((await loadGateView(db, state.guest!.personId, ROLE_PRESETS.SECURITY))?.entry.kind).toBe("BLOCKED");

    // Segurança não confirma filiação; a comprovação precisa ser descrita.
    await expectDomainError(confirmAfterProof(security, { registrationId, justification: PROOF }), "FORBIDDEN");
    await expect(confirmAfterProof(attendant, { registrationId, justification: "ok" })).rejects.toThrow();

    const result = await confirmAfterProof(attendant, { registrationId, justification: PROOF });
    expect(result.status).toBe("CONFIRMED");
    const after = await reload(registrationId);
    expect(after.status).toBe("CONFIRMED");
    expect(after.statusNote).toBe(PROOF);
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "AFFILIATION_PROVEN"));
    expect(audit?.summary).toContain("contracheque");

    // Professor(a) e convidado passam a entrar normalmente.
    expect((await registerCheckIn(security, { personId: state.member.id, method: "SEARCH" })).outcome).toBe("CHECKED_IN");
    expect((await registerCheckIn(security, { personId: state.guest!.personId, method: "QR" })).outcome).toBe("CHECKED_IN");
  });

  it("só vale para filiação que foi marcada como não confirmada", async () => {
    const pending = await registerMember();
    await expectDomainError(confirmAfterProof(attendant, { registrationId: pending.registrationId, justification: PROOF }), "INVALID_STATE");
    await decideAffiliation(attendant, { registrationId: pending.registrationId, decision: "CONFIRM" });
    await expectDomainError(confirmAfterProof(attendant, { registrationId: pending.registrationId, justification: PROOF }), "INVALID_STATE");
  });
});
