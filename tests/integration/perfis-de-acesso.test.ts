/**
 * Perfis de acesso: o que cada perfil pode fazer, conferido na regra e nos
 * serviços do servidor (a interface só esconde botões; quem barra é o servidor).
 * Os perfis viraram modelos de permissões por área: os modelos precisam
 * reproduzir exatamente as regras de antes, e o ajuste por pessoa também é barrado no servidor.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { type AccessMap, can, homePathFor, type Permission, resolveAccess, ROLE_PRESETS, sanitizeAccess } from "@/domain/access";
import { stockSettingsSchema } from "@/domain/schemas";
import type { StaffRole } from "@/domain/types";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { type StaffActor, staffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { cancelCheckIn, registerCheckIn } from "@/server/services/checkin";
import { createEmployee } from "@/server/services/employees";
import { DomainError } from "@/server/services/errors";
import { deliverKit } from "@/server/services/kits";
import { saveAffiliationForm } from "@/server/services/membership";
import { correctPerson } from "@/server/services/people";
import { updateStockSettings } from "@/server/services/settings";
import { createStaffUser, markPasswordChanged, resetStaffPassword, updateStaffUser } from "@/server/services/users";
import { configureEvent, createStaff, randomCpf, registerMember, resetDatabase, staffFicha } from "../helpers/factories";

/** As 15 permissões que existiam antes da personalização. */
const LEGACY: Permission[] = [
  "checkIn",
  "search",
  "viewPanel",
  "validateAffiliation",
  "registerAtEvent",
  "newAffiliation",
  "manageGuests",
  "deliverKits",
  "viewFullCpf",
  "reissueVoucher",
  "adminCorrections",
  "manageEmployees",
  "manageUsers",
  "manageSettings",
  "viewAudit",
];

/** O comportamento combinado para cada perfil (não pode mudar sem decisão da organização). */
const EXPECTED: Record<StaffRole, Permission[]> = {
  ADMIN: LEGACY,
  ATTENDANT: [
    "checkIn",
    "search",
    "viewPanel",
    "validateAffiliation",
    "registerAtEvent",
    "newAffiliation",
    "manageGuests",
    "deliverKits",
    "viewFullCpf",
    "reissueVoucher",
  ],
  SECURITY: ["checkIn", "search"],
};

async function expectDomainError(promise: Promise<unknown>, code: DomainError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `esperava ${code}`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  return error as DomainError;
}
const expectForbidden = (promise: Promise<unknown>) => expectDomainError(promise, "FORBIDDEN");

describe("perfis-modelo = regras de antes", () => {
  for (const role of Object.keys(EXPECTED) as StaffRole[]) {
    it(`${role}: exatamente as permissões combinadas`, () => {
      const granted = LEGACY.filter((permission) => can(ROLE_PRESETS[role], permission));
      expect(granted.sort()).toEqual([...EXPECTED[role]].sort());
    });
  }

  it("cada perfil cai na sua tela inicial", () => {
    expect(homePathFor(ROLE_PRESETS.ADMIN)).toBe("/painel");
    expect(homePathFor(ROLE_PRESETS.ATTENDANT)).toBe("/painel");
    expect(homePathFor(ROLE_PRESETS.SECURITY)).toBe("/portaria");
  });

  it("permissões gravadas não dão acesso a mais: nível inválido vira 'sem acesso'; JSON quebrado cai no perfil", () => {
    const tampered = sanitizeAccess({ modules: { placar: "edit", usuarios: "view", portaria: "edit", kits: "hack" }, fullCpf: "sim" });
    expect(tampered.modules).toMatchObject({ placar: "none", usuarios: "none", portaria: "edit", kits: "none" });
    expect(tampered.fullCpf).toBe(false);
    expect(resolveAccess("SECURITY", "{quebrado")).toEqual(ROLE_PRESETS.SECURITY);
    expect(resolveAccess("ATTENDANT", null)).toEqual(ROLE_PRESETS.ATTENDANT);
  });
});

describe("o servidor barra quem não tem permissão", () => {
  let admin: StaffActor;
  let attendant: StaffActor;
  let security: StaffActor;
  const stock = stockSettingsSchema.parse({ stockMode: "SINGLE", totalAll: 50, lowStockThreshold: 5 });
  const newUser = (access?: AccessMap) => ({
    name: "Pessoa Nova Teste",
    email: `nova.${randomCpf()}@teste.local`,
    role: "ATTENDANT" as const,
    password: "senha-bem-longa-123",
    access,
  });
  const newEmployee = () => ({ fullName: "Colaborador Teste Silva", cpf: "", whatsapp: "", jobTitle: "Secretaria", guest: null });

  beforeEach(async () => {
    await resetDatabase();
    admin = await createStaff("ADMIN", "Ana Administradora");
    attendant = await createStaff("ATTENDANT", "Paulo Atendente");
    security = await createStaff("SECURITY", "Sergio Seguranca");
    await configureEvent(admin);
  });

  it("Segurança/Recepção: só busca e registra entradas", async () => {
    const host = await registerMember();
    await expectForbidden(decideAffiliation(security, { registrationId: host.registrationId, decision: "CONFIRM" }));
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    await expectForbidden(deliverKit(security, { personId: host.state.member.id, kitType: "MEMBER" }));
    await expectForbidden(saveAffiliationForm(security, staffFicha({ cpf: randomCpf(), fullName: "Ficha Da Seguranca" })));
    await expectForbidden(createStaffUser(security, newUser()));
    await expectForbidden(createEmployee(security, newEmployee()));
    await expectForbidden(updateStockSettings(security, stock));
    const entry = await registerCheckIn(security, { personId: host.state.member.id, method: "SEARCH" });
    expect(entry.outcome).toBe("CHECKED_IN");
    await expectForbidden(cancelCheckIn(security, { personId: host.state.member.id, justification: "Entrada registrada por engano" }));
  });

  it("Atendimento: conferência, fichas, kits e portaria; nada de administração", async () => {
    const host = await registerMember();
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    await saveAffiliationForm(attendant, staffFicha({ cpf: randomCpf(), fullName: "Ficha Do Atendimento" }));
    await correctPerson(attendant, {
      personId: host.state.member.id,
      fullName: "Maria Filiada Corrigida",
      cpf: host.state.member.cpf!,
      whatsapp: "",
      registrationNumber: "",
      workplace: "",
      isMinor: false,
    });
    await registerCheckIn(attendant, { personId: host.state.member.id, method: "SEARCH" });
    await expectForbidden(cancelCheckIn(attendant, { personId: host.state.member.id, justification: "Entrada registrada por engano" }));
    await expectForbidden(createStaffUser(attendant, newUser()));
    await expectForbidden(createEmployee(attendant, newEmployee()));
    await expectForbidden(updateStockSettings(attendant, stock));
  });

  it("Administrador: tudo, inclusive estornar entrada, usuários, colaboradores e estoque", async () => {
    const host = await registerMember();
    await decideAffiliation(admin, { registrationId: host.registrationId, decision: "CONFIRM" });
    await registerCheckIn(admin, { personId: host.state.member.id, method: "SEARCH" });
    await cancelCheckIn(admin, { personId: host.state.member.id, justification: "Entrada registrada por engano" });
    await createStaffUser(admin, newUser());
    await createEmployee(admin, newEmployee());
    await updateStockSettings(admin, stock);
  });

  it("permissões ajustadas valem no servidor: tirar uma área barra as ações dela", async () => {
    const semFichas: AccessMap = { ...ROLE_PRESETS.ATTENDANT, modules: { ...ROLE_PRESETS.ATTENDANT.modules, fichas: "view", portaria: "view" } };
    const custom = staffActor({ userId: attendant.userId, name: attendant.name, role: "ATTENDANT", access: semFichas });
    const host = await registerMember();
    await decideAffiliation(custom, { registrationId: host.registrationId, decision: "CONFIRM" });
    await expectForbidden(saveAffiliationForm(custom, staffFicha({ cpf: randomCpf(), fullName: "Ficha Sem Permissao" })));
    await expectForbidden(registerCheckIn(custom, { personId: host.state.member.id, method: "SEARCH" }));
    expect(can(semFichas, "search")).toBe(true);
    expect(can(semFichas, "viewForms")).toBe(true);

    // E dar uma área a mais também vale: Segurança com colaboradores.
    const plus: AccessMap = { ...ROLE_PRESETS.SECURITY, modules: { ...ROLE_PRESETS.SECURITY.modules, colaboradores: "edit" } };
    await createEmployee(staffActor({ userId: security.userId, name: security.name, role: "SECURITY", access: plus }), newEmployee());
  });
});

describe("usuários: permissões, trava do último administrador e senha provisória", () => {
  let admin: StaffActor;

  beforeEach(async () => {
    await resetDatabase();
    admin = await createStaff("ADMIN", "Ana Administradora");
  });

  async function row(userId: string) {
    const [found] = await db.select().from(user).where(eq(user.id, userId));
    return found!;
  }

  it("grava só o que difere do perfil e a senha inicial é provisória", async () => {
    const plain = await createStaffUser(admin, {
      name: "Beto Portaria",
      email: "beto@teste.local",
      role: "SECURITY",
      password: "senha-provisoria-1",
      access: ROLE_PRESETS.SECURITY,
    });
    expect(await row(plain!.userId)).toMatchObject({ permissions: null, mustChangePassword: true });

    const tuned: AccessMap = { ...ROLE_PRESETS.SECURITY, modules: { ...ROLE_PRESETS.SECURITY.modules, placar: "view" } };
    const custom = await createStaffUser(admin, { name: "Cida Recepcao", email: "cida@teste.local", role: "SECURITY", password: "senha-provisoria-2", access: tuned });
    const saved = await row(custom!.userId);
    expect(resolveAccess(saved.role, saved.permissions)).toEqual(tuned);
    expect(homePathFor(tuned)).toBe("/painel");
  });

  it("não deixa o sistema sem ninguém para administrar usuários, nem a pessoa mexer no próprio acesso", async () => {
    // Mexer no próprio acesso: não.
    await expectDomainError(
      updateStaffUser(admin, { userId: admin.userId, name: admin.name, role: "ATTENDANT", active: true }),
      "INVALID_STATE",
    );
    // Com outra pessoa administrando usuários, rebaixar alguém é permitido.
    const other = await createStaff("ADMIN", "Outro Administrador");
    await updateStaffUser(admin, { userId: other.userId, name: other.name, role: "ATTENDANT", active: true });
    // Quem tem "Acesso ao sistema" por ajuste também conta como administrador de usuários.
    const gerente = await createStaff("ATTENDANT", "Gerente Personalizado");
    const managerAccess: AccessMap = { ...ROLE_PRESETS.ATTENDANT, modules: { ...ROLE_PRESETS.ATTENDANT.modules, usuarios: "edit" } };
    await updateStaffUser(admin, { userId: gerente.userId, name: gerente.name, role: "ATTENDANT", active: true, access: managerAccess });
    const manager = staffActor({ userId: gerente.userId, name: gerente.name, role: "ATTENDANT", access: managerAccess });
    await updateStaffUser(manager, { userId: admin.userId, name: admin.name, role: "ADMIN", active: false });
    // Agora o gerente é o último: tirar o acesso dele trava (mesmo vindo de outra pessoa).
    const error = await expectDomainError(
      updateStaffUser(admin, { userId: gerente.userId, name: gerente.name, role: "ATTENDANT", active: true, access: ROLE_PRESETS.ATTENDANT }),
      "INVALID_STATE",
    );
    expect(error.message).toMatch(/pelo menos uma pessoa ativa/);
  });

  it("administrador pode pedir nova senha; redefinir senha também pede; criar a própria senha libera", async () => {
    const pessoa = await createStaff("ATTENDANT", "Rodrigo Atendimento");
    expect((await row(pessoa.userId)).mustChangePassword).toBe(false);
    await updateStaffUser(admin, { userId: pessoa.userId, name: pessoa.name, role: "ATTENDANT", active: true, mustChangePassword: true });
    expect((await row(pessoa.userId)).mustChangePassword).toBe(true);
    await markPasswordChanged(pessoa);
    expect((await row(pessoa.userId)).mustChangePassword).toBe(false);
    await resetStaffPassword(admin, { userId: pessoa.userId, password: "outra-senha-provisoria" });
    expect((await row(pessoa.userId)).mustChangePassword).toBe(true);
  });
});
