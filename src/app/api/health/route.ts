import { sql } from "drizzle-orm";
import { db } from "@/server/db";

/**
 * Verificação de saúde (Railway): o sistema responde e o banco atende.
 * Não expõe nenhum dado.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
