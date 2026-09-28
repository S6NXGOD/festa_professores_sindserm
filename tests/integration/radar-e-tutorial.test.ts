/**
 * Radar do painel (inscrições novas desde um instante, sem as da própria pessoa)
 * e o registro do tutorial do primeiro acesso.
 */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { registrationsSince } from "@/server/queries/panel";
import type { StaffActor } from "@/server/services/actor";
import { createRegistration } from "@/server/services/registration";
import { markTutorialSeen } from "@/server/services/users";
import { configureEvent, createStaff, registerMember, registrationInput, resetDatabase } from "../helpers/factories";

let admin: StaffActor;
let attendant: StaffActor;

beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("ADMIN", "Ana Administradora");
  attendant = await createStaff("ATTENDANT", "Paulo Atendente");
  await configureEvent(admin);
});

async function seenAt(actor: StaffActor) {
  const [row] = await db.select({ at: user.tutorialSeenAt }).from(user).where(eq(user.id, actor.userId));
  return row?.at ?? null;
}

describe("radar de inscrições novas", () => {
  it("traz as novas desde o instante pedido, a mais recente primeiro, com o convidado", async () => {
    const before = await registerMember({ memberName: "Antes Da Tela Silva" });
    expect(before.registrationId).toBeTruthy();
    const since = new Date();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await registerMember({ memberName: "Maria Nova Souza", guest: true, guestName: "Luiza Convidada Lima" });
    await registerMember({ memberName: "Bruna Nova Rocha" });

    const found = await registrationsSince(since, { excludeUserId: admin.userId });
    expect(found.total).toBe(2);
    expect(found.rows.map((row) => row.fullName)).toEqual(["Bruna Nova Rocha", "Maria Nova Souza"]);
    expect(found.rows[1]).toMatchObject({ guestName: "Luiza Convidada Lima", status: "PENDING", origin: "PUBLIC_FORM", isTeacher: true });
  });

  it("quem cadastrou na hora não recebe o aviso da própria inscrição (as outras pessoas da equipe recebem)", async () => {
    const since = new Date(Date.now() - 1000);
    await createRegistration(attendant, registrationInput({ memberName: "Carla Na Hora Dias" }));
    expect((await registrationsSince(since, { excludeUserId: attendant.userId })).rows).toHaveLength(0);
    const forAdmin = await registrationsSince(since, { excludeUserId: admin.userId });
    expect(forAdmin.rows.map((row) => [row.fullName, row.origin])).toEqual([["Carla Na Hora Dias", "STAFF"]]);
  });
});

describe("tutorial do primeiro acesso", () => {
  it("fica registrado uma vez por pessoa (a primeira data vale)", async () => {
    expect(await seenAt(attendant)).toBeNull();
    await markTutorialSeen(db, attendant);
    const first = await seenAt(attendant);
    expect(first).toBeInstanceOf(Date);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await markTutorialSeen(db, attendant);
    expect((await seenAt(attendant))?.getTime()).toBe(first!.getTime());
    // Não mexe no de ninguém mais.
    expect(await seenAt(admin)).toBeNull();
  });
});
