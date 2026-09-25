/**
 * Casos-limite: convidado com filiação pendente, filiação rejeitada vinculada
 * como convidado, busca por CPF/matrícula/código na portaria e operações
 * simultâneas.
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { checkIn, guestLink, kitDelivery, person, registration, voucher } from "@/server/db/schema";
import { formatCpf } from "@/lib/cpf";
import { decideAffiliation, reopenAffiliation } from "@/server/services/affiliation";
import type { StaffActor } from "@/server/services/actor";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest, removeGuest } from "@/server/services/group";
import { cancelKitDelivery, deliverKit } from "@/server/services/kits";
import { registerDeclaredMember } from "@/server/services/membership";
import { searchPeople } from "@/server/services/people";
import { findActiveGuestLink } from "@/server/services/state";
import { reissueVoucher } from "@/server/services/vouchers";
import { configureEvent, createStaff, randomCpf, registerMember, reload, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;
let security: StaffActor;

async function gateView(personId: string, role: StaffActor["role"] = "SECURITY") {
  const view = await loadGateView(db, personId, role);
  if (!view) throw new Error("Pessoa não encontrada");
  return view;
}

async function activeVoucherCode(personId: string) {
  const [row] = await db
    .select({ id: voucher.id, code: voucher.code })
    .from(voucher)
    .where(and(eq(voucher.personId, personId), isNull(voucher.revokedAt)));
  if (!row) throw new Error("Voucher ativo não encontrado");
  return row;
}

const declaredData = { whatsapp: "86999990000", registrationNumber: "4455-1", workplace: "Escola Municipal Leste" };

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin);
});

describe("convidado que declara ser filiado(a)", () => {
  it("continua convidado até a conferência; a confirmação libera a vaga do responsável", async () => {
    const host = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const guest = host.state.guest!;

    const declared = await registerDeclaredMember(attendant, { personId: guest.personId, ...declaredData, isTeacher: true });
    const [reg] = await db.select().from(registration).where(eq(registration.id, declared.registrationId));
    expect(reg).toMatchObject({ memberPersonId: guest.personId, status: "PENDING", origin: "GUEST_CONVERSION", isTeacher: true });

    // Pendente: segue como convidado do responsável.
    expect((await reload(host.registrationId)).guest?.personId).toBe(guest.personId);
    const pendingView = await gateView(guest.personId);
    expect(pendingView.role).toBe("GUEST");
    expect(pendingView.entry).toMatchObject({ kind: "ALLOWED", role: "GUEST" });

    const decision = await decideAffiliation(attendant, { registrationId: declared.registrationId, decision: "CONFIRM" });
    expect(decision.conversion).toMatchObject({ hostRegistrationId: host.registrationId, guestKitReleased: true });
    expect((await reload(host.registrationId)).guest).toBeNull();
    const [link] = await db.select().from(guestLink).where(eq(guestLink.id, guest.guestLinkId));
    expect(link).toMatchObject({ status: "CONVERTED", convertedToRegistrationId: declared.registrationId });

    const [people] = await db.select({ total: count() }).from(person).where(eq(person.cpf, guest.cpf!));
    expect(people!.total).toBe(1);
    const memberView = await gateView(guest.personId);
    expect(memberView.role).toBe("MEMBER");
    expect(memberView.pastGuestLinks).toEqual([expect.objectContaining({ status: "CONVERTED", hostName: host.state.member.fullName })]);
  });

  it("filiação não confirmada mantém a pessoa como convidada", async () => {
    const host = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const guest = host.state.guest!;
    const declared = await registerDeclaredMember(attendant, { personId: guest.personId, ...declaredData, isTeacher: false });
    const decision = await decideAffiliation(attendant, { registrationId: declared.registrationId, decision: "REJECT" });
    expect(decision.conversion).toBeNull();
    expect((await reload(host.registrationId)).guest?.personId).toBe(guest.personId);
    const view = await gateView(guest.personId);
    expect(view.role).toBe("GUEST");
    expect(view.entry).toMatchObject({ kind: "ALLOWED", role: "GUEST" });
  });
});

describe("filiação rejeitada vinculada como convidado", () => {
  it("ao reabrir e confirmar, deixa de ser convidado — nunca filiado e convidado ao mesmo tempo", async () => {
    const rejected = await registerMember({ memberName: "Rita Rejeitada Souza" });
    await decideAffiliation(attendant, { registrationId: rejected.registrationId, decision: "REJECT" });
    const host = await registerMember({ memberName: "Bruno Anfitriao Costa" });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });

    const linked = await addGuest(attendant, {
      registrationId: host.registrationId,
      fullName: "Rita Rejeitada Souza",
      cpf: rejected.input.member.cpf,
      isMinor: false,
    });
    expect(linked.reusedPerson).toBe(true);
    expect((await gateView(rejected.state.member.id)).role).toBe("GUEST");

    await reopenAffiliation(admin, { registrationId: rejected.registrationId, justification: "Documento de filiação apresentado" });
    const pendingView = await gateView(rejected.state.member.id);
    expect(pendingView.role).toBe("GUEST");
    expect(pendingView.entry).toMatchObject({ kind: "ALLOWED", role: "GUEST" });

    const decision = await decideAffiliation(attendant, { registrationId: rejected.registrationId, decision: "CONFIRM" });
    expect(decision.conversion?.hostRegistrationId).toBe(host.registrationId);
    expect(await findActiveGuestLink(db, rejected.state.member.id)).toBeNull();
    expect((await reload(host.registrationId)).guest).toBeNull();
    expect((await gateView(rejected.state.member.id)).role).toBe("MEMBER");
  });

  it("convidado de filiação não confirmada pode ser desvinculado e ir para outro(a) professor(a)", async () => {
    const group = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "REJECT" });
    const guest = group.state.guest!;

    const view = await gateView(guest.personId, "ATTENDANT");
    expect(view.host).toMatchObject({ status: "REJECTED", guestLinkId: guest.guestLinkId });
    expect(view.entry).toMatchObject({ kind: "BLOCKED", code: "HOST_REJECTED" });

    await removeGuest(attendant, { guestLinkId: guest.guestLinkId });
    expect((await reload(group.registrationId)).guest).toBeNull();

    const other = await registerMember({ memberName: "Otavio Outro Filiado" });
    await decideAffiliation(attendant, { registrationId: other.registrationId, decision: "CONFIRM" });
    const relinked = await addGuest(attendant, {
      registrationId: other.registrationId,
      fullName: guest.fullName,
      cpf: guest.cpf!,
      isMinor: false,
    });
    expect(relinked.reusedPerson).toBe(true);
    expect((await gateView(guest.personId)).entry).toMatchObject({ kind: "ALLOWED", role: "GUEST" });
  });
});

describe("busca na portaria", () => {
  it("Segurança só encontra por CPF completo; Atendimento pode buscar por parte do CPF", async () => {
    const { input, state } = await registerMember();
    const cpf = input.member.cpf;
    expect(await searchPeople(db, cpf.slice(0, 6), { fullCpf: false })).toEqual([]);
    expect(await searchPeople(db, cpf.slice(2, 9), { mode: "cpf", fullCpf: false })).toEqual([]);
    expect((await searchPeople(db, cpf.slice(0, 6), { fullCpf: true })).map((r) => r.personId)).toContain(state.member.id);
    const exact = await searchPeople(db, formatCpf(cpf), { fullCpf: false });
    expect(exact.map((r) => r.personId)).toEqual([state.member.id]);
    expect(exact[0]!.cpfDisplay).toMatch(/^\*\*\*\./);
  });

  it("encontra pela matrícula exata, com ou sem pontuação", async () => {
    const { state } = await registerMember({ registrationNumber: "77.123-4" });
    expect((await searchPeople(db, "771234", { fullCpf: false })).map((r) => r.personId)).toEqual([state.member.id]);
    expect((await searchPeople(db, "77.123-4", { fullCpf: false })).map((r) => r.personId)).toEqual([state.member.id]);
  });

  it("código do voucher encontra a pessoa, inclusive só com letras; código cancelado não encontra", async () => {
    const { state } = await registerMember();
    const personId = state.member.id;
    const original = await activeVoucherCode(personId);
    expect((await searchPeople(db, original.code, { fullCpf: false })).map((r) => r.personId)).toEqual([personId]);

    await db.update(voucher).set({ code: "ABCDEFGH" }).where(eq(voucher.id, original.id));
    expect((await searchPeople(db, "abcd-efgh", { fullCpf: false })).map((r) => r.personId)).toEqual([personId]);

    const reissued = await reissueVoucher(attendant, personId);
    expect(await searchPeople(db, "ABCD-EFGH", { fullCpf: false })).toEqual([]);
    expect((await searchPeople(db, reissued.code, { fullCpf: false })).map((r) => r.personId)).toEqual([personId]);
  });
});

describe("kit do convidado após troca", () => {
  it("o novo convidado não aparece como tendo recebido o kit entregue para o anterior", async () => {
    const group = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
    await registerCheckIn(security, { personId: group.state.member.id, method: "SEARCH" });
    const first = group.state.guest!;
    const firstEntry = await registerCheckIn(security, { personId: first.personId, method: "SEARCH" });
    expect(firstEntry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", kitType: "GUEST" } });

    // Para trocar depois da entrada, o administrador estorna a entrada: o kit que saiu com ela volta ao estoque.
    const cancelled = await cancelCheckIn(admin, { personId: first.personId, justification: "Convidado errado na inscrição" });
    expect(cancelled.kitsReturned).toBe(1);
    await addGuest(attendant, {
      registrationId: group.registrationId,
      fullName: "Segunda Convidada Lima",
      cpf: randomCpf(),
      isMinor: false,
      replaceGuestLinkId: first.guestLinkId,
    });
    const second = (await reload(group.registrationId)).guest!;
    const secondView = await gateView(second.personId);
    expect(secondView.guestKit).toMatchObject({ delivered: false, deliveredForOther: false });
    expect(secondView.kitOnEntry).toEqual({ kind: "WILL_DELIVER", count: 1, label: "1 kit de convidado" });
    const secondEntry = await registerCheckIn(security, { personId: second.personId, method: "SEARCH" });
    expect(secondEntry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", beneficiaryName: "Segunda Convidada Lima" } });
    expect((await gateView(second.personId)).guestKit).toMatchObject({ delivered: true });
  });
});

const ROUND_NAMES = ["Alfa", "Beta", "Gama", "Delta"];

describe("operações simultâneas", () => {
  it("entrega de kit e estorno da entrada ao mesmo tempo nunca deixam entrega sem entrada", async () => {
    for (let round = 0; round < 4; round++) {
      const group = await registerMember({ memberName: `Professora Rodada ${ROUND_NAMES[round]} Silva` });
      const memberId = group.state.member.id;
      await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
      await registerCheckIn(security, { personId: memberId, method: "SEARCH" });
      // O kit saiu na entrada: estorna só a entrega, para ele voltar a ficar pendente
      // (é o caso da entrega manual, quando o kit não saiu na hora).
      const [entryDelivery] = await db
        .select({ id: kitDelivery.id })
        .from(kitDelivery)
        .where(and(eq(kitDelivery.registrationId, group.registrationId), isNull(kitDelivery.cancelledAt)));
      await cancelKitDelivery(admin, { deliveryId: entryDelivery!.id, justification: "Kit devolvido na recepção" });

      await Promise.allSettled([
        deliverKit(attendant, { personId: memberId, kitType: "MEMBER" }),
        cancelCheckIn(admin, { personId: memberId, justification: "Entrada registrada por engano" }),
      ]);

      const [delivered] = await db
        .select({ total: count() })
        .from(kitDelivery)
        .where(and(eq(kitDelivery.registrationId, group.registrationId), isNull(kitDelivery.cancelledAt)));
      const [present] = await db
        .select({ total: count() })
        .from(checkIn)
        .where(and(eq(checkIn.personId, memberId), isNull(checkIn.cancelledAt)));
      if (delivered!.total > 0) expect(present!.total).toBe(1);
    }
  });

  it("remoção do convidado e entrada dele ao mesmo tempo nunca deixam entrada de quem saiu", async () => {
    for (let round = 0; round < 4; round++) {
      const group = await registerMember({ guest: true, memberName: `Anfitriao Rodada ${ROUND_NAMES[round]} Lima` });
      await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
      const guest = group.state.guest!;
      // O(a) professor(a) já chegou: a entrada do convidado leva o kit dele junto.
      await registerCheckIn(security, { personId: group.state.member.id, method: "SEARCH" });

      await Promise.allSettled([
        removeGuest(attendant, { guestLinkId: guest.guestLinkId }),
        registerCheckIn(security, { personId: guest.personId, method: "SEARCH" }),
      ]);

      const [link] = await db.select({ status: guestLink.status }).from(guestLink).where(eq(guestLink.id, guest.guestLinkId));
      const [present] = await db
        .select({ total: count() })
        .from(checkIn)
        .where(and(eq(checkIn.personId, guest.personId), isNull(checkIn.cancelledAt)));
      const [kits] = await db
        .select({ total: count() })
        .from(kitDelivery)
        .where(
          and(
            eq(kitDelivery.registrationId, group.registrationId),
            eq(kitDelivery.kitType, "GUEST"),
            isNull(kitDelivery.cancelledAt),
          ),
        );
      if (link!.status === "REMOVED") expect(present!.total).toBe(0);
      else expect(present!.total).toBe(1);
      // O kit de convidado só existe se a entrada dele existe.
      expect(kits!.total).toBe(present!.total);
    }
  });

  it("dois atendentes cadastrando convidado ao mesmo tempo: fica só um", async () => {
    const group = await registerMember();
    await decideAffiliation(attendant, { registrationId: group.registrationId, decision: "CONFIRM" });
    const results = await Promise.allSettled([
      addGuest(attendant, { registrationId: group.registrationId, fullName: "Primeira Tentativa Souza", cpf: randomCpf(), isMinor: false }),
      addGuest(attendant, { registrationId: group.registrationId, fullName: "Segunda Tentativa Souza", cpf: randomCpf(), isMinor: false }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [active] = await db
      .select({ total: count() })
      .from(guestLink)
      .where(and(eq(guestLink.registrationId, group.registrationId), eq(guestLink.status, "ACTIVE")));
    expect(active!.total).toBe(1);
  });
});
