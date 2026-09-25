import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { DEFAULT_EVENT_NAME } from "@/domain/labels";
import { db } from "@/server/db";
import { account, session, user, verification } from "@/server/db/schema";
import { publicBaseUrl } from "@/server/public-url";

const baseURL = publicBaseUrl();
// Rodando na própria máquina, o login funciona em qualquer porta (3000, 3200...):
// antes, abrir o sistema numa porta diferente da do BETTER_AUTH_URL dava "Invalid origin".
// Publicado com um domínio de verdade, só valem o BETTER_AUTH_URL e o TRUSTED_ORIGINS.
const isLocalBase = !baseURL || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL);
const extraOrigins = [
  ...(process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  ...(isLocalBase ? ["http://localhost:*", "http://127.0.0.1:*"] : []),
];

/**
 * Autenticação apenas da equipe (ADMIN, ATTENDANT, SECURITY). Participantes não
 * têm conta. Não há cadastro público: usuários são criados pelo administrador.
 */
export const auth = betterAuth({
  appName: DEFAULT_EVENT_NAME,
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: extraOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    autoSignIn: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  // A interface usa apenas login, logout e troca de senha. Demais rotas prontas do
  // Better Auth ficam desligadas (perfil, e-mail e exclusão são geridos pelo administrador).
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/social",
    "/update-user",
    "/change-email",
    "/delete-user",
    "/delete-user/callback",
    "/request-password-reset",
    "/reset-password",
    "/verify-password",
    "/send-verification-email",
    "/verify-email",
    "/update-session",
    "/list-sessions",
    "/revoke-session",
    "/revoke-sessions",
    "/revoke-other-sessions",
    "/link-social",
    "/unlink-account",
    "/list-accounts",
    "/account-info",
    "/get-access-token",
    "/refresh-token",
  ],
  user: {
    additionalFields: {
      role: { type: "string", required: false, input: false },
      active: { type: "boolean", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_DISABLED !== "true",
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: Boolean(baseURL?.startsWith("https://")),
  },
  databaseHooks: {
    session: {
      create: {
        // Usuário desativado não consegue iniciar sessão.
        before: async (newSession) => {
          const [row] = await db
            .select({ active: user.active })
            .from(user)
            .where(eq(user.id, newSession.userId))
            .limit(1);
          if (!row?.active) {
            throw new APIError("FORBIDDEN", { message: "Usuário desativado. Procure um administrador." });
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
