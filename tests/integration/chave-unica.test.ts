/**
 * CPF e matrícula são chaves únicas: nenhuma porta de entrada grava duas pessoas
 * com o mesmo CPF ou a mesma matrícula (a matrícula é comparada sem pontuação).
 */
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { person } from "@/server/db/schema";
import { PUBLIC_ACTOR, type StaffActor } from "@/server/services/actor";
import { createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { addGuest } from "@/server/services/group";
import { registerDeclaredMember, saveAffiliationForm } from "@/server/services/membership";
import { correctPerson } from "@/server/services/people";
import { createRegistration } from "@/server/services/registration";
import { configureEvent, createStaff, randomCpf, randomMatricula, registerMember, registrationInput, resetDatabase, staffFicha } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;

async function refused(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "esperava recusa").toBeInstanceOf(DomainError);
  expect(["CPF_TAKEN", "CONFLICT", "VALIDATION"]).toContain((error as DomainError).code);
  return error as DomainError;
}

async function peopleWith(where: { cpf?: string; key?: string }) {
  const [row] = await db
    .select({ total: count() })
    .from(person)
    .where(where.cpf ? eq(person.cpf, where.cpf) : eq(person.registrationNumberKey, where.key!));
  return Number(row?.total ?? 0);
}

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  await configureEvent(admin, { totalAll: 100, totalEmployee: 10 });
});

describe("CPF e matrícula não se repetem", () => {
  it("inscrição (site e na hora): mesmo CPF ou mesma matrícula com outra pontuação são recusados", async () => {
    const first = await registerMember({ registrationNumber: "12.345-6" });
    await refused(createRegistration(PUBLIC_ACTOR, registrationInput({ memberCpf: first.state.member.cpf! })));
    const matricula = await refused(createRegistration(attendant, registrationInput({ registrationNumber: "123456" })));
    // A mensagem específica aparece em cima do campo destacado.
    expect(Object.values(matricula.fieldErrors ?? {}).join(" ")).toMatch(/Matrícula já cadastrada/);
    expect(await peopleWith({ key: "123456" })).toBe(1);
  });

  it("ficha no Atendimento: matrícula de outra pessoa é recusada", async () => {
    const first = await registerMember({ registrationNumber: "88.001-2" });
    const error = await refused(saveAffiliationForm(attendant, staffFicha({ cpf: randomCpf(), fullName: "Nova Pessoa Teste", registrationNumber: "880012" })));
    expect(error.message).toMatch(/[Mm]atrícula/);
    expect(await peopleWith({ key: "880012" })).toBe(1);
    expect(first.state.member.registrationNumber).toBe("88.001-2");
  });

  it("correção de dados: não dá para passar o CPF ou a matrícula de outra pessoa", async () => {
    const a = await registerMember({ registrationNumber: "55.100-1" });
    const b = await registerMember();
    const base = {
      personId: b.state.member.id,
      fullName: b.state.member.fullName,
      cpf: b.state.member.cpf!,
      whatsapp: "",
      registrationNumber: b.input.member.registrationNumber ?? randomMatricula(),
      workplace: "",
      isMinor: false,
    };
    await refused(correctPerson(attendant, { ...base, cpf: a.state.member.cpf! }));
    await refused(correctPerson(attendant, { ...base, registrationNumber: "551001" }));
    expect(await peopleWith({ cpf: a.state.member.cpf! })).toBe(1);
    expect(await peopleWith({ key: "551001" })).toBe(1);
  });

  it("filiação declarada na portaria (convidado que é filiado): matrícula de outra pessoa é recusada", async () => {
    const other = await registerMember({ registrationNumber: "77.200-3" });
    const group = await registerMember({ guest: true });
    await refused(
      registerDeclaredMember(attendant, {
        personId: group.state.guest!.personId,
        cpf: randomCpf(),
        whatsapp: "86988887777",
        registrationNumber: "772003",
        workplace: "Escola Norte",
        isTeacher: true,
      }),
    );
    expect(await peopleWith({ key: "772003" })).toBe(1);
    expect(other.state.member.id).toBeTruthy();
  });

  it("colaborador(a) e convidado: CPF de quem já está cadastrado não vira segunda pessoa", async () => {
    const member = await registerMember();
    const cpf = member.state.member.cpf!;
    await refused(createEmployee(admin, { fullName: "Rosa Colaboradora", cpf, whatsapp: "", jobTitle: "Financeiro", category: "STAFF", guest: null }));
    const host = await registerMember();
    const guest = await refused(addGuest(attendant, { registrationId: host.registrationId, fullName: "Outra Pessoa Silva", cpf, isMinor: false }));
    expect(guest.fieldErrors?.cpf).toMatch(/filiad/);
    expect(await peopleWith({ cpf })).toBe(1);
  });
});
