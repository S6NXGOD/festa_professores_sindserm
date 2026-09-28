import "server-only";
import { formatShortDateTime } from "@/lib/datetime";

/*
 * Qual versão do sistema está no ar: o commit que o Railway publicou (variável
 * automática dos deploys pelo GitHub, lida no servidor ou gravada no build) e
 * desde quando o servidor está de pé. Serve para a organização conferir, sem
 * depender de ninguém, que uma mudança já foi publicada.
 */

export interface AppVersion {
  /** Commit curto ("ae46af8"); nulo fora do Railway (ex.: no computador). */
  commit: string | null;
  /** Quando o servidor subiu (a versão entrou no ar). */
  since: Date;
}

export function appVersion(): AppVersion {
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.APP_BUILD_COMMIT || "").trim();
  return {
    commit: sha ? sha.slice(0, 7) : null,
    since: new Date(Date.now() - process.uptime() * 1000),
  };
}

/** "Versão ae46af8 · no ar desde 28/09 às 15:56" (menu do usuário). */
export function appVersionLabel(version = appVersion()): string {
  return `Versão ${version.commit ?? "local"} · no ar desde ${formatShortDateTime(version.since)}`;
}
