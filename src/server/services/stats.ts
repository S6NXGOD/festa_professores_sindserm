import "server-only";
import { sql } from "drizzle-orm";
import type { Executor } from "@/server/db";
import { getStockOverview, type StockOverview } from "./settings";

export interface DashboardStats {
  registrations: number;
  pending: number;
  awaitingSignature: number;
  /** Fichas de filiação esperando assinatura (do site e do Atendimento): a fila de Fichas de filiação. */
  draftForms: number;
  confirmed: number;
  rejected: number;
  joinedAtEvent: number;
  teachers: number;
  otherMembers: number;
  guests: number;
  expected: number;
  present: number;
  absent: number;
  kitsDeliveredMember: number;
  kitsDeliveredGuest: number;
  kitsDeliveredEmployee: number;
  kitsOwedMember: number;
  kitsOwedGuest: number;
  kitsOwedEmployee: number;
  /** Funcionários do SINDSERM na lista, os que já entraram e os convidados deles. */
  employees: number;
  employeesPresent: number;
  employeeGuests: number;
  /**
   * Previsão de kits com todos os inscritos (inclui quem aguarda conferência ou
   * assinatura e o que já foi entregue): professor(a), convidado de professor(a)
   * e o estoque dos funcionários (funcionários + convidados deles).
   */
  kitDemand: { member: number; guest: number; employee: number };
  stock: StockOverview | null;
}

const EXPECTED_STATUSES = sql`('PENDING', 'AWAITING_SIGNATURE', 'CONFIRMED', 'JOINED_AT_EVENT')`;
const ACTIVE_STATUSES = sql`('CONFIRMED', 'JOINED_AT_EVENT')`;

export async function getDashboardStats(ex: Executor): Promise<DashboardStats> {
  const result = await ex.execute<Record<string, number>>(sql`
    WITH expected_people AS (
      SELECT r.member_person_id AS person_id
        FROM registration r
       WHERE r.status IN ${EXPECTED_STATUSES}
      UNION
      SELECT gl.guest_person_id
        FROM guest_link gl
        JOIN registration r ON r.id = gl.registration_id
       WHERE gl.status = 'ACTIVE' AND r.status IN ${EXPECTED_STATUSES}
      UNION
      SELECT e.person_id FROM employee e WHERE e.removed_at IS NULL
      UNION
      SELECT gl.guest_person_id
        FROM guest_link gl
        JOIN employee e ON e.id = gl.employee_id
       WHERE gl.status = 'ACTIVE' AND e.removed_at IS NULL
    ),
    active_checkins AS (
      SELECT person_id FROM check_in WHERE cancelled_at IS NULL
    )
    SELECT
      (SELECT count(*) FROM registration)::int AS registrations,
      (SELECT count(*) FROM registration WHERE status = 'PENDING')::int AS pending,
      (SELECT count(*) FROM registration WHERE status = 'AWAITING_SIGNATURE')::int AS awaiting_signature,
      (SELECT count(*) FROM affiliation_form WHERE status = 'DRAFT')::int AS draft_forms,
      (SELECT count(*) FROM registration WHERE status = 'CONFIRMED')::int AS confirmed,
      (SELECT count(*) FROM registration WHERE status = 'REJECTED')::int AS rejected,
      (SELECT count(*) FROM registration WHERE status = 'JOINED_AT_EVENT')::int AS joined,
      (SELECT count(*) FROM registration WHERE status IN ${EXPECTED_STATUSES} AND is_teacher)::int AS teachers,
      (SELECT count(*) FROM registration WHERE status IN ${EXPECTED_STATUSES} AND NOT is_teacher)::int AS other_members,
      (SELECT count(*) FROM guest_link gl JOIN registration r ON r.id = gl.registration_id
        WHERE gl.status = 'ACTIVE' AND r.status IN ${EXPECTED_STATUSES})::int AS guests,
      (SELECT count(*) FROM expected_people)::int AS expected,
      (SELECT count(*) FROM active_checkins)::int AS present,
      (SELECT count(*) FROM expected_people e JOIN active_checkins c ON c.person_id = e.person_id)::int AS present_expected,
      (SELECT count(*) FROM kit_delivery WHERE cancelled_at IS NULL AND kit_type = 'MEMBER')::int AS delivered_member,
      (SELECT count(*) FROM kit_delivery WHERE cancelled_at IS NULL AND kit_type = 'GUEST' AND employee_id IS NULL)::int AS delivered_guest,
      (SELECT count(*) FROM registration WHERE status IN ${ACTIVE_STATUSES} AND is_teacher)::int AS entitled_member,
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${ACTIVE_STATUSES} AND r.is_teacher
          AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE')
               OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
      )::int AS entitled_guest,
      (SELECT count(*) FROM registration r
        WHERE r.status IN ${EXPECTED_STATUSES} AND r.is_teacher
          AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.registration_id = r.id AND gl.status = 'ACTIVE')
               OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.registration_id = r.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
      )::int AS demand_guest,
      (SELECT count(*) FROM employee WHERE removed_at IS NULL)::int AS employees,
      (SELECT count(*) FROM employee e JOIN active_checkins c ON c.person_id = e.person_id WHERE e.removed_at IS NULL)::int AS employees_present,
      (SELECT count(*) FROM guest_link gl JOIN employee e ON e.id = gl.employee_id
        WHERE gl.status = 'ACTIVE' AND e.removed_at IS NULL)::int AS employee_guests,
      (SELECT count(*) FROM employee e
        WHERE e.removed_at IS NULL
          AND (EXISTS (SELECT 1 FROM guest_link gl WHERE gl.employee_id = e.id AND gl.status = 'ACTIVE')
               OR EXISTS (SELECT 1 FROM kit_delivery kd WHERE kd.employee_id = e.id AND kd.kit_type = 'GUEST' AND kd.cancelled_at IS NULL))
      )::int AS entitled_employee_guest,
      (SELECT count(*) FROM kit_delivery WHERE cancelled_at IS NULL AND employee_id IS NOT NULL)::int AS delivered_employee
  `);
  const row = result.rows[0]!;
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    registrations: n("registrations"),
    pending: n("pending"),
    awaitingSignature: n("awaiting_signature"),
    draftForms: n("draft_forms"),
    confirmed: n("confirmed"),
    rejected: n("rejected"),
    joinedAtEvent: n("joined"),
    teachers: n("teachers"),
    otherMembers: n("other_members"),
    guests: n("guests"),
    expected: n("expected"),
    present: n("present"),
    absent: Math.max(0, n("expected") - n("present_expected")),
    kitsDeliveredMember: n("delivered_member"),
    kitsDeliveredGuest: n("delivered_guest"),
    kitsDeliveredEmployee: n("delivered_employee"),
    kitsOwedMember: Math.max(0, n("entitled_member") - n("delivered_member")),
    kitsOwedGuest: Math.max(0, n("entitled_guest") - n("delivered_guest")),
    // Todo funcionário tem kit; o convidado dele também (os dois do estoque dos funcionários).
    kitsOwedEmployee: Math.max(0, n("employees") + n("entitled_employee_guest") - n("delivered_employee")),
    employees: n("employees"),
    employeesPresent: n("employees_present"),
    employeeGuests: n("employee_guests"),
    kitDemand: { member: n("teachers"), guest: n("demand_guest"), employee: n("employees") + n("entitled_employee_guest") },
    stock: await getStockOverview(ex),
  };
}

export interface TimelineBucket {
  start: Date;
  entries: number;
}

/**
 * Entradas por intervalo de 15 minutos nas últimas horas (equalizador do
 * painel). Buckets vazios aparecem com zero.
 */
export async function getCheckInTimeline(ex: Executor, hours = 6): Promise<TimelineBucket[]> {
  const result = await ex.execute<{ bucket: Date | string; entries: number }>(sql`
    WITH bounds AS (
      SELECT date_bin('15 minutes', now(), TIMESTAMPTZ '2000-01-01') AS last_bucket
    ),
    buckets AS (
      SELECT generate_series(last_bucket - make_interval(hours => ${hours}), last_bucket, interval '15 minutes') AS bucket
        FROM bounds
    )
    SELECT b.bucket,
           (SELECT count(*) FROM check_in c
             WHERE c.cancelled_at IS NULL
               AND c.checked_in_at >= b.bucket
               AND c.checked_in_at < b.bucket + interval '15 minutes')::int AS entries
      FROM buckets b
     ORDER BY b.bucket
  `);
  return result.rows.map((r) => ({ start: new Date(r.bucket), entries: Number(r.entries) }));
}

/** Entradas registradas por um operador (placar pessoal da portaria). */
export async function countCheckInsBy(ex: Executor, userId: string): Promise<number> {
  const result = await ex.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM check_in WHERE cancelled_at IS NULL AND checked_in_by_user_id = ${userId}
  `);
  return Number(result.rows[0]?.total ?? 0);
}
