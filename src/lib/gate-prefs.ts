"use client";

import { useSyncExternalStore } from "react";

/*
 * Preferências do leitor da portaria, guardadas no próprio aparelho.
 * "Volta automática": depois de confirmar uma entrada, o leitor reabre sozinho
 * em alguns segundos (um toque na tela segura o resultado).
 */

const STORAGE_KEY = "festa:portaria-volta-automatica";
const EVENT = "festa:portaria-preferencia";

function readAutoNext(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoNext(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // armazenamento indisponível: vale só nesta página
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useAutoNext(): boolean {
  return useSyncExternalStore(subscribe, readAutoNext, () => true);
}
