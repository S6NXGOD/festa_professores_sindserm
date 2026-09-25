import "server-only";
import { and, asc, eq, inArray, isNull, like, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Executor } from "@/server/db";
import { affiliationForm, checkIn, employee, guestLink, person, registration, voucher } from "@/server/db/schema";
import { type PersonCorrectionInput, personCorrectionSchema, registrationNumberKey } from "@/domain/schemas";
import type { AffiliationStatus } from "@/domain/types";
import { displayCpf, maskCpf } from "@/lib/cpf";
import { escapeLike, toSearchText } from "@/lib/text";
import { normalizeVoucherCode } from "@/server/crypto";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { personSearchFields } from "./registration";
import { withTx } from "./tx";

export interface PersonSearchResult {
  personId: string;
  fullName: string;
  cpfDisplay: string;
  isMinor: boolean;
  memberStatus: AffiliationStatus | null;
  /** Quem convidou (professor(a) ou funcionário(a)), quando a pessoa é convidada. */
  hostName: string | null;
  /** Filiação do(a) professor(a) que convidou (nulo quando quem convidou é funcionário(a)). */
  hostStatus: AffiliationStatus | null;
  hostIsEmployee: boolean;
  checkedInAt: Date | null;
  /** Funcionário(a) do SINDSERM na lista (setor, se informado). */
  employee: { jobTitle: string | null } | null;
}

export type SearchMode = "auto" | "name" | "cpf";

export interface SearchOptions {
  mode?: SearchMode;
  /**
   * Busca por parte do CPF. Só para quem pode ver o CPF completo: para os
   * demais, buscas parciais permitiriam descobrir CPFs por tentativa.
   */
  allowPartialCpf?: boolean;
}

/** Monta o filtro de busca por nome (sem acento), CPF ou código do voucher. */
export function personSearchCondition(
  rawQuery: string,
  { mode = "auto", allowPartialCpf = false }: SearchOptions = {},
): SQL | null {
  const query = rawQuery.trim().slice(0, 80);
  if (!query) return null;
  const digits = query.replace(/\D/g, "");
  const hasLetters = /\p{L}/u.test(query);
  const conditions: SQL[] = [];

  // Código curto do voucher (8 caracteres, com ou sem hífen); códigos cancelados não valem.
  const code = normalizeVoucherCode(query);
  if (mode === "auto" && code.length === 8 && !/\s/.test(query)) {
    conditions.push(
      inArray(
        person.id,
        sql`(SELECT ${voucher.personId} FROM ${voucher} WHERE ${voucher.code} = ${code} AND ${voucher.revokedAt} IS NULL)`,
      ),
    );
  }

  // Matrícula da prefeitura (chave única): sempre busca exata.
  const matricula = registrationNumberKey(query);
  if (mode === "auto" && matricula && matricula.length >= 3 && !/\s/.test(query)) {
    conditions.push(eq(person.registrationNumberKey, matricula));
  }

  if (mode === "cpf" || (mode === "auto" && !hasLetters && digits.length >= 3)) {
    if (digits.length === 11) conditions.push(eq(person.cpf, digits));
    else if (allowPartialCpf && digits.length >= 3) conditions.push(like(person.cpf, `%${digits}%`));
  } else {
    const terms = toSearchText(query).split(" ").filter((t) => t.length >= 2);
    if (terms.length) {
      const nameConditions = terms.map((t) => like(person.searchName, `%${escapeLike(t)}%`));
      conditions.push(nameConditions.length === 1 ? nameConditions[0]! : and(...nameConditions)!);
    }
  }
  if (!conditions.length) return null;
  return conditions.length === 1 ? conditions[0]! : or(...conditions)!;
}

export async function searchPeople(
  ex: Executor,
  rawQuery: string,
  options: { mode?: SearchMode; fullCpf: boolean; limit?: number },
): Promise<PersonSearchResult[]> {
  // Só quem vê o CPF completo pode buscar por parte dele.
  const condition = personSearchCondition(rawQuery, { mode: options.mode, allowPartialCpf: options.fullCpf });
  if (!condition) return [];
  const hostReg = alias(registration, "host_reg");
  const hostPerson = alias(person, "host_person");
  const hostEmployee = alias(employee, "host_employee");
  const hostEmployeePerson = alias(person, "host_employee_person");
  const rows = await ex
    .select({
      personId: person.id,
      fullName: person.fullName,
      cpf: person.cpf,
      isMinor: person.isMinor,
      memberStatus: registration.status,
      hostMemberName: hostPerson.fullName,
      hostEmployeeName: hostEmployeePerson.fullName,
      hostStatus: hostReg.status,
      checkedInAt: checkIn.checkedInAt,
      employeeId: employee.id,
      employeeJobTitle: employee.jobTitle,
    })
    .from(person)
    .leftJoin(registration, eq(registration.memberPersonId, person.id))
    .leftJoin(guestLink, and(eq(guestLink.guestPersonId, person.id), eq(guestLink.status, "ACTIVE")))
    .leftJoin(hostReg, eq(hostReg.id, guestLink.registrationId))
    .leftJoin(hostPerson, eq(hostPerson.id, hostReg.memberPersonId))
    .leftJoin(hostEmployee, eq(hostEmployee.id, guestLink.employeeId))
    .leftJoin(hostEmployeePerson, eq(hostEmployeePerson.id, hostEmployee.personId))
    .leftJoin(checkIn, and(eq(checkIn.personId, person.id), isNull(checkIn.cancelledAt)))
    .leftJoin(employee, and(eq(employee.personId, person.id), isNull(employee.removedAt)))
    .where(condition)
    .orderBy(asc(person.searchName))
    .limit(options.limit ?? 25);
  return rows.map(({ cpf, employeeId, employeeJobTitle, hostMemberName, hostEmployeeName, ...row }) => ({
    ...row,
    hostName: hostMemberName ?? hostEmployeeName ?? null,
    hostIsEmployee: Boolean(hostEmployeeName && !hostMemberName),
    cpfDisplay: displayCpf(cpf, options.fullCpf),
    employee: employeeId ? { jobTitle: employeeJobTitle } : null,
  }));
}

/** Correção de dados cadastrais (nome, CPF, contato, matrícula, lotação, menor de idade). */
export async function correctPerson(actor: Actor, rawInput: PersonCorrectionInput) {
  assertPermission(actor, "manageGuests");
  const input = personCorrectionSchema.parse(rawInput);
  try {
    return await correctPersonTx(actor, input);
  } catch (error) {
    if (isUniqueViolation(error, "person_registration_number_unique")) {
      throw new DomainError("CONFLICT", "Matrícula já cadastrada para outra pessoa.", {
        registrationNumber: "Matrícula de outra pessoa",
      });
    }
    if (isUniqueViolation(error, "person_cpf_unique")) {
      throw new DomainError("CPF_TAKEN", "Este CPF já pertence a outra pessoa cadastrada.", { cpf: "CPF de outra pessoa" });
    }
    throw error;
  }
}

async function correctPersonTx(actor: StaffActor, input: ReturnType<typeof personCorrectionSchema.parse>) {
  return withTx(async (tx) => {
    const [current] = await tx.select().from(person).where(eq(person.id, input.personId)).for("update");
    if (!current) throw new DomainError("NOT_FOUND", "Pessoa não encontrada.");
    if (input.cpf !== current.cpf) await assertCpfChangeAllowed(tx, current.id, input.cpf);
    const changes = {
      ...personSearchFields(input.fullName),
      cpf: input.cpf,
      whatsapp: input.whatsapp,
      registrationNumber: input.registrationNumber,
      workplace: input.workplace,
      isMinor: input.isMinor,
    };
    const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter(
      (key) => key !== "searchName" && current[key] !== changes[key],
    );
    if (changed.length === 0) return { changed };
    await tx.update(person).set(changes).where(eq(person.id, current.id));
    await writeAudit(tx, actor, {
      action: "PERSON_CORRECTED",
      entityType: "person",
      entityId: current.id,
      summary: `Cadastro de ${input.fullName} corrigido (${changed.join(", ")}).`,
      before: {
        ...(changed.includes("fullName") ? { fullName: current.fullName } : {}),
        ...(changed.includes("cpf") ? { cpf: current.cpf ? maskCpf(current.cpf) : "não informado" } : {}),
      },
      after: {
        fields: changed,
        ...(changed.includes("fullName") ? { fullName: input.fullName } : {}),
        ...(changed.includes("cpf") ? { cpf: input.cpf ? maskCpf(input.cpf) : "não informado" } : {}),
      },
    });
    return { changed };
  });
}

/**
 * CPF é a identidade de filiados: só pode ficar vazio para quem é apenas
 * convidado(a), e não pode mudar depois da ficha de filiação (o papel assinado
 * tem o CPF). Nunca pode repetir o de outra pessoa.
 */
async function assertCpfChangeAllowed(ex: Executor, personId: string, cpf: string | null) {
  const [ownRegistration] = await ex
    .select({ id: registration.id })
    .from(registration)
    .where(eq(registration.memberPersonId, personId))
    .limit(1);
  const [form] = await ex
    .select({ id: affiliationForm.id })
    .from(affiliationForm)
    .where(eq(affiliationForm.personId, personId))
    .limit(1);
  if (form) {
    throw new DomainError("VALIDATION", "O CPF está na ficha de filiação desta pessoa e não pode ser alterado aqui.", {
      cpf: "CPF da ficha de filiação",
    });
  }
  if (!cpf) {
    if (ownRegistration) {
      throw new DomainError("VALIDATION", "Filiados precisam ter CPF.", { cpf: "Informe o CPF" });
    }
    return;
  }
  const [other] = await ex
    .select({ id: person.id })
    .from(person)
    .where(and(eq(person.cpf, cpf), ne(person.id, personId)))
    .limit(1);
  if (other) throw new DomainError("CPF_TAKEN", "Este CPF já pertence a outra pessoa cadastrada.", { cpf: "CPF de outra pessoa" });
}
