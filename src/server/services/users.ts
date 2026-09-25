import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { Executor, Tx } from "@/server/db";
import { account, session, user } from "@/server/db/schema";
import { type AccessMap, can, resolveAccess, storedAccess } from "@/domain/access";
import type { BootstrapAdminInput, CreateUserInput, UpdateUserInput } from "@/domain/schemas";
import { bootstrapAdminSchema, createUserSchema, resetPasswordSchema, updateUserSchema } from "@/domain/schemas";
import { ROLE_LABEL } from "@/domain/labels";
import type { StaffRole } from "@/domain/types";
import { safeEqual } from "@/server/crypto";
import { type Actor, assertPermission, type StaffActor, staffActor } from "./actor";
import { writeAudit } from "./audit";
import { DomainError, isUniqueViolation } from "./errors";
import { withTx } from "./tx";

export async function countUsers(ex: Executor): Promise<number> {
  const [row] = await ex.select({ count: sql<number>`count(*)::int` }).from(user);
  return Number(row?.count ?? 0);
}

async function insertStaffUser(
  tx: Tx,
  data: { name: string; email: string; role: StaffRole; password: string; access?: AccessMap | null; mustChangePassword: boolean },
) {
  const id = randomUUID();
  const passwordHash = await hashPassword(data.password);
  await tx.insert(user).values({
    id,
    name: data.name,
    email: data.email,
    emailVerified: true,
    role: data.role,
    permissions: storedAccess(data.role, data.access),
    mustChangePassword: data.mustChangePassword,
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

/** Resumo legível das permissões para a auditoria. */
function accessSummary(role: StaffRole, access: AccessMap | null | undefined) {
  const stored = storedAccess(role, access);
  return stored ? { perfil: ROLE_LABEL[role], personalizado: JSON.parse(stored) as AccessMap } : { perfil: ROLE_LABEL[role] };
}

/**
 * Cria o primeiro ADMIN. Só funciona enquanto não houver nenhum usuário e exige
 * o SETUP_TOKEN definido no servidor. A pessoa escolhe a própria senha aqui.
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
      const userId = await insertStaffUser(tx, { ...input, role: "ADMIN", mustChangePassword: false });
      await writeAudit(tx, staffActor({ userId, name: input.name, role: "ADMIN" }), {
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
 * Cria um administrador pela linha de comando ou no deploy (ADMIN_PASSWORD).
 * A senha veio de fora (terminal/variável), então a troca é obrigatória no
 * primeiro acesso. A senha nunca é gravada em claro.
 */
export async function createAdminFromCli(rawInput: { name: string; email: string; password: string }) {
  const input = createUserSchema.parse({ ...rawInput, role: "ADMIN" });
  try {
    return await withTx(async (tx) => {
      const userId = await insertStaffUser(tx, { ...input, mustChangePassword: true });
      await writeAudit(tx, staffActor({ userId, name: input.name, role: "ADMIN" }), {
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

/** Usuário criado pelo administrador: a senha inicial é provisória (troca no primeiro acesso). */
export async function createStaffUser(actor: Actor, rawInput: CreateUserInput) {
  assertPermission(actor, "manageUsers");
  const input = createUserSchema.parse(rawInput);
  try {
    return await withTx(async (tx) => {
      const userId = await insertStaffUser(tx, { ...input, mustChangePassword: true });
      await writeAudit(tx, actor, {
        action: "USER_CREATED",
        entityType: "user",
        entityId: userId,
        summary: `Usuário ${input.name} criado como ${ROLE_LABEL[input.role]}${storedAccess(input.role, input.access) ? " (permissões ajustadas)" : ""}.`,
        after: { name: input.name, email: input.email, ...accessSummary(input.role, input.access) },
      });
      return { userId };
    });
  } catch (error) {
    mapEmailConflict(error);
  }
}

/** Quantas pessoas ativas, fora esta, ainda conseguem administrar usuários. */
async function otherUserManagers(tx: Tx, excludingUserId: string) {
  const rows = await tx
    .select({ id: user.id, role: user.role, permissions: user.permissions })
    .from(user)
    .where(eq(user.active, true));
  return rows.filter((row) => row.id !== excludingUserId && can(resolveAccess(row.role, row.permissions), "manageUsers")).length;
}

export async function updateStaffUser(actor: Actor, rawInput: UpdateUserInput) {
  assertPermission(actor, "manageUsers");
  const input = updateUserSchema.parse(rawInput);
  return withTx(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('staff_users'))`);
    const [current] = await tx.select().from(user).where(eq(user.id, input.userId)).for("update");
    if (!current) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    // Sem "access" no pedido: mantém as permissões atuais (ajustadas ou do perfil).
    const permissions = input.access === undefined ? (input.role === current.role ? current.permissions : null) : storedAccess(input.role, input.access);
    const isSelf = current.id === actor.userId;
    if (isSelf && (!input.active || input.role !== current.role || permissions !== current.permissions)) {
      throw new DomainError("INVALID_STATE", "Você não pode desativar nem alterar as próprias permissões.");
    }
    const managedUsers = current.active && can(resolveAccess(current.role, current.permissions), "manageUsers");
    const keepsManaging = input.active && can(resolveAccess(input.role, permissions), "manageUsers");
    if (managedUsers && !keepsManaging && (await otherUserManagers(tx, current.id)) === 0) {
      throw new DomainError("INVALID_STATE", "É preciso manter pelo menos uma pessoa ativa que administre o acesso ao sistema.");
    }
    const mustChangePassword = input.mustChangePassword ?? current.mustChangePassword;
    await tx
      .update(user)
      .set({ name: input.name, role: input.role, active: input.active, permissions, mustChangePassword })
      .where(eq(user.id, current.id));
    if (!input.active) await tx.delete(session).where(eq(session.userId, current.id));
    await writeAudit(tx, actor, {
      action: "USER_UPDATED",
      entityType: "user",
      entityId: current.id,
      summary: `Usuário ${input.name} alterado${mustChangePassword && !current.mustChangePassword ? " (nova senha pedida no próximo acesso)" : ""}.`,
      before: { name: current.name, active: current.active, ...accessSummary(current.role, resolveAccess(current.role, current.permissions)) },
      after: { name: input.name, active: input.active, ...accessSummary(input.role, resolveAccess(input.role, permissions)), mustChangePassword },
    });
  });
}

/** Senha nova dada pelo administrador: provisória (a pessoa cria a própria no próximo acesso). */
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
    await tx.update(user).set({ mustChangePassword: true }).where(eq(user.id, target.id));
    await tx.delete(session).where(eq(session.userId, target.id));
    await writeAudit(tx, actor, {
      action: "USER_PASSWORD_RESET",
      entityType: "user",
      entityId: target.id,
      summary: `Senha de ${target.name} redefinida (provisória); sessões encerradas.`,
    });
  });
}

/** A pessoa criou a própria senha: acaba a senha provisória. */
export async function markPasswordChanged(actor: StaffActor) {
  return withTx(async (tx) => {
    const [row] = await tx
      .update(user)
      .set({ mustChangePassword: false })
      .where(eq(user.id, actor.userId))
      .returning({ id: user.id });
    if (!row) throw new DomainError("NOT_FOUND", "Usuário não encontrado.");
    await writeAudit(tx, actor, {
      action: "USER_PASSWORD_CHANGED",
      entityType: "user",
      entityId: actor.userId,
      summary: `${actor.name} trocou a própria senha.`,
    });
  });
}
