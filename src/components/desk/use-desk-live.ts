"use client";

import { useEffect, useRef, useState } from "react";

export type DeskLiveEvent = {
  kind: "entry" | "kit" | "resync";
  personId: string | null;
};

/**
 * Avisos da mesa em tempo real (Server-Sent Events): entrou alguém, saiu um kit
 * ou houve estorno. Devolve se está conectado; sem conexão, a mesa volta a
 * consultar a fila com mais frequência. A cada (re)conexão, pede para conferir
 * a lista (o que aconteceu enquanto caiu).
 */
export function useDeskLive(onEvent: (event: DeskLiveEvent) => void): boolean {
  const [live, setLive] = useState(false);
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/portaria/mesa/eventos");
    source.addEventListener("hello", () => {
      setLive(true);
      handler.current({ kind: "resync", personId: null });
    });
    source.onmessage = (message) => {
      try {
        handler.current(JSON.parse(message.data) as DeskLiveEvent);
      } catch {
        // Aviso fora do formato: a próxima conferência da fila resolve.
      }
    };
    source.onerror = () => setLive(false);
    return () => source.close();
  }, []);

  return live;
}
