import "server-only";
import { db, type Tx } from "@/server/db";
import { pgErrorOf } from "./errors";

const RETRYABLE = new Set(["40P01", "40001"]); // deadlock / serialization failure

/** Executa em transação, repetindo automaticamente em caso de deadlock. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.transaction(fn);
    } catch (error) {
      const code = pgErrorOf(error)?.code;
      if (code && RETRYABLE.has(code) && attempt < 3) continue;
      throw error;
    }
  }
}
