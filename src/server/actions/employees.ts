"use server";

import { revalidatePath } from "next/cache";
import type { BulkEmployeesInput, EmployeeInput, UpdateEmployeeInput } from "@/domain/schemas";
import type { ActionResult } from "@/lib/action-result";
import {
  createEmployee,
  createEmployeesFromList,
  removeEmployee,
  restoreEmployee,
  updateEmployee,
} from "@/server/services/employees";
import { requireActionActor } from "@/server/session";
import { runAction } from "./result";

function refresh() {
  revalidatePath("/painel", "layout");
  revalidatePath("/portaria", "layout");
}

export async function createEmployeeAction(
  input: EmployeeInput,
): Promise<ActionResult<{ employeeId: string; personId: string; restored: boolean; guestName: string | null }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const created = await createEmployee(actor, input);
    refresh();
    return { employeeId: created.employeeId, personId: created.personId, restored: created.restored, guestName: created.guest?.name ?? null };
  });
}

export async function createEmployeesFromListAction(
  input: BulkEmployeesInput,
): Promise<ActionResult<{ created: number; guests: number; skipped: string[] }>> {
  return runAction(async () => {
    const actor = await requireActionActor();
    const result = await createEmployeesFromList(actor, input);
    refresh();
    return result;
  });
}

export async function updateEmployeeAction(input: UpdateEmployeeInput): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await updateEmployee(actor, input);
    refresh();
  });
}

export async function removeEmployeeAction(employeeId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await removeEmployee(actor, { employeeId: String(employeeId) });
    refresh();
  });
}

export async function restoreEmployeeAction(employeeId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActionActor();
    await restoreEmployee(actor, { employeeId: String(employeeId) });
    refresh();
  });
}
