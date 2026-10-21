"use client";

import { useSyncExternalStore } from "react";
import { EDITION } from "@/domain/edition";
import { play8bit, playSummer, type SoundName } from "./sound-synth";

/**
 * Efeitos sonoros sintetizados no navegador (sem arquivos de áudio), no tema
 * da festa: videogame 8-bit (anos 80) ou piscina e praia (verão). Usados na
 * portaria, nas entregas e nas comemorações; podem ser desligados.
 */
export type { SoundName };

const STORAGE_KEY = "festa:som";
const EVENT = "festa:som-alterado";
let context: AudioContext | null = null;

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean) {
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

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(subscribe, readEnabled, () => true);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  context ??= new Ctx();
  if (context.state === "suspended") void context.resume();
  return context;
}

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || !readEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    (EDITION.theme === "verao" ? playSummer : play8bit)(ctx, ctx.destination, name, ctx.currentTime);
  } catch {
    // sem áudio
  }
}
