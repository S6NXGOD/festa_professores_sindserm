import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { appVersion } from "@/server/version";

/**
 * Verificação de saúde (Railway): o sistema responde, o banco atende e já tem
 * as tabelas (sem migrations aplicadas, o deploy não entra no ar).
 * Não expõe nenhum dado: só o commit publicado, para conferir que uma mudança já está no ar.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1 FROM event_config LIMIT 1`);
    return Response.json({ ok: true, version: appVersion().commit }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
