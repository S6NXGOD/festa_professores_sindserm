import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Executor } from "@/server/db";
import { db } from "@/server/db";
import { account, employee, eventConfig, person, priorAffiliation, registration, user } from "@/server/db/schema";
import { can } from "@/domain/access";
import { EMPLOYEE_CATEGORIES, STAFF_ROLES } from "@/domain/types";
import { normalizeCpf } from "@/lib/cpf";
import { plural } from "@/lib/plural";
import { toSearchText } from "@/lib/text";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { addCompanion, createEmployee } from "./employees";
import { DomainError } from "./errors";
import { withTx } from "./tx";

/*
 * Pacote de mudança entre festas (decisão da organização: um sistema por
 * festa). O sistema de uma festa gera um arquivo, trancado com uma senha que o
 * administrador escolhe, com a equipe (logins e perfis), os colaboradores e
 * cortesias e as filiações já conferidas (com RG e contracheque). O sistema da
 * outra festa abre o arquivo com a mesma senha e importa. Documentos (fotos de
 * RG e contracheque) não vão no pacote: só o fato de a filiação ter sido conferida.
 */

const FORMAT = "festa-sindserm";
const PASSPHRASE_MIN = 8;

const packageSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  source: z.string().min(1).max(200),
  users: z.array(
    z.object({
      name: z.string().min(1).max(160),
      email: z.string().min(3).max(160),
      role: z.enum(STAFF_ROLES),
      permissions: z.string().max(4000).nullable(),
      passwordHash: z.string().min(10).max(1000).nullable(),
    }),
  ),
  employees: z.array(
    z.object({
      key: z.string().min(1).max(64),
      fullName: z.string().min(1).max(160),
      cpf: z.string().max(14).nullable(),
      whatsapp: z.string().max(20).nullable(),
      isMinor: z.boolean(),
      category: z.enum(EMPLOYEE_CATEGORIES),
      jobTitle: z.string().max(120).nullable(),
      withKit: z.boolean(),
      hostKey: z.string().max(64).nullable(),
    }),
  ),
  affiliations: z.array(
    z.object({
      cpf: z.string().min(11).max(14),
      fullName: z.string().min(1).max(160),
      registrationNumber: z.string().max(40).nullable(),
      confirmedAt: z.string(),
    }),
  ),
});
export type FestaPackage = z.infer<typeof packageSchema>;

function assertPackageAdmin(actor: Actor): asserts actor is StaffActor {
  assertPermission(actor, "manageUsers");
  if (!can(actor.access, "manageSettings")) {
    throw new DomainError("FORBIDDEN", "Só quem administra o acesso e as configurações leva ou traz dados entre festas.");
  }
}

function checkPassphrase(passphrase: string) {
  if (typeof passphrase !== "string" || passphrase.length < PASSPHRASE_MIN || passphrase.length > 200) {
    throw new DomainError("VALIDATION", `A senha do pacote precisa ter pelo menos ${PASSPHRASE_MIN} caracteres.`, {
      passphrase: `Pelo menos ${PASSPHRASE_MIN} caracteres`,
    });
  }
}

/** Monta o pacote desta festa: equipe ativa, colaboradores e cortesias na lista e filiações confirmadas. */
export async function buildFestaPackage(ex: Executor): Promise<FestaPackage> {
  const [config] = await ex.select({ name: eventConfig.name }).from(eventConfig).where(eq(eventConfig.id, 1)).limit(1);
  const users = await ex
    .select({ name: user.name, email: user.email, role: user.role, permissions: user.permissions, passwordHash: account.password })
    .from(user)
    .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "credential")))
    .where(and(eq(user.active, true), isNull(user.deletedAt)))
    .orderBy(asc(user.name));
  const employees = await ex
    .select({
      id: employee.id,
      hostEmployeeId: employee.hostEmployeeId,
      fullName: person.fullName,
      cpf: person.cpf,
      whatsapp: person.whatsapp,
      isMinor: person.isMinor,
      category: employee.category,
      jobTitle: employee.jobTitle,
      withKit: employee.withKit,
    })
    .from(employee)
    .innerJoin(person, eq(person.id, employee.personId))
    .where(isNull(employee.removedAt))
    .orderBy(asc(employee.createdAt));
  const affiliations = await ex
    .select({
      cpf: person.cpf,
      fullName: person.fullName,
      registrationNumber: person.registrationNumber,
      confirmedAt: sql<Date>`coalesce(${registration.statusChangedAt}, ${registration.createdAt})`,
    })
    .from(registration)
    .innerJoin(person, eq(person.id, registration.memberPersonId))
    .where(inArray(registration.status, ["CONFIRMED", "JOINED_AT_EVENT"]))
    .orderBy(asc(person.fullName));
  const active = new Set(employees.map((row) => row.id));
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    source: config?.name ?? "Festa do SINDSERM",
    users: users.map((row) => ({
      name: row.name,
      email: row.email,
      role: row.role,
      permissions: row.permissions,
      passwordHash: row.passwordHash ?? null,
    })),
    employees: employees.map((row) => ({
      key: row.id,
      fullName: row.fullName,
      cpf: row.cpf,
      whatsapp: row.whatsapp,
      isMinor: row.isMinor,
      category: row.category,
      jobTitle: row.jobTitle,
      withKit: row.withKit,
      // Convidado sem kit de um(a) colaborador(a): só vem junto se quem trouxe também vier.
      hostKey: row.hostEmployeeId && active.has(row.hostEmployeeId) ? row.hostEmployeeId : null,
    })),
    affiliations: affiliations
      .filter((row) => row.cpf)
      .map((row) => ({
        cpf: row.cpf!,
        fullName: row.fullName,
        registrationNumber: row.registrationNumber,
        confirmedAt: new Date(row.confirmedAt).toISOString(),
      })),
  };
}

/** Tranca o pacote com a senha (AES-256-GCM, chave derivada da senha com scrypt). */
export function sealFestaPackage(pkg: FestaPackage, passphrase: string): string {
  checkPassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(pkg), "utf8"), cipher.final()]);
  return JSON.stringify({
    format: FORMAT,
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}

/** Abre o pacote com a senha. Senha errada ou arquivo mexido: recusa sem dizer o que tem dentro. */
export function openFestaPackage(content: string, passphrase: string): FestaPackage {
  checkPassphrase(passphrase);
  let envelope: { format?: string; v?: number; salt?: string; iv?: string; tag?: string; data?: string };
  try {
    envelope = JSON.parse(content) as typeof envelope;
  } catch {
    throw new DomainError("VALIDATION", "Este arquivo não é um pacote de festa.");
  }
  if (envelope.format !== FORMAT || envelope.v !== 1 || !envelope.salt || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new DomainError("VALIDATION", "Este arquivo não é um pacote de festa.");
  }
  try {
    const key = scryptSync(passphrase, Buffer.from(envelope.salt, "base64"), 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const json = Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8");
    return packageSchema.parse(JSON.parse(json));
  } catch {
    throw new DomainError("VALIDATION", "Senha do pacote errada (ou o arquivo foi alterado).", { passphrase: "Senha errada" });
  }
}

/** Gera o arquivo do pacote desta festa (fica na auditoria: tem dados pessoais e os logins da equipe). */
export async function exportFestaPackage(actor: Actor, passphrase: string): Promise<{ content: string; counts: PackageCounts }> {
  assertPackageAdmin(actor);
  checkPassphrase(passphrase);
  const pkg = await buildFestaPackage(db);
  const content = sealFestaPackage(pkg, passphrase);
  const counts = countsOf(pkg);
  await writeAudit(db, actor, {
    action: "FESTA_PACKAGE_EXPORTED",
    entityType: "event",
    entityId: "1",
    summary: `Pacote de mudança gerado: ${counts.users} da equipe, ${plural(counts.employees, "colaborador(a) ou cortesia", "colaboradores e cortesias")}, ${plural(counts.affiliations, "filiação conferida", "filiações conferidas")}.`,
    after: counts,
  });
  return { content, counts };
}

export type PackageCounts = {
  users: number;
  employees: number;
  affiliations: number;
};

function countsOf(pkg: FestaPackage): PackageCounts {
  return { users: pkg.users.length, employees: pkg.employees.length, affiliations: pkg.affiliations.length };
}

export interface ImportSummary {
  source: string;
  users: { created: number; skipped: number };
  employees: { created: number; skipped: number; problems: string[] };
  affiliations: { added: number; skipped: number };
}

/** O que o pacote traria, sem gravar nada (prévia antes de confirmar). */
export async function previewFestaPackage(actor: Actor, content: string, passphrase: string) {
  assertPackageAdmin(actor);
  const pkg = openFestaPackage(content, passphrase);
  const emails = pkg.users.map((u) => u.email.toLowerCase());
  const existing = emails.length ? await db.select({ email: user.email }).from(user).where(inArray(user.email, emails)) : [];
  return { source: pkg.source, createdAt: pkg.createdAt, counts: countsOf(pkg), usersAlreadyHere: existing.length };
}

/**
 * Importa o pacote. A equipe entra com o mesmo login e a mesma senha, mas cria
 * uma senha nova no primeiro acesso (e refaz o tutorial e os treinos desta
 * festa). Colaboradores e cortesias ganham vouchers novos. Filiações conferidas
 * ficam guardadas para confirmar na hora quem se inscrever. O que já existe
 * aqui (mesmo e-mail ou mesmo CPF) fica como está.
 */
export async function importFestaPackage(actor: Actor, content: string, passphrase: string): Promise<ImportSummary> {
  assertPackageAdmin(actor);
  const pkg = openFestaPackage(content, passphrase);
  const summary: ImportSummary = {
    source: pkg.source,
    users: { created: 0, skipped: 0 },
    employees: { created: 0, skipped: 0, problems: [] },
    affiliations: { added: 0, skipped: 0 },
  };

  await withTx(async (tx) => {
    for (const member of pkg.users) {
      const email = member.email.trim().toLowerCase();
      const [found] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
      if (found || !member.passwordHash) {
        summary.users.skipped += 1;
        continue;
      }
      const id = randomUUID();
      await tx.insert(user).values({
        id,
        name: member.name,
        email,
        emailVerified: true,
        role: member.role,
        permissions: member.permissions,
        mustChangePassword: true,
        active: true,
      });
      await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: member.passwordHash });
      summary.users.created += 1;
    }
  });

  // Colaboradores e cortesias pelo cadastro de sempre (voucher novo, auditoria, regras); depois, os convidados sem kit.
  // Nome igual a alguém que já está na lista é pulado (como na lista colada): importar duas vezes não duplica ninguém.
  const current = await db
    .select({ searchName: person.searchName })
    .from(employee)
    .innerJoin(person, eq(person.id, employee.personId))
    .where(isNull(employee.removedAt));
  const known = new Set(current.map((row) => row.searchName));
  const isKnown = (fullName: string) => {
    const key = toSearchText(fullName);
    if (known.has(key)) return true;
    known.add(key);
    return false;
  };
  const created = new Map<string, string>();
  for (const row of pkg.employees.filter((entry) => !entry.hostKey)) {
    if (isKnown(row.fullName)) {
      summary.employees.skipped += 1;
      continue;
    }
    try {
      const result = await createEmployee(actor, {
        fullName: row.fullName,
        cpf: row.cpf ?? "",
        whatsapp: row.whatsapp ?? "",
        jobTitle: row.jobTitle ?? "",
        category: row.category,
        isMinor: row.isMinor,
        withKit: row.withKit,
        guest: null,
      });
      created.set(row.key, result.employeeId);
      summary.employees.created += 1;
    } catch (error) {
      summary.employees.skipped += 1;
      if (summary.employees.problems.length < 10) summary.employees.problems.push(`${row.fullName}: ${error instanceof DomainError ? error.message : "não deu para cadastrar"}`);
    }
  }
  for (const row of pkg.employees.filter((entry) => entry.hostKey)) {
    const hostEmployeeId = created.get(row.hostKey!);
    if (!hostEmployeeId || isKnown(row.fullName)) {
      summary.employees.skipped += 1;
      continue;
    }
    try {
      await addCompanion(actor, { hostEmployeeId, fullName: row.fullName, cpf: row.cpf ?? "", isMinor: row.isMinor });
      summary.employees.created += 1;
    } catch (error) {
      summary.employees.skipped += 1;
      if (summary.employees.problems.length < 10) summary.employees.problems.push(`${row.fullName}: ${error instanceof DomainError ? error.message : "não deu para cadastrar"}`);
    }
  }

  await withTx(async (tx) => {
    for (const row of pkg.affiliations) {
      const cpf = normalizeCpf(row.cpf);
      if (!cpf) {
        summary.affiliations.skipped += 1;
        continue;
      }
      const inserted = await tx
        .insert(priorAffiliation)
        .values({ cpf, fullName: row.fullName, registrationNumber: row.registrationNumber, confirmedAt: new Date(row.confirmedAt), source: pkg.source })
        .onConflictDoNothing()
        .returning({ cpf: priorAffiliation.cpf });
      if (inserted.length) summary.affiliations.added += 1;
      else summary.affiliations.skipped += 1;
    }
    await writeAudit(tx, actor, {
      action: "FESTA_PACKAGE_IMPORTED",
      entityType: "event",
      entityId: "1",
      summary:
        `Pacote de mudança importado (${pkg.source}): ${summary.users.created} da equipe, ` +
        `${plural(summary.employees.created, "colaborador(a) ou cortesia", "colaboradores e cortesias")}, ${plural(summary.affiliations.added, "filiação conferida", "filiações conferidas")}.`,
      after: { users: summary.users, employees: { created: summary.employees.created, skipped: summary.employees.skipped }, affiliations: summary.affiliations },
    });
  });
  return summary;
}
