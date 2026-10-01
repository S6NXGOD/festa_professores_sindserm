/**
 * Login da equipe que não cai: a sessão vale 1 ano desde o último uso, as páginas
 * só leem (não gravam), o navegador renova banco e cookie juntos, e só sai quem
 * clica em "Sair". Antes valia 24 h e o cookie não era renovado ao navegar.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth, SESSION_DAYS } from "@/server/auth";
import { db } from "@/server/db";
import { account, session, user } from "@/server/db/schema";
import { createStaff, resetDatabase } from "../helpers/factories";

const DAY_MS = 86_400_000;
const PASSWORD = "senha-da-equipe-123";
const ORIGIN = new URL(auth.options.baseURL ?? "http://localhost:3000").origin;

let email: string;
let userId: string;

beforeEach(async () => {
  await resetDatabase();
  const staff = await createStaff("ATTENDANT", "Paulo Atendente");
  userId = staff.userId;
  const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId));
  email = row!.email;
  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(PASSWORD),
  });
});

/** O cookie da sessão numa resposta: "nome=valor" (para mandar de volta) e o Max-Age. */
function sessionCookie(response: Response) {
  const raw = response.headers.getSetCookie().find((cookie) => /^(__Secure-)?better-auth\.session_token=/.test(cookie));
  if (!raw) return null;
  const [pair, ...attributes] = raw.split(";").map((part) => part.trim());
  const maxAge = attributes.find((part) => part.toLowerCase().startsWith("max-age="));
  return { header: pair!, maxAge: maxAge ? Number(maxAge.split("=")[1]) : null };
}

async function signIn() {
  const response = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
  expect(response.status).toBe(200);
  const cookie = sessionCookie(response);
  expect(cookie).not.toBeNull();
  return cookie!;
}

async function storedExpiry() {
  const [row] = await db.select({ expiresAt: session.expiresAt }).from(session).where(eq(session.userId, userId));
  return row?.expiresAt ?? null;
}

const daysFromNow = (date: Date | null) => (date ? (date.getTime() - Date.now()) / DAY_MS : Number.NaN);

describe("sessão da equipe", () => {
  it("o login vale 1 ano, no banco e no cookie do navegador", async () => {
    const cookie = await signIn();
    expect(cookie.maxAge).toBe(SESSION_DAYS * 86_400);
    expect(daysFromNow(await storedExpiry())).toBeGreaterThan(SESSION_DAYS - 1);
  });

  it("as páginas só leem a sessão: não gravam no banco sem poder renovar o cookie", async () => {
    const cookie = await signIn();
    const lastUse = new Date(Date.now() + 200 * DAY_MS);
    await db.update(session).set({ expiresAt: lastUse }).where(eq(session.userId, userId));

    const result = (await auth.api.getSession({ headers: new Headers({ cookie: cookie.header }) })) as { needsRefresh?: boolean } | null;
    expect(result).not.toBeNull();
    // Está na hora de renovar, mas quem renova é o navegador (que consegue gravar o cookie).
    expect(result?.needsRefresh).toBe(true);
    expect((await storedExpiry())?.getTime()).toBe(lastUse.getTime());
  });

  it("o navegador renova: mais 1 ano no banco e no cookie", async () => {
    const cookie = await signIn();
    // Último uso há 300 dias: faltam 65 para vencer.
    await db.update(session).set({ expiresAt: new Date(Date.now() + 65 * DAY_MS) }).where(eq(session.userId, userId));

    // Igual ao SessionKeeper: POST com corpo JSON (no Next, POST sem esse cabeçalho dá 415).
    const response = await auth.handler(
      new Request(`${ORIGIN}/api/auth/get-session`, {
        method: "POST",
        headers: { cookie: cookie.header, origin: ORIGIN, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect(sessionCookie(response)?.maxAge).toBe(SESSION_DAYS * 86_400);
    expect(daysFromNow(await storedExpiry())).toBeGreaterThan(SESSION_DAYS - 1);
  });

  it("só sai clicando em Sair; sessão vencida não volta", async () => {
    const cookie = await signIn();
    const headers = new Headers({ cookie: cookie.header });
    await auth.api.signOut({ headers });
    expect(await storedExpiry()).toBeNull();
    expect(await auth.api.getSession({ headers })).toBeNull();

    // Um ano sem abrir o sistema: aí, sim, pede o login de novo.
    const again = await signIn();
    await db.update(session).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(session.userId, userId));
    expect(await auth.api.getSession({ headers: new Headers({ cookie: again.header }) })).toBeNull();
  });
});
