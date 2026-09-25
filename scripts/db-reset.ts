/**
 * Zera o banco para começar de novo, mantendo só os administradores.
 *
 *   npm run db:reset                      # pergunta antes (digite ZERAR)
 *   npm run db:reset -- --manter-festa    # mantém data, horários, local, ícone e estoque (zera as entregas)
 *   npm run db:reset -- --sim             # sem pergunta (use com cuidado)
 *
 * Apaga inscrições, pessoas, funcionários da festa, vouchers, entradas,
 * entregas de kits, fichas de filiação (com os documentos anexados),
 * auditoria e os usuários de Atendimento e Segurança/Recepção.
 * Sem --manter-festa, apaga também a configuração da festa: ao entrar, o
 * administrador cai no assistente de configuração.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { databaseNameOf, loadLocalEnv } from "./load-env";

const ALWAYS_KEEP = new Set(["user", "account", "session"]);
const FESTA_TABLES = ["event_config", "kit_stock", "event_photo", "site_icon"];

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim().toUpperCase() === "ZERAR";
  } finally {
    rl.close();
  }
}

async function main() {
  loadLocalEnv();
  const { values } = parseArgs({
    options: {
      sim: { type: "boolean", default: false },
      "manter-festa": { type: "boolean", default: false },
    },
  });
  const keepFesta = Boolean(values["manter-festa"]);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada (.env.local).");
  const target = `${databaseNameOf(url)} em ${new URL(url).host}`;

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const admins = await client.query<{ name: string; email: string }>(
      `SELECT name, email FROM "user" WHERE role = 'ADMIN' AND active ORDER BY created_at`,
    );
    if (admins.rowCount === 0) {
      throw new Error("Nenhum administrador ativo: o banco não foi zerado (você ficaria sem acesso). Crie um com npm run admin:create.");
    }

    // O WhatsApp de ajuda fica em event_config: some junto sem --manter-festa.
    const keep = new Set([...ALWAYS_KEEP, ...(keepFesta ? FESTA_TABLES : [])]);
    const tables = (
      await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
    ).rows
      .map((row) => row.tablename)
      .filter((name) => !keep.has(name));

    console.log(`\nBanco: ${target}`);
    console.log(`Administradores mantidos: ${admins.rows.map((a) => `${a.name} <${a.email}>`).join(", ")}`);
    console.log(
      keepFesta
        ? "Mantém a configuração da festa (data, horários, local, foto, ícone do site e estoque); as entregas voltam a zero."
        : "Apaga também a configuração da festa: ao entrar, o administrador configura tudo de novo.",
    );
    console.log(
      "Apaga: inscrições, pessoas, funcionários da festa, vouchers, entradas, entregas, fichas (com RG e contracheque), auditoria e usuários que não são administradores.\n",
    );

    if (!values.sim) {
      if (!process.stdin.isTTY) {
        console.log("Nada foi apagado: sem terminal para confirmar. Para confirmar sem pergunta, use --sim.");
        return;
      }
      if (!(await confirm("Digite ZERAR para confirmar: "))) {
        console.log("Nada foi apagado.");
        return;
      }
    }

    const counts = await client.query<{ people: number; registrations: number; checkins: number; deliveries: number }>(`
      SELECT (SELECT count(*) FROM person)::int AS people,
             (SELECT count(*) FROM registration)::int AS registrations,
             (SELECT count(*) FROM check_in WHERE cancelled_at IS NULL)::int AS checkins,
             (SELECT count(*) FROM kit_delivery WHERE cancelled_at IS NULL)::int AS deliveries
    `);
    const before = counts.rows[0]!;

    await client.query("BEGIN");
    try {
      // Sem CASCADE: se alguma tabela mantida dependesse de uma apagada, o Postgres recusa e nada muda.
      if (tables.length) await client.query(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY`);
      const removedUsers = await client.query(`DELETE FROM "user" WHERE role <> 'ADMIN'`);
      if (keepFesta) await client.query(`UPDATE kit_stock SET delivered = 0`);
      await client.query(
        `INSERT INTO audit_log (actor_user_id, actor_label, action, entity_type, entity_id, summary, after)
         VALUES (NULL, 'Linha de comando', 'DATABASE_RESET', 'event', NULL, $1, $2)`,
        [
          keepFesta ? "Banco zerado (configuração da festa mantida)." : "Banco zerado (festa precisa ser configurada de novo).",
          JSON.stringify({ ...before, removedUsers: removedUsers.rowCount, keptFesta: keepFesta }),
        ],
      );
      await client.query("COMMIT");
      console.log(
        `Pronto: ${before.people} pessoa(s), ${before.registrations} inscrição(ões), ${before.checkins} entrada(s), ` +
          `${before.deliveries} entrega(s) e ${removedUsers.rowCount} usuário(s) da equipe removidos.`,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
