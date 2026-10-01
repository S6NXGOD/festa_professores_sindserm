"use client";

import { useEffect } from "react";

const SESSION_URL = "/api/auth/get-session";
/** Voltar para a aba (outro app, tela bloqueada) consulta de novo, no máximo uma vez por minuto. */
const VISIBLE_AGAIN_MS = 60_000;

/** Consulta a sessão. Se estiver na hora de renovar, pede a renovação (banco e cookie juntos). */
async function keepAlive() {
  try {
    const response = await fetch(SESSION_URL, { cache: "no-store" });
    const data = (await response.json()) as { needsRefresh?: boolean } | null;
    if (!data?.needsRefresh) return;
    // O corpo JSON é obrigatório: sem ele, o Better Auth responde 415 no Next. Por isso não dá
    // para usar a renovação automática do authClient.useSession().
    await fetch(SESSION_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  } catch {
    // Sem rede: tenta de novo quando a pessoa voltar para a tela.
  }
}

/**
 * Mantém a equipe conectada. Ao abrir a tela e ao voltar para a aba, o navegador
 * consulta a sessão. Uma vez por dia ela é renovada por mais um ano, no banco e
 * no cookie. Fica no navegador porque as páginas do servidor não conseguem
 * regravar o cookie: antes, ele morria 24 h depois do login, mesmo com uso.
 */
export function SessionKeeper() {
  useEffect(() => {
    void keepAlive();
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < VISIBLE_AGAIN_MS) return;
      last = Date.now();
      void keepAlive();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
