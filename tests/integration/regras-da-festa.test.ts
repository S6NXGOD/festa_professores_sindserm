/**
 * Regras específicas da Festa das Professoras e Professores: kit e convidado só
 * para professoras e professores, horário limite para retirada de kits e ficha de filiação
 * preenchida antes da festa (assinatura na recepção).
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { affiliationForm, registration } from "@/server/db/schema";
import { preAffiliationSchema } from "@/domain/schemas";
import { decideAffiliation } from "@/server/services/affiliation";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest, setTeacherStatus } from "@/server/services/group";
import { deliverKit } from "@/server/services/kits";
import { cancelAffiliationForm, formalizeAffiliation, saveAffiliationForm } from "@/server/services/membership";
import { createPreAffiliation } from "@/server/services/registration";
import {
  configureEvent,
  createStaff,
  preAffiliationInput,
  randomCpf,
  registerMember,
  registerPreAffiliation,
  reload,
  resetDatabase,
  staffFicha,
  attachTestDocuments,
  withUploadedDocuments,
} from "../helpers/factories";

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

async function openFormOf(registrationId: string) {
  const [form] = await db.select().from(affiliationForm).where(eq(affiliationForm.registrationId, registrationId));
  if (!form) throw new Error("Ficha não encontrada");
  return form;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
});

describe("filiado(a) que não é professor(a)", () => {
  beforeEach(() => configureEvent(admin));

  it("entra na festa, mas sem kit e sem convidado", async () => {
    const member = await registerMember({ isTeacher: false, memberName: "Carlos Servidor Costa" });
    await decideAffiliation(attendant, { registrationId: member.registrationId, decision: "CONFIRM" });
    const before = await loadGateView(db, member.state.member.id, "SECURITY");
    expect(before?.kitOnEntry).toEqual({ kind: "NONE", message: "Sem kit: não é professor(a)." });
    const entry = await registerCheckIn(security, { personId: member.state.member.id, method: "SEARCH" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE", message: "Sem kit: não é professor(a)." } });

    const kit = await expectDomainError(
      deliverKit(attendant, { personId: member.state.member.id, kitType: "MEMBER" }),
      "KIT_NOT_AVAILABLE",
    );
    expect(kit.message).toMatch(/exclusivo para professoras e professores/i);
    await expectDomainError(
      addGuest(attendant, { registrationId: member.registrationId, fullName: "Convidado Nao Pode", cpf: randomCpf(), isMinor: false }),
      "INVALID_STATE",
    );

    const view = await loadGateView(db, member.state.member.id, "ATTENDANT");
    expect(view?.ownRegistration).toMatchObject({ isTeacher: false, canHaveGuest: false });
    expect(view?.ownRegistration?.kits.MEMBER).toMatchObject({ kind: "BLOCKED" });
  });

  it("a resposta pode ser corrigida pelo Atendimento; deixar de ser professor(a) exige sem kit e sem convidado", async () => {
    const member = await registerMember({ isTeacher: false });
    await decideAffiliation(attendant, { registrationId: member.registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: member.state.member.id, method: "SEARCH" });

    await expectDomainError(setTeacherStatus(security, { registrationId: member.registrationId, isTeacher: true }), "FORBIDDEN");
    await setTeacherStatus(attendant, { registrationId: member.registrationId, isTeacher: true });
    // Já tinha entrado sem kit: agora o kit sai pela entrega manual.
    await deliverKit(attendant, { personId: member.state.member.id, kitType: "MEMBER" });
    await expectDomainError(
      setTeacherStatus(attendant, { registrationId: member.registrationId, isTeacher: false }),
      "INVALID_STATE",
    );

    const withGuest = await registerMember({ guest: true });
    await expectDomainError(
      setTeacherStatus(attendant, { registrationId: withGuest.registrationId, isTeacher: false }),
      "INVALID_STATE",
    );
  });
});

describe("horário limite para entregar kits", () => {
  it("quem entra depois do horário entra sem kit, inclusive quando passa da meia-noite", async () => {
    await configureEvent(admin, { eventDate: "2026-10-15", startTime: "19:00", kitDeadlineTime: "01:00" });
    const host = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });

    // 01h do dia 16 em São Paulo = 04h UTC.
    const beforeDeadline = new Date("2026-10-16T03:59:00Z");
    const afterDeadline = new Date("2026-10-16T04:00:00Z");
    const onTime = await registerCheckIn(security, { personId: host.state.member.id, method: "SEARCH" }, beforeDeadline);
    expect(onTime).toMatchObject({ kit: { kind: "DELIVERED", kitType: "MEMBER" } });
    const late = await registerCheckIn(security, { personId: host.state.guest!.personId, method: "SEARCH" }, afterDeadline);
    expect(late).toMatchObject({
      outcome: "CHECKED_IN",
      kit: { kind: "NONE", message: "Sem kit: o horário de entregar kits já passou." },
    });
    const manual = await expectDomainError(
      deliverKit(attendant, { personId: host.state.member.id, kitType: "GUEST" }, afterDeadline),
      "KIT_NOT_AVAILABLE",
    );
    expect(manual.message).toMatch(/prazo/i);
  });

  it("sem horário configurado, não há limite", async () => {
    await configureEvent(admin);
    const host = await registerMember();
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const far = new Date("2030-01-01T00:00:00Z");
    const entry = await registerCheckIn(security, { personId: host.state.member.id, method: "SEARCH" }, far);
    expect(entry).toMatchObject({ kit: { kind: "DELIVERED", kitType: "MEMBER" } });
  });
});

describe("ficha de filiação preenchida antes da festa", () => {
  beforeEach(() => configureEvent(admin));

  it("fica aguardando assinatura: não entra até assinar; depois tem todos os direitos", async () => {
    const pre = await registerPreAffiliation({ guest: true });
    expect(pre.state.status).toBe("AWAITING_SIGNATURE");
    const form = await openFormOf(pre.registrationId);
    expect(form).toMatchObject({ status: "DRAFT", origin: "PUBLIC", isTeacher: true, createdByUserId: null });
    expect(form.authorizationText).toMatch(/novembro do ano de 2026/);

    const memberId = pre.state.member.id;
    const guestId = pre.state.guest!.personId;
    const blocked = await expectDomainError(registerCheckIn(security, { personId: memberId, method: "QR" }), "ENTRY_BLOCKED");
    expect(blocked.message).toMatch(/assinar a ficha/i);
    await expectDomainError(registerCheckIn(security, { personId: guestId, method: "QR" }), "ENTRY_BLOCKED");
    // Conferência de "já filiado" não se aplica: a confirmação é pela assinatura.
    await expectDomainError(
      decideAffiliation(attendant, { registrationId: pre.registrationId, decision: "CONFIRM" }),
      "INVALID_STATE",
    );

    const signed = await formalizeAffiliation(attendant, form.id);
    expect(signed.registrationId).toBe(pre.registrationId);
    expect((await reload(pre.registrationId)).status).toBe("JOINED_AT_EVENT");

    const memberEntry = await registerCheckIn(security, { personId: memberId, method: "QR" });
    expect(memberEntry).toMatchObject({ kit: { kind: "DELIVERED", kitType: "MEMBER" } });
    const guestEntry = await registerCheckIn(security, { personId: guestId, method: "QR" });
    expect(guestEntry).toMatchObject({ kit: { kind: "DELIVERED", kitType: "GUEST", beneficiaryName: pre.state.guest!.fullName } });
  });

  it("se a pessoa não assinar, a ficha é cancelada e a inscrição deixa de valer", async () => {
    const pre = await registerPreAffiliation();
    const form = await openFormOf(pre.registrationId);
    await cancelAffiliationForm(attendant, form.id);
    const [reg] = await db.select().from(registration).where(eq(registration.id, pre.registrationId));
    expect(reg!.status).toBe("REJECTED");
  });

  it("o Atendimento pode revisar a ficha; a resposta 'professor(a)' acompanha a inscrição", async () => {
    const pre = await registerPreAffiliation({ isTeacher: true });
    const form = await openFormOf(pre.registrationId);
    await saveAffiliationForm(
      attendant,
      staffFicha({
        personId: form.personId,
        cpf: form.cpf,
        fullName: form.fullName,
        isTeacher: false,
        registrationNumber: form.registrationNumber,
      }),
      form.id,
    );
    expect((await reload(pre.registrationId)).isTeacher).toBe(false);
  });

  it("valida o formulário e não aceita CPF ou matrícula já cadastrados", async () => {
    expect(preAffiliationSchema.safeParse({ ...preAffiliationInput(), authorizationAccepted: false }).success).toBe(false);
    expect(preAffiliationSchema.safeParse(preAffiliationInput({ isTeacher: false, guest: true })).success).toBe(false);

    const first = await registerPreAffiliation();
    const sameCpf = preAffiliationInput({ cpf: first.input.ficha.cpf });
    const cpfError = await expectDomainError(createPreAffiliation(PUBLIC_ACTOR, sameCpf), "CPF_TAKEN");
    expect(cpfError.fieldErrors?.["ficha.cpf"]).toBeDefined();

    const sameMatricula = preAffiliationInput();
    sameMatricula.ficha.registrationNumber = first.input.ficha.registrationNumber;
    const matriculaError = await expectDomainError(createPreAffiliation(PUBLIC_ACTOR, sameMatricula), "CPF_TAKEN");
    expect(matriculaError.fieldErrors?.["ficha.registrationNumber"]).toBeDefined();
  });

  it("reenvio do mesmo formulário não duplica", async () => {
    const input = await withUploadedDocuments(preAffiliationInput({ guest: true }));
    const a = await createPreAffiliation(PUBLIC_ACTOR, input);
    const b = await createPreAffiliation(PUBLIC_ACTOR, input);
    expect(b.reused).toBe(true);
    expect(b.registrationId).toBe(a.registrationId);
  });
});

describe("ficha de filiação feita no Atendimento", () => {
  beforeEach(() => configureEvent(admin));

  it("guarda o texto da autorização com o mês/ano de início e a resposta 'professor(a)'", async () => {
    const cpf = randomCpf();
    const saved = await saveAffiliationForm(attendant, staffFicha({ cpf, fullName: "Beatriz Nova Silva", isTeacher: true }));
    const [form] = await db.select().from(affiliationForm).where(eq(affiliationForm.id, saved.formId));
    expect(form).toMatchObject({ origin: "STAFF", isTeacher: true, createdByUserId: attendant.userId });
    expect(form!.authorizationText).toMatch(/1% \(um por cento\) do meu salário base, a partir do mês de novembro do ano de 2026/);
    await attachTestDocuments(attendant, saved.formId);
    const result = await formalizeAffiliation(attendant, saved.formId);
    expect((await reload(result.registrationId)).isTeacher).toBe(true);
  });
});
