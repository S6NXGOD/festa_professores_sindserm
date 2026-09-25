import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { Executor, Tx } from "@/server/db";
import { account, session, user } from "@/server/db/schema";
import type { BootstrapAdminInput, CreateUserInput, UpdateUserInput } from "@/domain/schemas";
import { bootstrapAdminSchema, createUserSchema, resetPasswordSchema, updateUserSchema } from "@/domain/schemas";
import { ROLE_LABEL } from "@/domain/labels";
import type { StaffRole } from "@/domain/types";
import { safeEqual } from "@/server/crypto";
import { type Actor, assertPermission, type StaffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { withTx } from "./tx";

export async function countUsers(ex: Executor): Promise<number> {
  const [row] = await ex.select({ count: sql<number>`count(*)::int` }).from(user);
  return Number(row?.count ?? 0);
}

async function insertStaffUser(
  tx: Tx,
  data: { name: string; email: string; role: StaffRole; password: string },
) {
  const id = randomUUID();
  const passwordHash = await hashPassword(data.password);
  await tx.insert(user).values({
    id,
    name: data.name,
    email: data.email,
    emailVerified: true,
    role: data.role,
    active: true,
  });
  await tx.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: passwordHash,
  });
  return id;
}

function mapEmailConflict(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new DomainError("CONFLICT", "Já existe um usuário com este e-mail.", {
      email: "E-mail já cadastrado",
    });
  }
  throw error;
}

/**
 * Cria o primeiro ADMIN. Só funciona enquanto não houver nenhum usuário e exige
 * o SETUP_TOKEN definido no servidor.
 */
export async function bootstrapFirstAdmin(rawInput: BootstrapAdminInput) {
  const input = bootstrapAdminSchema.parse(rawInput);
  const expected = process.env.SETUP_TOKEN ?? "";
  if (expected.length < 16) {
    throw new DomainError("INVALID_STATE", "SETUP_TOKEN não está configurado no servidor (Variables no Railway ou .env.local).");
  }
  if (!safeEqual(input.setupToken, expected)) {
    throw new DomainError("FORBIDDEN", "Token de configuração inválido.", { setupToken: "Token inválido" });
  }
  try {
    return await withTx(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('bootstrap_admin'))`);
      if ((await countUsers(tx)) > 0) {
        throw new DomainError("CONFLICT", "O primeiro administrador já foi criado. Faça login.");
      }
      const userId = await insertStaffUser(tx, { ...input, role: "ADMIN" });
      const actor: StaffActor = { kind: "staff", userId, name: input.name, role: "ADMIN" };
      await writeAudit(tx, actor, {
        action: "ADMIN_BOOTSTRAPPED",
        entityType: "user",
        entityId: userId,
        summary: `Primeiro administrador criado: ${input.name}.`,
        after: { email: input.email, role: "ADMIN" },
      });
      return { userId };
    });
  } catch (error) {
    mapEmailConflict(error);
  }
}

/**
 * Cria um administrador pela linha de comando (`npm run admin:create`), sem
 * depender do SETUP_TOKEN. Usado na instalação; a senha nunca é gravada em claro.
 */
export async function createAdminFromCli(rawInput: { name: string; email: string; password: string }) {
  const input = createUserSchema.parse({ ...rawInput, role: "ADMIN" });
  try {
    return await withTx(async (tx) => {
      const userId = await insertStaffUser(tx, input);
      const actor: StaffActor = { kind: "staff", userId, name: input.name, role: "ADMIN" };
      await writeAudit(tx, actor, {
        action: "ADMIN_CREATED_CLI",
        entityType: "user",
        entityId: userId,
        summary: `Administrador ${input.name} criado pela linha de comando.`,
        after: { email: input.email, role: "ADMIN" },
      });
      return { userId, email: input.email };
    });
  } catch (error) {
    mapEmailConflict(error);
  }
}

export async function createStaffUser(actor: Actor, rawInput: CreateUserInput) {
  assertPermission(actor, "manageUsers");
  const input = createUserSchema.parse(rawInput);
  try {
    return await withTx(async (tx) => {
      const userId = await insertStaffUser(tx, input);
      await writeAudit(tx, actor, {
        action: "USER_CREATED",
        entityType: "user",
        entityId: userId,
        summary: `Usuário ${input.name} criado como ${ROLE_LABEL[input.role]}.`,
        after: { name: input.name, email: input.email, role: input.role },
      });
      return { userId };
    });
  } catch (error) {
    mapEmailConflict(error);
  }
}

async function activeAdminCount(tx: Tx, excludingUserId: string) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(user)
    .where(and(eq(user.role, "ADMIN"), eq(user.active, true), ne(user.id, excludingUserId)));
  return Number(row?.count ?? 0);
}

export async function updateStaffUser(actor: Actor, rawInput: UpdateUserInput) {
  assertPermission(actor, "manageUsers");
  const input = updateUserSchema.parse(rawInput);
  return withTx(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('staff_users'))`);
    const [current] = await tx.select().from(user).where(eq(user.id, input.userId)).for("update");
    if (!current) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    const isSelf = current.id === actor.userId;
    if (isSelf && (!input.active || input.role !== current.role)) {
      throw new DomainError("INVALID_STATE", "Você não pode desativar nem alterar o próprio perfil.");
    }
    const losesAdmin = current.role === "ADMIN" && current.active && (input.role !== "ADMIN" || !input.active);
    if (losesAdmin && (await activeAdminCount(tx, current.id)) === 0) {
      throw new DomainError("INVALID_STATE", "É necessário manter pelo menos um administrador ativo.");
    }
    await tx
      .update(user)
      .set({ name: input.name, role: input.role, active: input.active })
      .where(eq(user.id, current.id));
    if (!input.active) await tx.delete(session).where(eq(session.userId, current.id));
    await writeAudit(tx, actor, {
      action: "USER_UPDATED",
      entityType: "user",
      entityId: current.id,
      summary: `Usuário ${input.name} alterado.`,
      before: { name: current.name, role: current.role, active: current.active },
      after: { name: input.name, role: input.role, active: input.active },
    });
  });
}

export async function resetStaffPassword(actor: Actor, rawInput: { userId: string; password: string }) {
  assertPermission(actor, "manageUsers");
  const input = resetPasswordSchema.parse(rawInput);
  const passwordHash = await hashPassword(input.password);
  return withTx(async (tx) => {
    const [target] = await tx.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, input.userId));
    if (!target) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    const updated = await tx
      .update(account)
      .set({ password: passwordHash })
      .where(and(eq(account.userId, target.id), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) {
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: target.id,
        providerId: "credential",
        userId: target.id,
        password: passwordHash,
      });
    }
    await tx.delete(session).where(eq(session.userId, target.id));
    await writeAudit(tx, actor, {
      action: "USER_PASSWORD_RESET",
      entityType: "user",
      entityId: target.id,
      summary: `Senha de ${target.name} redefinida; sessões encerradas.`,
    });
  });
}
