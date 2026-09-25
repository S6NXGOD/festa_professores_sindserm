"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    timer = window.setInterval(() => listeners.forEach((l) => l()), 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => Math.floor(Date.now() / 1000);
const getServerSnapshot = () => null;

/**
 * Relógio compartilhado (atualiza a cada segundo). No servidor devolve null,
 * evitando divergência de hidratação em contagens regressivas.
 */
export function useNowSeconds(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
