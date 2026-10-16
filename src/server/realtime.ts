import "server-only";
import { Client } from "pg";

/*
 * Mesa dos kits em tempo real. O banco avisa (NOTIFY no canal "desk_queue",
 * gatilhos da migração 0014) quando uma entrada é registrada ou estornada e
 * quando um kit sai ou é estornado. Uma conexão só, por servidor, escuta o
 * canal e repassa para todas as telas da mesa abertas (cada uma num fluxo SSE).
 * Sem ninguém escutando por 1 minuto, a conexão fecha; caiu, reconecta sozinha
 * e as telas recebem "resync" para conferir a lista.
 */

export type DeskEvent = { kind: "entry" | "kit"; personId: string | null } | { kind: "resync"; personId: null };
type Listener = (event: DeskEvent) => void;

interface Hub {
  listeners: Set<Listener>;
  client: Client | null;
  connecting: Promise<void> | null;
  retry: ReturnType<typeof setTimeout> | null;
  idle: ReturnType<typeof setTimeout> | null;
}

const CHANNEL = "desk_queue";
const globalForHub = globalThis as unknown as { __festaDeskHub?: Hub };

function hub(): Hub {
  globalForHub.__festaDeskHub ??= {
    listeners: new Set(),
    client: null,
    connecting: null,
    retry: null,
    idle: null,
  };
  return globalForHub.__festaDeskHub;
}

function broadcast(event: DeskEvent) {
  for (const listener of hub().listeners) {
    try {
      listener(event);
    } catch {
      // Uma tela que fechou no meio do envio não derruba as outras.
    }
  }
}

function parse(payload: string | undefined): DeskEvent {
  try {
    const data = JSON.parse(payload ?? "{}") as {
      t?: string;
      p?: string | null;
    };
    return {
      kind: data.t === "entry" ? "entry" : "kit",
      personId: typeof data.p === "string" ? data.p : null,
    };
  } catch {
    return { kind: "resync", personId: null };
  }
}

function scheduleReconnect(state: Hub) {
  if (state.retry || state.listeners.size === 0) return;
  state.retry = setTimeout(() => {
    state.retry = null;
    void connect(state).then(() => broadcast({ kind: "resync", personId: null }));
  }, 2_000);
}

async function connect(state: Hub): Promise<void> {
  if (state.client) return;
  if (state.connecting) return state.connecting;
  state.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    const drop = () => {
      if (state.client === client) state.client = null;
      client.removeAllListeners();
      void client.end().catch(() => undefined);
      scheduleReconnect(state);
    };
    try {
      client.on("error", drop);
      client.on("end", drop);
      client.on("notification", (message) => {
        if (message.channel === CHANNEL) broadcast(parse(message.payload));
      });
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      state.client = client;
    } catch (error) {
      console.error("Mesa em tempo real: sem conexão com o banco agora; nova tentativa em 2 s.", error instanceof Error ? error.name : typeof error);
      drop();
    } finally {
      state.connecting = null;
    }
  })();
  return state.connecting;
}

/** Passa a receber os avisos da mesa. Devolve a função que para de receber. */
export function subscribeDeskEvents(listener: Listener): () => void {
  const state = hub();
  state.listeners.add(listener);
  if (state.idle) {
    clearTimeout(state.idle);
    state.idle = null;
  }
  void connect(state);
  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size > 0 || state.idle) return;
    // Ninguém escutando: fecha a conexão depois de 1 minuto (uma tela recarregando não derruba nada).
    state.idle = setTimeout(() => {
      state.idle = null;
      if (state.listeners.size > 0 || !state.client) return;
      const client = state.client;
      state.client = null;
      client.removeAllListeners();
      void client.end().catch(() => undefined);
    }, 60_000);
    // O relógio de fechar não segura o processo aberto (ex.: fim dos testes).
    state.idle.unref?.();
  };
}
