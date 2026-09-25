import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { affiliationForm, guestLink, person, registration } from "@/server/db/schema";
import {
  type AddGuestInput,
  addGuestSchema,
  guestNameClash,
  SAME_NAME_EMPLOYEE_GUEST_MESSAGE,
  SAME_NAME_GUEST_MESSAGE,
  type TeacherStatusInput,
  teacherStatusSchema,
} from "@/domain/schemas";
import { guestRemovalCheck } from "@/domain/rules";
import { maskCpf } from "@/lib/cpf";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { lockEmployeeGroup, lockEmployeeRows, lockPersons, lockRegistration, lockRegistrationRow } from "./locks";
import { personSearchFields } from "./registration";
import {
  type ActiveGuest,
  type EmployeeGroupState,
  findActiveGuestLink,
  findRegistrationIdByMember,
  isActiveEmployee,
  loadEmployeeGroup,
  loadRegistrationState,
  type RegistrationState,
} from "./state";
import { withTx } from "./tx";
import { ensureActiveVoucher, revokeActiveVoucher } from "./vouchers";

const REMOVAL_BLOCKED = {
  GUEST_CHECKED_IN:
    "O convidado já entrou na festa e não pode ser removido nem trocado. Se a entrada foi por engano, o administrador estorna a entrada (o kit volta ao estoque).",
  GUEST_KIT_DELIVERED: "O kit deste convidado já saiu. Para trocar, o administrador precisa estornar a entrega.",
} as const;

/**
 * Quem convida: a inscrição de um(a) professor(a) ou um(a) funcionário(a) do
 * SINDSERM. As regras do convidado são as mesmas (um por anfitrião, com kit
 * depois que quem convidou chegar).
 */
export interface GuestHost {
  kind: "REGISTRATION" | "EMPLOYEE";
  /** Id da inscrição ou do(a) funcionário(a). */
  id: string;
  personId: string;
  name: string;
  cpf: string | null;
  guest: ActiveGuest | null;
  /** Para quem já saiu o kit de convidado deste grupo (se saiu). */
  guestKitBeneficiaryId: string | null;
}

export function hostFromRegistration(state: RegistrationState): GuestHost {
  return {
    kind: "REGISTRATION",
    id: state.id,
    personId: state.member.id,
    name: state.member.fullName,
    cpf: state.member.cpf,
    guest: state.guest,
    guestKitBeneficiaryId: state.deliveries.GUEST?.beneficiaryPersonId ?? null,
  };
}

export function hostFromEmployee(state: EmployeeGroupState): GuestHost {
  return {
    kind: "EMPLOYEE",
    id: state.id,
    personId: state.person.id,
    name: state.person.fullName,
    cpf: state.person.cpf,
    guest: state.guest,
    guestKitBeneficiaryId: state.deliveries.GUEST?.beneficiaryPersonId ?? null,
  };
}

async function reloadRegistrationHost(tx: Tx, registrationId: string): Promise<GuestHost> {
  const state = await loadRegistrationState(tx, registrationId);
  if (!state) throw new DomainError("NOT_FOUND", "Inscrição não encontrada.");
  return hostFromRegistration(state);
}

/** Trava o anfitrião e confere se ele pode ter convidado. */
async function lockHost(tx: Tx, input: { registrationId?: string | null; employeeId?: string | null }): Promise<GuestHost> {
  if (input.registrationId) {
    await lockRegistrationRow(tx, input.registrationId);
    const state = await loadRegistrationState(tx, input.registrationId);
    if (!state) throw new DomainError("NOT_FOUND", "Inscrição não encontrada.");
    if (!state.isTeacher) throw new DomainError("INVALID_STATE", "Somente professoras e professores podem levar convidado.");
    if (state.status === "REJECTED") {
      throw new DomainError("INVALID_STATE", "Filiação não confirmada: não é possível cadastrar convidado.");
    }
    return hostFromRegistration(state);
  }
  const state = await lockEmployeeGroup(tx, input.employeeId!);
  if (!state.active) {
    throw new DomainError("INVALID_STATE", "Funcionário(a) fora da lista: traga de volta antes de cadastrar convidado.");
  }
  return hostFromEmployee(state);
}

async function reloadHost(tx: Tx, host: GuestHost): Promise<GuestHost> {
  if (host.kind === "REGISTRATION") return reloadRegistrationHost(tx, host.id);
  return hostFromEmployee(await lockEmployeeGroup(tx, host.id));
}

/** Encerra o vínculo do convidado atual (remoção ou troca), mantendo o histórico. */
export async function endGuestLink(tx: Tx, actor: StaffActor, host: GuestHost, reason: string) {
  const guest = host.guest!;
  const check = guestRemovalCheck({
    guestCheckedIn: Boolean(guest.checkIn),
    guestKitDeliveredForGuest: host.guestKitBeneficiaryId === guest.personId,
  });
  if (!check.ok) throw new DomainError("INVALID_STATE", REMOVAL_BLOCKED[check.code]);
  await tx
    .update(guestLink)
    .set({ status: "REMOVED", endedAt: new Date(), endedByUserId: actor.userId, endReason: reason })
    .where(eq(guestLink.id, guest.guestLinkId));
  // Quem só era convidado perde o QR; quem também tem inscrição própria mantém.
  if (!(await findRegistrationIdByMember(tx, guest.personId))) {
    await revokeActiveVoucher(tx, guest.personId, actor.userId, reason);
  }
  return guest;
}

export interface GuestPersonInput {
  fullName: string;
  cpf: string | null;
  isMinor: boolean;
  personId?: string | null;
}

/**
 * Cria (ou reaproveita) a pessoa convidada, liga ao anfitrião e emite o QR.
 * Supõe o anfitrião já travado e sem convidado ativo.
 */
export async function attachGuest(tx: Tx, actor: StaffActor, host: GuestHost, input: GuestPersonInput) {
  if ((input.cpf && input.cpf === host.cpf) || input.personId === host.personId) {
    throw new DomainError("VALIDATION", "Quem convida não pode ser o(a) próprio(a) convidado(a).", { cpf: "Mesmo CPF de quem convida" });
  }
  // Sem CPF e com o mesmo nome de quem convida: provavelmente é a própria pessoa (ganharia um kit a mais).
  if (!input.personId && guestNameClash(input, host.name)) {
    throw new DomainError("VALIDATION", host.kind === "EMPLOYEE" ? SAME_NAME_EMPLOYEE_GUEST_MESSAGE : SAME_NAME_GUEST_MESSAGE, {
      cpf: "Informe o CPF do convidado",
    });
  }

  let personId: string;
  let reusedPerson = false;
  let name = input.fullName;
  // Pessoa já cadastrada: pelo id (vínculo direto) ou pelo CPF. Sem CPF, é sempre uma pessoa nova.
  const lookup = input.personId ? eq(person.id, input.personId) : input.cpf ? eq(person.cpf, input.cpf) : null;
  const [existing] = lookup
    ? await tx.select({ id: person.id, fullName: person.fullName, isMinor: person.isMinor }).from(person).where(lookup).for("update")
    : [];
  if (input.personId && !existing) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
  if (existing) {
    const own = await findRegistrationIdByMember(tx, existing.id);
    if (own && own.status !== "REJECTED") {
      throw new DomainError("CONFLICT", "Esta pessoa está inscrita como filiada.", { cpf: "CPF inscrito como filiado(a)" });
    }
    if (await findActiveGuestLink(tx, existing.id)) {
      throw new DomainError("CONFLICT", "Esta pessoa já é convidada de outra pessoa.", { cpf: "Já é convidado(a)" });
    }
    if (await isActiveEmployee(tx, existing.id)) {
      throw new DomainError("CONFLICT", "Esta pessoa está na lista de funcionários do SINDSERM.", { cpf: "Funcionário(a) do SINDSERM" });
    }
    personId = existing.id;
    name = existing.fullName;
    reusedPerson = true;
    if (existing.isMinor !== input.isMinor) {
      await tx.update(person).set({ isMinor: input.isMinor }).where(eq(person.id, existing.id));
    }
  } else {
    const [created] = await tx
      .insert(person)
      .values({ ...personSearchFields(input.fullName), cpf: input.cpf, isMinor: input.isMinor })
      .returning({ id: person.id });
    personId = created!.id;
  }

  const [link] = await tx
    .insert(guestLink)
    .values({
      registrationId: host.kind === "REGISTRATION" ? host.id : null,
      employeeId: host.kind === "EMPLOYEE" ? host.id : null,
      guestPersonId: personId,
      addedByUserId: actor.userId,
    })
    .returning({ id: guestLink.id });
  const voucherInfo = await ensureActiveVoucher(tx, personId, actor.userId);
  return { guestLinkId: link!.id, personId, reusedPerson, name, voucherCode: voucherInfo.code };
}

export function mapGuestError(error: unknown): never {
  if (isUniqueViolation(error, "person_cpf_unique")) {
    throw new DomainError("CPF_TAKEN", "Este CPF acabou de ser cadastrado. Tente novamente.", { cpf: "CPF já cadastrado" });
  }
  if (isUniqueViolation(error, "guest_link_one_active_per_registration") || isUniqueViolation(error, "guest_link_one_active_per_employee")) {
    throw new DomainError("CONFLICT", "Quem convida já tem um convidado. Use a opção de trocar.");
  }
  if (isUniqueViolation(error, "guest_link_one_active_per_person")) {
    throw new DomainError("CONFLICT", "Esta pessoa já é convidada de outra pessoa.", { cpf: "Já é convidado(a)" });
  }
  throw error;
}

/**
 * Atendimento cadastra o convidado de um(a) professor(a) ou de um(a)
 * funcionário(a) — ou troca o atual, em uma única operação. Cada anfitrião
 * leva um único convidado.
 */
export async function addGuest(actor: Actor, rawInput: AddGuestInput) {
  assertPermission(actor, "manageGuests");
  const input = addGuestSchema.parse(rawInput);
  if (Boolean(input.registrationId) === Boolean(input.employeeId)) {
    throw new DomainError("VALIDATION", "Informe quem está convidando.");
  }
  try {
    return await withTx(async (tx) => {
      let host = await lockHost(tx, input);
      let replaced: { fullName: string } | null = null;
      if (host.guest) {
        if (input.replaceGuestLinkId !== host.guest.guestLinkId) {
          throw new DomainError("CONFLICT", "Cada pessoa leva um único convidado. Use a opção de trocar.");
        }
        const sameAsCurrent = input.personId
          ? host.guest.personId === input.personId
          : Boolean(input.cpf && host.guest.cpf === input.cpf);
        if (sameAsCurrent) {
          throw new DomainError("VALIDATION", "Esta pessoa já é o convidado atual.", { cpf: "Já é o convidado atual" });
        }
        // Bloqueia o convidado atual para não correr com a entrada dele.
        await lockPersons(tx, [host.guest.personId]);
        host = await reloadHost(tx, host);
        if (host.guest) replaced = await endGuestLink(tx, actor, host, "Trocado por outro convidado");
      }

      const added = await attachGuest(tx, actor, host, input);
      await writeAudit(tx, actor, {
        action: replaced ? "GUEST_REPLACED" : "GUEST_ADDED",
        entityType: host.kind === "EMPLOYEE" ? "employee" : "registration",
        entityId: host.id,
        summary: replaced
          ? `Convidado de ${host.name} trocado: ${replaced.fullName} → ${added.name}.`
          : `${added.name} cadastrado(a) como convidado(a) de ${host.name}${host.kind === "EMPLOYEE" ? " (funcionário(a) do SINDSERM)" : ""}.`,
        after: {
          guest: added.name,
          cpf: input.cpf ? maskCpf(input.cpf) : "não informado",
          isMinor: input.isMinor,
          reusedPerson: added.reusedPerson,
          replaced: replaced?.fullName ?? null,
        },
      });
      return { ...added, replaced: Boolean(replaced) };
    });
  } catch (error) {
    mapGuestError(error);
  }
}

/** Remove o convidado (mantém histórico). */
export async function removeGuest(actor: Actor, input: { guestLinkId: string }) {
  assertPermission(actor, "manageGuests");
  return withTx(async (tx) => {
    const [link] = await tx
      .select({
        id: guestLink.id,
        registrationId: guestLink.registrationId,
        employeeId: guestLink.employeeId,
        guestPersonId: guestLink.guestPersonId,
        status: guestLink.status,
      })
      .from(guestLink)
      .where(eq(guestLink.id, String(input.guestLinkId)));
    if (!link || link.status !== "ACTIVE") throw new DomainError("NOT_FOUND", "Convidado não encontrado.");
    // Bloqueia o grupo e o convidado antes de ler o estado: evita remover alguém que está entrando agora.
    let host: GuestHost;
    if (link.registrationId) {
      await lockRegistrationRow(tx, link.registrationId);
      await lockPersons(tx, [link.guestPersonId]);
      host = await reloadRegistrationHost(tx, link.registrationId);
    } else {
      await lockEmployeeRows(tx, [link.employeeId!]);
      await lockPersons(tx, [link.guestPersonId]);
      const state = await loadEmployeeGroup(tx, link.employeeId!);
      if (!state) throw new DomainError("NOT_FOUND", "Funcionário(a) não encontrado(a).");
      host = hostFromEmployee(state);
    }
    if (host.guest?.guestLinkId !== link.id) throw new DomainError("NOT_FOUND", "Convidado não encontrado.");

    const guest = await endGuestLink(tx, actor, host, "Removido pelo Atendimento");
    await writeAudit(tx, actor, {
      action: "GUEST_REMOVED",
      entityType: host.kind === "EMPLOYEE" ? "employee" : "registration",
      entityId: host.id,
      summary: `${guest.fullName} removido(a) como convidado(a) de ${host.name}.`,
      before: { guest: guest.fullName, cpf: guest.cpf ? maskCpf(guest.cpf) : "não informado" },
    });
  });
}

/**
 * Corrige a resposta "é professor(a)?". Só professoras e professores têm kit e
 * convidado, então deixar de ser professor(a) exige que não haja kit entregue
 * nem convidado cadastrado.
 */
export async function setTeacherStatus(actor: Actor, rawInput: TeacherStatusInput) {
  assertPermission(actor, "manageGuests");
  const input = teacherStatusSchema.parse(rawInput);
  return withTx(async (tx) => {
    const state = await lockRegistration(tx, input.registrationId);
    if (state.isTeacher === input.isTeacher) return { changed: false };
    if (!input.isTeacher) {
      if (state.deliveries.MEMBER || state.deliveries.GUEST) {
        throw new DomainError("INVALID_STATE", "Já houve entrega de kit para esta inscrição; o administrador precisa estornar antes.");
      }
      if (state.guest) {
        throw new DomainError("INVALID_STATE", "Remova o convidado antes: somente professoras e professores levam convidado.");
      }
    }
    await tx.update(registration).set({ isTeacher: input.isTeacher }).where(eq(registration.id, state.id));
    // Mantém a ficha em aberto coerente com a inscrição.
    await tx
      .update(affiliationForm)
      .set({ isTeacher: input.isTeacher })
      .where(and(eq(affiliationForm.registrationId, state.id), eq(affiliationForm.status, "DRAFT")));
    await writeAudit(tx, actor, {
      action: "TEACHER_STATUS_CHANGED",
      entityType: "registration",
      entityId: state.id,
      summary: `${state.member.fullName}: ${input.isTeacher ? "marcado(a) como professor(a)" : "marcado(a) como não professor(a)"}.`,
      before: { isTeacher: state.isTeacher },
      after: { isTeacher: input.isTeacher },
    });
    return { changed: true };
  });
}
