/**
 * Festa das servidoras e servidores (o mesmo sistema, outra edição): sem a
 * pergunta "é professor(a)?", todo filiado(a) tem kit e convidado, mesmo que
 * chegue outra resposta, e os textos falam de servidoras e servidores.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITION } from "@/domain/edition";
import { DEFAULT_EVENT_NAME, KIT_TYPE_LABEL, TEACHER_LABEL } from "@/domain/labels";
import { affiliationFormSchema, declaredMemberSchema, registrationSchema } from "@/domain/schemas";
import { db } from "@/server/db";
import { auditLog, registration } from "@/server/db/schema";
import type { StaffActor } from "@/server/services/actor";
import { decideAffiliation } from "@/server/services/affiliation";
import { DomainError } from "@/server/services/errors";
import { setTeacherStatus } from "@/server/services/group";
import { registerDeclaredMember } from "@/server/services/membership";
import { configureEvent, createStaff, randomCpf, registerMember, registrationInput, resetDatabase, staffFicha } from "../helpers/factories";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FESTA_EDICAO = "servidores";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_FESTA_EDICAO;
});

let admin: StaffActor;
let attendant: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  await configureEvent(admin);
});

describe("festa das servidoras e servidores", () => {
  it("é a edição de verão, com o nome e os textos desta festa", () => {
    expect(EDITION).toMatchObject({ id: "servidores", theme: "verao", askTeacher: false });
    expect(DEFAULT_EVENT_NAME).toBe("Festa das Servidoras e Servidores – SINDSERMTHE");
    expect(KIT_TYPE_LABEL.MEMBER).toBe("Kit do(a) servidor(a)");
    expect(TEACHER_LABEL(true)).toBe("Servidor(a)");
  });

  it("sem a pergunta, a resposta vale sempre sim (vazia ou até um não que chegue)", () => {
    for (const isTeacher of [false, null, undefined]) {
      expect(registrationSchema.parse({ ...registrationInput({ guest: true }), isTeacher }).isTeacher).toBe(true);
      expect(affiliationFormSchema.parse({ ...staffFicha({ cpf: randomCpf(), fullName: "Rafaela Nova Filiada" }), isTeacher }).isTeacher).toBe(true);
      expect(
        declaredMemberSchema.parse({ personId: crypto.randomUUID(), whatsapp: "86999990000", registrationNumber: "4455-1", workplace: "Secretaria de Saúde", isTeacher })
          .isTeacher,
      ).toBe(true);
    }
  });

  it("todo filiado(a) inscrito(a) tem kit e leva convidado; a correção para 'não é' não existe nesta festa", async () => {
    const member = await registerMember({ isTeacher: false, guest: true, memberName: "Sandra Servidora Lopes" });
    expect(member.state.isTeacher).toBe(true);
    expect(member.state.guest).not.toBeNull();
    expect(member.state.kitWaitlist).toEqual({ MEMBER: null, GUEST: null });
    const [created] = await db.select().from(auditLog).where(eq(auditLog.action, "REGISTRATION_CREATED"));
    expect(created?.summary).toContain("Inscrição de Sandra Servidora Lopes (servidor(a)) com convidado(a)");

    const error = await setTeacherStatus(attendant, { registrationId: member.registrationId, isTeacher: false }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).toBe("Nesta festa, toda pessoa filiada tem kit e convidado.");
    const [row] = await db.select({ isTeacher: registration.isTeacher }).from(registration).where(eq(registration.id, member.registrationId));
    expect(row?.isTeacher).toBe(true);
  });

  it("convidado(a) que se declara filiado(a) também entra com kit, sem responder a pergunta", async () => {
    const host = await registerMember({ guest: true });
    await decideAffiliation(attendant, { registrationId: host.registrationId, decision: "CONFIRM" });
    const declared = await registerDeclaredMember(attendant, {
      personId: host.state.guest!.personId,
      whatsapp: "86999990000",
      registrationNumber: "4455-1",
      workplace: "Secretaria de Saúde",
    } as Parameters<typeof registerDeclaredMember>[1]);
    const [row] = await db
      .select({ isTeacher: registration.isTeacher, waitlisted: registration.memberKitWaitlistedAt })
      .from(registration)
      .where(eq(registration.id, declared.registrationId));
    expect(row).toEqual({ isTeacher: true, waitlisted: null });
  });
});
