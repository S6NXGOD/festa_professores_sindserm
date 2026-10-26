import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { eventConfig } from "@/server/db/schema";
import { EDITION } from "@/domain/edition";
import { type KitCounts, type KitPlan, type KitPlanInput, kitPlanSchema } from "@/domain/kit-plan";
import { type Actor, assertPermission } from "./actor";
import { writeAudit } from "./audit";
import { DomainError } from "./errors";
import { withTx } from "./tx";

const EXPECTED = sql`('PENDING', 'AWAITING_SIGNATURE', 'CONFIRMED', 'JOINED_AT_EVENT')`;
/** Kit dividido (ver `Edition.sharedKit`): convidado de inscrito não tem kit próprio, então não entra na montagem. */
const MEMBER_GUEST_KITS = sql.raw(EDITION.sharedKit ? "false" : "true");

/** A montagem salva (null = ainda não montada; dado estranho também vira null). */
export async function getKitPlan(ex: Executor): Promise<KitPlan | null> {
  const [row] = await ex.select({ plan: eventConfig.kitPlan }).from(eventConfig).where(eq(eventConfig.id, 1)).limit(1);
  if (!row?.plan) return null;
  const parsed = kitPlanSchema.safeParse(row.plan);
  return parsed.success ? parsed.data : null;
}

/** Salva o que vem em cada kit (Configurações: editar). */
export async function updateKitPlan(actor: Actor, raw: KitPlanInput) {
  assertPermission(actor, "manageSettings");
  const plan = kitPlanSchema.parse(raw);
  return withTx(async (tx) => {
    const [config] = await tx.select({ id: eventConfig.id }).from(eventConfig).where(eq(eventConfig.id, 1)).for("update");
    if (!config) throw new DomainError("INVALID_STATE", "Conclua a configuração inicial primeiro.");
    await tx.update(eventConfig).set({ kitPlan: plan }).where(eq(eventConfig.id, 1));
    await writeAudit(tx, actor, {
      action: "KIT_PLAN_UPDATED",
      entityType: "stock",
      summary: `Montagem dos kits alterada: ${plan.items.length === 1 ? "1 item" : `${plan.items.length} itens`}.`,
      after: plan,
    });
  });
}

export interface KitScenarioCounts {
  /** Previsão: todos os kits garantidos (inclui quem aguarda conferência e o que já saiu). */
  forecast: KitCounts;
  /** Fila do kit: se todos ganharem. */
  waitlist: KitCounts;
  /** O que já saiu. */
  delivered: KitCounts;
}

/** Quantos kits de cada tipo, em cada cenário (a mesma conta da previsão do estoque). */
export async function getKitCounts(ex: Executor): Promise<KitScenarioCounts> {
  const result = await ex.execute<Record<string, number>>(sql`
    WITH active_employees AS (
      SELECT e.id, e.person_id, e.category, e.with_kit FROM employee e WHERE e.removed_at IS NULL
    ),
    deliveries AS (
      SELECT kd.kit_type, kd.registration_id, kd.employee_id, e.category AS employee_category, p.is_minor
        FROM kit_delivery kd
        LEFT JOIN employee e ON e.id = kd.employee_id
        JOIN person p ON p.id = kd.beneficiary_person_id
       WHERE kd.cancelled_at IS NULL
    )
    SELECT
      (SELECT count(*) FROM registration WHERE status IN ${EXPECTED} AND is_teacher AND member_kit_waitlisted_at IS NULL)::int AS f_member,
      (SELECT count(*) FROM registration r
        WHERE ${MEMBER_GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NULL
          AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE')
               OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
      )::int AS f_guest,
      (SELECT count(*) FROM registration r
         JOIN guest_link gl ON gl.registration_id = r.id AND gl.status = 'ACTIVE'
         JOIN person gp ON gp.id = gl.guest_person_id
        WHERE ${MEMBER_GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NULL AND gp.is_minor)::int AS f_guest_minor,
      (SELECT count(*) FROM active_employees WHERE category <> 'COURTESY')::int AS f_employee,
      (SELECT count(*) FROM active_employees e
        WHERE EXISTS (SELECT 1 FROM guest_link gl WHERE gl.employee_id = e.id AND gl.status = 'ACTIVE')
           OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.employee_id = e.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL)
      )::int AS f_employee_guest,
      (SELECT count(*) FROM active_employees e
         JOIN guest_link gl ON gl.employee_id = e.id AND gl.status = 'ACTIVE'
         JOIN person gp ON gp.id = gl.guest_person_id
        WHERE gp.is_minor)::int AS f_employee_guest_minor,
      (SELECT count(*) FROM active_employees WHERE category = 'COURTESY' AND with_kit)::int AS f_courtesy,
      (SELECT count(*) FROM active_employees e JOIN person p ON p.id = e.person_id
        WHERE e.category = 'COURTESY' AND e.with_kit AND p.is_minor)::int AS f_courtesy_minor,

      (SELECT count(*) FROM registration WHERE status IN ${EXPECTED} AND is_teacher AND member_kit_waitlisted_at IS NOT NULL)::int AS w_member,
      (SELECT count(*) FROM registration r
         JOIN guest_link gl ON gl.registration_id = r.id AND gl.status = 'ACTIVE'
        WHERE ${MEMBER_GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NOT NULL)::int AS w_guest,
      (SELECT count(*) FROM registration r
         JOIN guest_link gl ON gl.registration_id = r.id AND gl.status = 'ACTIVE'
         JOIN person gp ON gp.id = gl.guest_person_id
        WHERE ${MEMBER_GUEST_KITS} AND r.status IN ${EXPECTED} AND r.is_teacher AND r.guest_kit_waitlisted_at IS NOT NULL AND gp.is_minor)::int AS w_guest_minor,

      (SELECT count(*) FROM deliveries WHERE kit_type = 'MEMBER')::int AS d_member,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'GUEST' AND registration_id IS NOT NULL)::int AS d_guest,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'GUEST' AND registration_id IS NOT NULL AND is_minor)::int AS d_guest_minor,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'EMPLOYEE' AND employee_category <> 'COURTESY')::int AS d_employee,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'GUEST' AND employee_id IS NOT NULL)::int AS d_employee_guest,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'GUEST' AND employee_id IS NOT NULL AND is_minor)::int AS d_employee_guest_minor,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'EMPLOYEE' AND employee_category = 'COURTESY')::int AS d_courtesy,
      (SELECT count(*) FROM deliveries WHERE kit_type = 'EMPLOYEE' AND employee_category = 'COURTESY' AND is_minor)::int AS d_courtesy_minor
  `);
  const row = result.rows[0] ?? {};
  const n = (key: string) => Number(row[key] ?? 0);
  const scenario = (prefix: "f" | "w" | "d"): KitCounts => ({
    kits: {
      MEMBER: n(`${prefix}_member`),
      GUEST: n(`${prefix}_guest`),
      EMPLOYEE: n(`${prefix}_employee`),
      EMPLOYEE_GUEST: n(`${prefix}_employee_guest`),
      COURTESY: n(`${prefix}_courtesy`),
    },
    minors: {
      // Professoras, professores e colaboradores são maiores de idade.
      MEMBER: 0,
      GUEST: n(`${prefix}_guest_minor`),
      EMPLOYEE: 0,
      EMPLOYEE_GUEST: n(`${prefix}_employee_guest_minor`),
      COURTESY: n(`${prefix}_courtesy_minor`),
    },
  });
  return { forecast: scenario("f"), waitlist: scenario("w"), delivered: scenario("d") };
}
