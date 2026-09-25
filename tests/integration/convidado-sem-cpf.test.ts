/**
 * Convidado sem CPF: o CPF do convidado é opcional (crianças, quem não sabe de
 * cabeça). CPF continua obrigatório e único para filiados.
 */
import { eq } from "drizzle-orm";
import { ROLE_PRESETS } from "@/domain/access";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { person } from "@/server/db/schema";
import { decideAffiliation } from "@/server/services/affiliation";
import type { StaffActor } from "@/server/services/actor";
import { registerCheckIn } from "@/server/services/checkin";
import { DomainError } from "@/server/services/errors";
import { loadGateView } from "@/server/services/gate-view";
import { addGuest, removeGuest } from "@/server/services/group";
import { deliverKit } from "@/server/services/kits";
import { formalizeAffiliation, registerDeclaredMember, saveAffiliationForm } from "@/server/services/membership";
import { correctPerson, searchPeople } from "@/server/services/people";
import {
  configureEvent,
  createStaff,
  randomCpf,
  randomMatricula,
  registerMember,
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

async function cpfOf(personId: string) {
  const [row] = await db.select({ cpf: person.cpf }).from(person).where(eq(person.id, personId));
  return row?.cpf;
}

/** Professor(a) confirmado(a) com convidado sem CPF. */
async function teacherWithCpflessGuest(guestName = "Pedro Crianca Souza") {
  const created = await registerMember({ guest: true, guestCpf: "", guestName });
  await decideAffiliation(attendant, { registrationId: created.registrationId, decision: "CONFIRM" });
  return { ...created, state: await reload(created.registrationId) };
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  security = await createStaff("SECURITY", "Sergio Seguranca");
  await configureEvent(admin);
});

describe("inscrição com convidado sem CPF", () => {
  it("cria o convidado sem CPF, com voucher próprio, e o kit dele segue as regras", async () => {
    const { state } = await teacherWithCpflessGuest();
    expect(state.guest).not.toBeNull();
    expect(state.guest!.cpf).toBeNull();

    const view = await loadGateView(db, state.guest!.personId, ROLE_PRESETS.ATTENDANT);
    expect(view?.cpf).toBe("Sem CPF");
    expect(view?.voucherCode).toBeTruthy();

    // Kit do convidado: só sai com a entrada do próprio convidado.
    await registerCheckIn(security, { personId: state.member.id, method: "SEARCH" });
    await expectDomainError(deliverKit(attendant, { personId: state.member.id, kitType: "GUEST" }), "KIT_NOT_AVAILABLE");
    const entry = await registerCheckIn(security, { personId: state.guest!.personId, method: "QR" });
    expect(entry).toMatchObject({ outcome: "CHECKED_IN", kit: { kind: "DELIVERED", kitType: "GUEST", beneficiaryName: "Pedro Crianca Souza" } });
  });

  it("vários convidados sem CPF convivem (CPF vazio não conta como repetido)", async () => {
    await teacherWithCpflessGuest("Pedro Crianca Souza");
    await teacherWithCpflessGuest("Pedro Crianca Souza");
    const rows = await db.select({ id: person.id }).from(person).where(eq(person.fullName, "Pedro Crianca Souza"));
    expect(rows).toHaveLength(2);
  });

  it("CPF do convidado, quando informado, continua único e diferente do(a) professor(a)", async () => {
    const cpf = randomCpf();
    await registerMember({ guest: true, guestCpf: cpf });
    const error = await expectDomainError(registerMember({ guest: true, guestCpf: cpf }), "CPF_TAKEN");
    expect(error.fieldErrors?.["guest.cpf"]).toBeTruthy();
    const memberCpf = randomCpf();
    await expect(registerMember({ guest: true, memberCpf, guestCpf: memberCpf })).rejects.toThrow();
  });

  it("busca por nome encontra o convidado sem CPF; busca por CPF não quebra", async () => {
    const { state } = await teacherWithCpflessGuest("Pedro Crianca Souza");
    const byName = await searchPeople(db, "Pedro Crianca", { fullCpf: true });
    expect(byName.map((r) => r.personId)).toContain(state.guest!.personId);
    expect(byName.find((r) => r.personId === state.guest!.personId)?.cpfDisplay).toBe("Sem CPF");
    expect(await searchPeople(db, "529.982.247-25", { fullCpf: true })).toEqual([]);
  });
});

describe("convidado com o mesmo nome do(a) professor(a)", () => {
  it("sem CPF é recusado (seria a própria pessoa); com CPF, homônimo é aceito", async () => {
    const same = { guest: true, memberName: "João Pedro Pinto", guestName: "joão  pedro PINTO" };
    await expect(registerMember({ ...same, guestCpf: "" })).rejects.toThrow("Mesmo nome do(a) professor(a)");
    const created = await registerMember({ ...same, guestCpf: randomCpf() });
    expect(created.state.guest?.fullName).toBe("joão pedro PINTO");

    // O Atendimento também não cadastra a própria pessoa como convidada sem CPF.
    const host = await registerMember({ memberName: "Ana Clara Rocha" });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const error = await expectDomainError(
      addGuest(attendant, { registrationId: host.registrationId, fullName: "Ana Clara Rocha", cpf: "", isMinor: false }),
      "VALIDATION",
    );
    expect(error.fieldErrors?.cpf).toBeTruthy();
  });
});

describe("Atendimento: convidado sem CPF", () => {
  it("cadastra e troca convidados sem CPF; vincula pessoa existente pelo id", async () => {
    const host = await registerMember();
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const first = await addGuest(attendant, { registrationId: host.registrationId, fullName: "Ana Sem Documento", cpf: "", isMinor: true });
    expect(first.reusedPerson).toBe(false);
    expect(await cpfOf(first.personId)).toBeNull();

    const swapped = await addGuest(attendant, {
      registrationId: host.registrationId,
      fullName: "Bia Sem Documento",
      cpf: "",
      isMinor: true,
      replaceGuestLinkId: first.guestLinkId,
    });
    expect(swapped.replaced).toBe(true);
    expect((await reload(host.registrationId)).guest?.fullName).toBe("Bia Sem Documento");

    // A primeira convidada (sem CPF) pode ser vinculada a outro(a) professor(a) pela identidade.
    const other = await registerMember();
    await decideAffiliation(attendant, { registrationId: other.registrationId, decision: "CONFIRM" });
    const linked = await addGuest(attendant, {
      registrationId: other.registrationId,
      personId: first.personId,
      fullName: "Ana Sem Documento",
      cpf: "",
      isMinor: true,
    });
    expect(linked.personId).toBe(first.personId);
    expect(linked.reusedPerson).toBe(true);

    // Mas não de duas pessoas (professoras ou professores) ao mesmo tempo.
    await removeGuest(attendant, { guestLinkId: swapped.guestLinkId });
    await expectDomainError(
      addGuest(attendant, { registrationId: host.registrationId, personId: first.personId, fullName: "Ana Sem Documento", cpf: "", isMinor: true }),
      "CONFLICT",
    );
  });
});

describe("convidado sem CPF que vira filiado(a)", () => {
  it("cadastro como filiado(a) exige CPF e grava no cadastro", async () => {
    const { state } = await teacherWithCpflessGuest("Carlos Convidado Lima");
    const guestId = state.guest!.personId;
    const base = { personId: guestId, whatsapp: "86988887777", registrationNumber: randomMatricula(), workplace: "Escola Norte", isTeacher: true };
    const missing = await expectDomainError(registerDeclaredMember(attendant, base), "VALIDATION");
    expect(missing.fieldErrors?.cpf).toBeTruthy();

    const taken = randomCpf();
    await registerMember({ memberCpf: taken });
    await expectDomainError(registerDeclaredMember(attendant, { ...base, cpf: taken }), "CPF_TAKEN");

    const cpf = randomCpf();
    await registerDeclaredMember(attendant, { ...base, cpf });
    expect(await cpfOf(guestId)).toBe(cpf);
  });

  it("ficha de filiação completa o CPF e a assinatura torna a pessoa filiada", async () => {
    const { state } = await teacherWithCpflessGuest("Diana Convidada Rocha");
    const guest = state.guest!;
    const cpf = randomCpf();
    const form = await saveAffiliationForm(attendant, staffFicha({ personId: guest.personId, cpf, fullName: guest.fullName }));
    expect(form.personId).toBe(guest.personId);
    expect(await cpfOf(guest.personId)).toBe(cpf);
    await attachTestDocuments(attendant, form.formId);
    const promoted = await formalizeAffiliation(attendant, form.formId);
    const own = await reload(promoted.registrationId);
    expect(own.status).toBe("JOINED_AT_EVENT");
    expect(own.member.cpf).toBe(cpf);
  });
});

describe("correção de cadastro: CPF", () => {
  it("inclui CPF no convidado, recusa CPF de outra pessoa e não deixa filiado sem CPF", async () => {
    const { state } = await teacherWithCpflessGuest("Eva Convidada Alves");
    const guestId = state.guest!.personId;
    const correction = { personId: guestId, fullName: "Eva Convidada Alves", whatsapp: "", registrationNumber: "", workplace: "", isMinor: false };

    const cpf = randomCpf();
    await correctPerson(attendant, { ...correction, cpf });
    expect(await cpfOf(guestId)).toBe(cpf);
    // Convidado pode voltar a ficar sem CPF.
    await correctPerson(attendant, { ...correction, cpf: "" });
    expect(await cpfOf(guestId)).toBeNull();

    await expectDomainError(correctPerson(attendant, { ...correction, cpf: state.member.cpf! }), "CPF_TAKEN");
    await expectDomainError(
      correctPerson(attendant, {
        personId: state.member.id,
        fullName: state.member.fullName,
        cpf: "",
        whatsapp: "",
        registrationNumber: "",
        workplace: "",
        isMinor: false,
      }),
      "VALIDATION",
    );
  });
});
