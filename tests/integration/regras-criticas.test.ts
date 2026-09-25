/**
 * Testes das regras críticas, executados contra PostgreSQL real (banco *_test),
 * passando pelos mesmos serviços usados pelas server actions.
 */
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { checkIn, guestLink, kitDelivery, kitStock, person, registration } from "@/server/db/schema";
import { registrationSchema, stockSettingsSchema } from "@/domain/schemas";
import { decideAffiliation } from "@/server/services/affiliation";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest, removeGuest } from "@/server/services/group";
import { deliverKit } from "@/server/services/kits";
import { formalizeAffiliation, saveAffiliationForm } from "@/server/services/membership";
import { createRegistration } from "@/server/services/registration";
import { updateStockSettings } from "@/server/services/settings";
import { loadPersonState } from "@/server/services/state";
import { findVoucherByToken, getActiveVoucherToken } from "@/server/services/vouchers";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { formatCpf } from "@/lib/cpf";
import {
  configureEvent,
  createStaff,
  randomCpf,
  registerMember,
  registrationInput,
  reload,
  resetDatabase,
  staffFicha,
  attachTestDocuments,
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

async function confirmedTeacher(options: { guest?: boolean; isTeacher?: boolean; memberName?: string } = {}) {
  const created = await registerMember(options);
  await decideAffiliation(attendant, { registrationId: created.registrationId, decision: "CONFIRM" });
  return { ...created, state: await reload(created.registrationId) };
}

async function checkInPerson(personId: string, actor: StaffActor = security) {
  return registerCheckIn(actor, { personId, method: "SEARCH" });
}

/** Kit que saiu junto com a entrada (null se a pessoa já tinha entrado). */
async function entryKit(personId: string, actor: StaffActor = security) {
  const result = await checkInPerson(personId, actor);
  return result.outcome === "CHECKED_IN" ? result.kit : null;
}

async function stockOf(pool: "ALL" | "MEMBER" | "GUEST" = "ALL") {
  const [row] = await db.select().from(kitStock).where(eq(kitStock.pool, pool));
  return row!;
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin, { stockMode: "SINGLE", totalAll: 100, lowStockThreshold: 5 });
});

describe("1. cada professor(a) leva um único convidado, com direito ao kit", () => {
  it("o formulário aceita no máximo um convidado e só para professoras e professores", () => {
    expect(registrationSchema.safeParse(registrationInput({ guest: true })).success).toBe(true);
    expect(registrationSchema.safeParse(registrationInput({ guest: true, isTeacher: false })).success).toBe(false);
    const sameCpf = registrationInput({ guest: true });
    sameCpf.guest!.cpf = sameCpf.member.cpf;
    expect(registrationSchema.safeParse(sameCpf).success).toBe(false);
  });

  it("o Atendimento não consegue cadastrar um segundo convidado; só trocar", async () => {
    const { state, registrationId } = await confirmedTeacher({ guest: true });
    const current = state.guest!;
    await expectDomainError(
      addGuest(attendant, { registrationId, fullName: "Segundo Convidado Teste", cpf: randomCpf(), isMinor: false }),
      "CONFLICT",
    );
    const swapped = await addGuest(attendant, {
      registrationId,
      fullName: "Convidada Trocada Silva",
      cpf: randomCpf(),
      isMinor: true,
      replaceGuestLinkId: current.guestLinkId,
    });
    expect(swapped.replaced).toBe(true);
    const after = await reload(registrationId);
    expect(after.guest?.fullName).toBe("Convidada Trocada Silva");
    const [old] = await db.select().from(guestLink).where(eq(guestLink.id, current.guestLinkId));
    expect(old!.status).toBe("REMOVED");
  });

  it("o banco rejeita dois convidados ativos para o mesmo professor(a)", async () => {
    const { state } = await registerMember({ guest: true });
    const other = await db
      .insert(person)
      .values({ fullName: "Outra Pessoa", searchName: "outra pessoa", cpf: randomCpf() })
      .returning({ id: person.id });
    await expect(db.insert(guestLink).values({ registrationId: state.id, guestPersonId: other[0]!.id })).rejects.toThrow();
  });
});

describe("2. o kit sai na entrada; convidado não retira kit pelo sistema", () => {
  it("o kit do convidado sai na entrada dele e fica registrado no grupo do(a) professor(a)", async () => {
    const { state } = await confirmedTeacher({ guest: true });
    const guest = state.guest!;
    await checkInPerson(state.member.id);

    const kit = await entryKit(guest.personId);
    expect(kit).toMatchObject({ kind: "DELIVERED", kitType: "GUEST", beneficiaryName: guest.fullName, available: 98 });
    const [delivery] = await db
      .select()
      .from(kitDelivery)
      .where(and(eq(kitDelivery.registrationId, state.id), eq(kitDelivery.kitType, "GUEST")));
    expect(delivery!.recipientPersonId).toBe(state.member.id);
    expect(delivery!.beneficiaryPersonId).toBe(guest.personId);
    expect(delivery!.deliveredByUserId).toBe(security.userId);

    // Pelo cadastro do convidado, nada de kit manual.
    await expectDomainError(deliverKit(attendant, { personId: guest.personId, kitType: "GUEST" }), "GUEST_CANNOT_RECEIVE_KIT");
    await expectDomainError(deliverKit(attendant, { personId: guest.personId, kitType: "MEMBER" }), "GUEST_CANNOT_RECEIVE_KIT");
  });

  it("filiação rejeitada vinculada como convidado entra com o kit de convidado, nunca com o de filiado", async () => {
    const rejected = await registerMember({ memberName: "Joao Rejeitado Lima" });
    await decideAffiliation(attendant, { registrationId: rejected.registrationId, decision: "REJECT" });
    const host = await confirmedTeacher();
    await addGuest(attendant, {
      registrationId: host.registrationId,
      fullName: "Joao Rejeitado Lima",
      cpf: rejected.input.member.cpf,
      isMinor: false,
    });
    await checkInPerson(host.state.member.id);
    expect(await entryKit(rejected.state.member.id)).toMatchObject({ kind: "DELIVERED", kitType: "GUEST" });
    await expectDomainError(
      deliverKit(attendant, { personId: rejected.state.member.id, kitType: "MEMBER" }),
      "GUEST_CANNOT_RECEIVE_KIT",
    );
    expect((await stockOf()).delivered).toBe(2);
  });
});

describe("3. o kit do convidado só sai depois que o(a) professor(a) chegou", () => {
  it("convidado que chega antes entra sem kit; o kit dele sai junto com a chegada do(a) professor(a)", async () => {
    const { state } = await confirmedTeacher({ guest: true });
    const host = state.member.fullName;

    // A portaria já avisa antes de confirmar a entrada do convidado.
    const guestPreview = await loadGateView(db, state.guest!.personId, "SECURITY");
    expect(guestPreview?.kitOnEntry).toEqual({ kind: "WAITING", message: `O kit deste convidado sai quando ${host} chegar.` });
    expect(await entryKit(state.guest!.personId)).toEqual({ kind: "WAITING", message: `Sai quando ${host} chegar.` });
    expect((await stockOf()).delivered).toBe(0);
    // Nem pela entrega manual.
    const blocked = await expectDomainError(
      deliverKit(attendant, { personId: state.member.id, kitType: "GUEST" }),
      "KIT_NOT_AVAILABLE",
    );
    expect(blocked.message).toMatch(/quem convidou chegar/i);

    // A chegada do(a) professor(a) libera os 2 kits de uma vez.
    const hostPreview = await loadGateView(db, state.member.id, "SECURITY");
    expect(hostPreview?.kitOnEntry).toMatchObject({ kind: "WILL_DELIVER", count: 2 });
    const entry = await checkInPerson(state.member.id);
    expect(entry).toMatchObject({
      outcome: "CHECKED_IN",
      kit: { kind: "DELIVERED", kitType: "MEMBER" },
      guestKit: { kind: "DELIVERED", kitType: "GUEST", beneficiaryName: state.guest!.fullName },
    });
    expect((await stockOf()).delivered).toBe(2);
  });

  it("com 1 kit no estoque, a chegada do(a) professor(a) entrega o dele e o do convidado fica sem", async () => {
    await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 1, lowStockThreshold: 0 }));
    const { state } = await confirmedTeacher({ guest: true });
    await checkInPerson(state.guest!.personId);
    const preview = await loadGateView(db, state.member.id, "SECURITY");
    expect(preview?.kitOnEntry).toEqual({ kind: "WILL_DELIVER", count: 1, label: "1 kit de consumação" });
    expect(await checkInPerson(state.member.id)).toMatchObject({
      kit: { kind: "DELIVERED", kitType: "MEMBER" },
      guestKit: { kind: "NONE", message: "Sem kit: o estoque acabou." },
    });
    expect(await stockOf()).toMatchObject({ total: 1, delivered: 1 });
  });

  it("filiado(a) que não é professor(a) entra sem kit", async () => {
    const { state } = await confirmedTeacher({ isTeacher: false });
    expect(await entryKit(state.member.id)).toEqual({ kind: "NONE", message: "Sem kit: não é professor(a)." });
    expect((await stockOf()).delivered).toBe(0);
  });
});

describe("3b. kit do convidado só com a entrada do convidado", () => {
  it("convidado fictício não gera kit: o kit dele só sai quando ele entra", async () => {
    const { state } = await confirmedTeacher({ guest: true });
    expect(await checkInPerson(state.member.id)).toMatchObject({ kit: { kind: "DELIVERED", kitType: "MEMBER" }, guestKit: null });

    const blocked = await expectDomainError(
      deliverKit(attendant, { personId: state.member.id, kitType: "GUEST" }),
      "KIT_NOT_AVAILABLE",
    );
    expect(blocked.message).toMatch(/entrada do convidado/i);
    expect((await stockOf()).delivered).toBe(1);

    expect(await entryKit(state.guest!.personId)).toMatchObject({ kind: "DELIVERED", beneficiaryName: state.guest!.fullName });
  });

  it("estornar a entrada devolve ao estoque o kit que saiu com ela", async () => {
    const { state, registrationId } = await confirmedTeacher({ guest: true });
    await checkInPerson(state.member.id);
    await checkInPerson(state.guest!.personId);
    expect((await stockOf()).delivered).toBe(2);

    const cancelled = await cancelCheckIn(admin, { personId: state.guest!.personId, justification: "Entrada registrada por engano" });
    expect(cancelled.kitsReturned).toBe(1);
    expect((await stockOf()).delivered).toBe(1);
    const after = await reload(registrationId);
    expect(after.deliveries.GUEST).toBeUndefined();
    expect(after.deliveries.MEMBER).toBeDefined();

    // Voltou a entrar: o kit sai de novo, uma única vez.
    expect(await entryKit(state.guest!.personId)).toMatchObject({ kind: "DELIVERED", kitType: "GUEST" });
    expect((await stockOf()).delivered).toBe(2);
  });

  it("estornar a entrada do(a) professor(a) devolve o kit dele(a) e o do convidado", async () => {
    const { state, registrationId } = await confirmedTeacher({ guest: true });
    await checkInPerson(state.member.id);
    await checkInPerson(state.guest!.personId);

    const cancelled = await cancelCheckIn(admin, { personId: state.member.id, justification: "Entrada registrada por engano" });
    expect(cancelled.kitsReturned).toBe(2);
    expect((await stockOf()).delivered).toBe(0);
    expect((await reload(registrationId)).deliveries).toEqual({});

    // O convidado continua lá dentro: quando o(a) professor(a) entrar de verdade, saem os 2 kits.
    expect(await checkInPerson(state.member.id)).toMatchObject({
      kit: { kind: "DELIVERED", kitType: "MEMBER" },
      guestKit: { kind: "DELIVERED", kitType: "GUEST" },
    });
    expect((await stockOf()).delivered).toBe(2);
  });
});

describe("4. kit não pode ser entregue duas vezes", () => {
  it("depois da entrada, uma nova entrega do mesmo kit é recusada", async () => {
    const { state } = await confirmedTeacher({ guest: true });
    await checkInPerson(state.member.id);
    await checkInPerson(state.guest!.personId);
    await expectDomainError(deliverKit(attendant, { personId: state.member.id, kitType: "MEMBER" }), "ALREADY_DELIVERED");
    await expectDomainError(deliverKit(attendant, { personId: state.member.id, kitType: "GUEST" }), "ALREADY_DELIVERED");
    // Ler o QR de novo não entrega outro kit.
    expect((await checkInPerson(state.member.id)).outcome).toBe("ALREADY");
    expect((await stockOf()).delivered).toBe(2);
  });

  it("entradas simultâneas da mesma pessoa entregam um único kit", async () => {
    const { state } = await confirmedTeacher();
    const results = await Promise.all(Array.from({ length: 5 }, () => checkInPerson(state.member.id)));
    expect(results.filter((r) => r.outcome === "CHECKED_IN")).toHaveLength(1);
    const [row] = await db
      .select({ total: count() })
      .from(kitDelivery)
      .where(and(eq(kitDelivery.registrationId, state.id), isNull(kitDelivery.cancelledAt)));
    expect(row!.total).toBe(1);
    expect((await stockOf()).delivered).toBe(1);
  });

  it("entregas manuais simultâneas (kit que não saiu na entrada) resultam em uma única entrega", async () => {
    await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 0, lowStockThreshold: 0 }));
    const { state } = await confirmedTeacher();
    expect(await entryKit(state.member.id)).toEqual({ kind: "NONE", message: "Sem kit: o estoque acabou." });

    await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 10, lowStockThreshold: 0 }));
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => deliverKit(attendant, { personId: state.member.id, kitType: "MEMBER" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await stockOf()).delivered).toBe(1);
  });
});

describe("5. QR não pode registrar entrada duas vezes", () => {
  it("o mesmo QR retorna 'entrada já registrada' com data/hora", async () => {
    const { state } = await confirmedTeacher();
    const voucherToken = await getActiveVoucherToken(db, state.member.id);
    const found = await findVoucherByToken(db, voucherToken!.token);
    expect(found?.personId).toBe(state.member.id);

    const first = await registerCheckIn(security, { personId: found!.personId, method: "QR", voucherId: found!.voucherId });
    expect(first.outcome).toBe("CHECKED_IN");
    const second = await registerCheckIn(security, { personId: found!.personId, method: "QR", voucherId: found!.voucherId });
    expect(second.outcome).toBe("ALREADY");
    expect(second.checkIn.checkedInAt.getTime()).toBe(first.checkIn.checkedInAt.getTime());
    expect(second.checkIn.checkedInByName).toBe(security.name);
  });

  it("leituras simultâneas geram um único registro de entrada", async () => {
    const { state } = await confirmedTeacher();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => registerCheckIn(security, { personId: state.member.id, method: "QR" })),
    );
    expect(results.filter((r) => r.outcome === "CHECKED_IN")).toHaveLength(1);
    const [row] = await db.select({ total: count() }).from(checkIn).where(eq(checkIn.personId, state.member.id));
    expect(row!.total).toBe(1);
  });

  it("filiação pendente não entra até a conferência", async () => {
    const { state } = await registerMember();
    await expectDomainError(checkInPerson(state.member.id), "ENTRY_BLOCKED");
  });
});

describe("6. segurança não consegue confirmar filiação", () => {
  it("perfil SECURITY recebe FORBIDDEN e o status continua pendente", async () => {
    const { registrationId } = await registerMember();
    await expectDomainError(decideAffiliation(security, { registrationId, decision: "CONFIRM" }), "FORBIDDEN");
    await expectDomainError(decideAffiliation(security, { registrationId, decision: "REJECT" }), "FORBIDDEN");
    const [row] = await db.select({ status: registration.status }).from(registration).where(eq(registration.id, registrationId));
    expect(row!.status).toBe("PENDING");
  });

  it("segurança também não entrega kits nem edita convidados", async () => {
    const { state, registrationId } = await confirmedTeacher({ guest: true });
    await checkInPerson(state.member.id);
    await expectDomainError(deliverKit(security, { personId: state.member.id, kitType: "MEMBER" }), "FORBIDDEN");
    await expectDomainError(
      addGuest(security, { registrationId, fullName: "Novo Convidado Teste", cpf: randomCpf(), isMinor: false }),
      "FORBIDDEN",
    );
    await expectDomainError(removeGuest(security, { guestLinkId: state.guest!.guestLinkId }), "FORBIDDEN");
  });
});

describe("7. CPF e matrícula não criam participante duplicado", () => {
  it("mesmo CPF (com ou sem máscara) é recusado como filiado e como convidado", async () => {
    const cpf = randomCpf();
    await registerMember({ memberCpf: cpf });

    const duplicateMember = await expectDomainError(
      createRegistration(PUBLIC_ACTOR, registrationInput({ memberCpf: formatCpf(cpf) })),
      "CPF_TAKEN",
    );
    expect(duplicateMember.fieldErrors?.["member.cpf"]).toBeDefined();

    const duplicateGuest = await expectDomainError(
      createRegistration(PUBLIC_ACTOR, registrationInput({ guest: true, guestCpf: cpf })),
      "CPF_TAKEN",
    );
    expect(duplicateGuest.fieldErrors?.["guest.cpf"]).toBeDefined();

    const [row] = await db.select({ total: count() }).from(person).where(eq(person.cpf, cpf));
    expect(row!.total).toBe(1);
  });

  it("a mesma matrícula (com outra pontuação) é recusada", async () => {
    await registerMember({ registrationNumber: "12.345-6" });
    const error = await expectDomainError(
      createRegistration(PUBLIC_ACTOR, registrationInput({ registrationNumber: "123456" })),
      "CPF_TAKEN",
    );
    expect(error.fieldErrors?.["member.registrationNumber"]).toMatch(/Matrícula/);
    // O banco também impede, mesmo fora dos serviços.
    await expect(
      db.insert(person).values({ fullName: "Pessoa X", searchName: "pessoa x", cpf: randomCpf(), registrationNumber: "12 345 6" }),
    ).rejects.toThrow();
  });

  it("o banco impede CPF duplicado mesmo fora dos serviços", async () => {
    const cpf = randomCpf();
    await db.insert(person).values({ fullName: "Pessoa Um", searchName: "pessoa um", cpf });
    await expect(db.insert(person).values({ fullName: "Pessoa Dois", searchName: "pessoa dois", cpf })).rejects.toThrow();
  });

  it("atendimento não consegue cadastrar como convidado quem já é filiado", async () => {
    const member = await registerMember();
    const host = await confirmedTeacher();
    await expectDomainError(
      addGuest(attendant, {
        registrationId: host.registrationId,
        fullName: "Outra Pessoa Nome",
        cpf: member.input.member.cpf,
        isMinor: false,
      }),
      "CONFLICT",
    );
  });
});

describe("8. convidado promovido a filiado não é duplicado", () => {
  it("mantém a mesma pessoa, o mesmo CPF e o mesmo voucher", async () => {
    const host = await confirmedTeacher({ guest: true });
    const guest = host.state.guest!;
    const voucherBefore = await getActiveVoucherToken(db, guest.personId);
    const [peopleBefore] = await db.select({ total: count() }).from(person);

    const form = await saveAffiliationForm(attendant, staffFicha({ personId: guest.personId, cpf: guest.cpf!, fullName: guest.fullName }));
    expect(form.personId).toBe(guest.personId);
    await attachTestDocuments(attendant, form.formId);
    const result = await formalizeAffiliation(attendant, form.formId);

    const [peopleAfter] = await db.select({ total: count() }).from(person);
    expect(peopleAfter!.total).toBe(peopleBefore!.total);
    const [cpfRows] = await db.select({ total: count() }).from(person).where(eq(person.cpf, guest.cpf!));
    expect(cpfRows!.total).toBe(1);

    const [reg] = await db.select().from(registration).where(eq(registration.id, result.registrationId));
    expect(reg!.memberPersonId).toBe(guest.personId);
    expect(reg!.status).toBe("JOINED_AT_EVENT");

    const voucherAfter = await getActiveVoucherToken(db, guest.personId);
    expect(voucherAfter?.code).toBe(voucherBefore?.code);
  });
});

describe("9. regra especial: convidado que vira filiado", () => {
  it("libera a vaga do responsável, preserva o histórico e dá direitos próprios", async () => {
    const host = await confirmedTeacher({ guest: true });
    const guest = host.state.guest!;
    // Responsável já entrou (o kit dele saiu na entrada).
    expect(await entryKit(host.state.member.id)).toMatchObject({ kind: "DELIVERED", kitType: "MEMBER" });

    // O convidado se filia na recepção, antes de entrar.
    const form = await saveAffiliationForm(attendant, staffFicha({ personId: guest.personId, cpf: guest.cpf!, fullName: guest.fullName }));
    await attachTestDocuments(attendant, form.formId);
    const promoted = await formalizeAffiliation(attendant, form.formId);
    expect(promoted.conversion).toEqual({
      hostRegistrationId: host.registrationId,
      hostName: host.state.member.fullName,
      guestKitReleased: true,
    });

    // Responsável anterior: sem convidado, livre para chamar outro.
    const hostAfter = await reload(host.registrationId);
    expect(hostAfter.guest).toBeNull();

    // Histórico de quem convidou é preservado.
    const [oldLink] = await db.select().from(guestLink).where(eq(guestLink.id, guest.guestLinkId));
    expect(oldLink!.status).toBe("CONVERTED");
    expect(oldLink!.registrationId).toBe(host.registrationId);
    expect(oldLink!.convertedToRegistrationId).toBe(promoted.registrationId);
    const personState = await loadPersonState(db, guest.personId);
    expect(personState?.pastGuestLinks[0]?.hostName).toBe(host.state.member.fullName);
    expect(personState?.guestOf).toBeNull();

    // Responsável chama outro convidado, que recebe o kit de convidado na entrada.
    await addGuest(attendant, {
      registrationId: host.registrationId,
      fullName: "Nova Convidada Oliveira",
      cpf: randomCpf(),
      isMinor: false,
    });
    expect(await entryKit((await reload(host.registrationId)).guest!.personId)).toMatchObject({
      kind: "DELIVERED",
      kitType: "GUEST",
      beneficiaryName: "Nova Convidada Oliveira",
    });

    // Novo filiado entra como filiado e recebe o próprio kit.
    expect(await entryKit(guest.personId)).toMatchObject({ kind: "DELIVERED", kitType: "MEMBER", beneficiaryName: guest.fullName });

    // E pode levar o próprio convidado.
    await addGuest(attendant, {
      registrationId: promoted.registrationId,
      fullName: "Convidada Do Novo Filiado",
      cpf: randomCpf(),
      isMinor: true,
    });
    expect(await entryKit((await reload(promoted.registrationId)).guest!.personId)).toMatchObject({
      kind: "DELIVERED",
      beneficiaryName: "Convidada Do Novo Filiado",
    });
    expect((await stockOf()).delivered).toBe(4);
  });

  it("quem já entrou como convidado e ganhou o kit não ganha outro ao virar filiado; o responsável também não", async () => {
    const host = await confirmedTeacher({ guest: true });
    const guest = host.state.guest!;
    await checkInPerson(host.state.member.id);
    expect(await entryKit(guest.personId)).toMatchObject({ kind: "DELIVERED", kitType: "GUEST" });

    const form = await saveAffiliationForm(attendant, staffFicha({ personId: guest.personId, cpf: guest.cpf!, fullName: guest.fullName }));
    await attachTestDocuments(attendant, form.formId);
    const promoted = await formalizeAffiliation(attendant, form.formId);
    expect(promoted.conversion?.guestKitReleased).toBe(false);

    // Um kit por pessoa: o kit que ele(a) recebeu como convidado(a) vale.
    const blocked = await expectDomainError(deliverKit(attendant, { personId: guest.personId, kitType: "MEMBER" }), "KIT_NOT_AVAILABLE");
    expect(blocked.message).toMatch(/como convidado/i);

    // O kit de convidado do responsável já foi usado.
    await addGuest(attendant, { registrationId: host.registrationId, fullName: "Outro Convidado Lima", cpf: randomCpf(), isMinor: false });
    expect(await entryKit((await reload(host.registrationId)).guest!.personId)).toEqual({
      kind: "NONE",
      message: "Sem kit: o kit de convidado deste grupo já foi entregue.",
    });
    await expectDomainError(deliverKit(attendant, { personId: host.state.member.id, kitType: "GUEST" }), "ALREADY_DELIVERED");
    expect((await stockOf()).delivered).toBe(2);
  });

  it("convidado cujo kit já saiu não pode ser trocado", async () => {
    const host = await confirmedTeacher({ guest: true });
    await checkInPerson(host.state.member.id);
    expect(await entryKit(host.state.guest!.personId)).toMatchObject({ kind: "DELIVERED", kitType: "GUEST" });
    await expectDomainError(
      addGuest(attendant, {
        registrationId: host.registrationId,
        fullName: "Troca Tardia Souza",
        cpf: randomCpf(),
        isMinor: false,
        replaceGuestLinkId: host.state.guest!.guestLinkId,
      }),
      "INVALID_STATE",
    );
    await expectDomainError(removeGuest(attendant, { guestLinkId: host.state.guest!.guestLinkId }), "INVALID_STATE");
  });
});

describe("10. estoque nunca fica negativo", () => {
  it("sem estoque, a pessoa entra do mesmo jeito, sem kit", async () => {
    await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 1, lowStockThreshold: 0 }));
    const first = await confirmedTeacher();
    const second = await confirmedTeacher();
    const preview = await loadGateView(db, first.state.member.id, "SECURITY");
    expect(preview?.kitOnEntry).toEqual({ kind: "WILL_DELIVER", count: 1, label: "1 kit de consumação" });
    expect(await entryKit(first.state.member.id)).toMatchObject({ kind: "DELIVERED", available: 0, low: true });

    // A tela da portaria já avisa antes de confirmar.
    const outOfStock = await loadGateView(db, second.state.member.id, "SECURITY");
    expect(outOfStock?.kitOnEntry).toEqual({ kind: "NONE", message: "Sem kit: o estoque acabou." });
    const entry = await checkInPerson(second.state.member.id);
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "NONE", message: "Sem kit: o estoque acabou." } });
    await expectDomainError(deliverKit(attendant, { personId: second.state.member.id, kitType: "MEMBER" }), "OUT_OF_STOCK");
    expect(await stockOf()).toMatchObject({ total: 1, delivered: 1 });
  });

  it("entradas simultâneas nunca ultrapassam o estoque", async () => {
    await updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 3, lowStockThreshold: 0 }));
    const members = [];
    for (let i = 0; i < 6; i++) members.push(await confirmedTeacher());
    const results = await Promise.all(members.map((m) => checkInPerson(m.state.member.id)));
    expect(results.every((r) => r.outcome === "CHECKED_IN")).toBe(true);
    const kits = results.map((r) => (r.outcome === "CHECKED_IN" ? r.kit.kind : null));
    expect(kits.filter((k) => k === "DELIVERED")).toHaveLength(3);
    expect(kits.filter((k) => k === "NONE")).toHaveLength(3);
    expect(await stockOf()).toMatchObject({ total: 3, delivered: 3 });
  });

  it("constraint do banco impede estoque negativo e total abaixo do entregue", async () => {
    await expect(
      db.update(kitStock).set({ delivered: sql`${kitStock.total} + 1` }).where(eq(kitStock.pool, "ALL")),
    ).rejects.toThrow();
    const member = await confirmedTeacher();
    await checkInPerson(member.state.member.id);
    await expectDomainError(
      updateStockSettings(admin, stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 0, lowStockThreshold: 0 })),
      "VALIDATION",
    );
  });

  it("no estoque separado, esgotar kits de convidado não afeta kits de professor(a)", async () => {
    await updateStockSettings(
      admin,
      stockSettingsSchema.parse({ stockMode: "SPLIT", totalMember: 5, totalGuest: 0, lowStockThreshold: 1 }),
    );
    const host = await confirmedTeacher({ guest: true });
    expect(await entryKit(host.state.member.id)).toMatchObject({ kind: "DELIVERED", kitType: "MEMBER", available: 4 });
    expect(await entryKit(host.state.guest!.personId)).toEqual({ kind: "NONE", message: "Sem kit: o estoque acabou." });
    expect(await stockOf("MEMBER")).toMatchObject({ total: 5, delivered: 1 });
    await expectDomainError(deliverKit(attendant, { personId: host.state.member.id, kitType: "GUEST" }), "OUT_OF_STOCK");
  });
});
