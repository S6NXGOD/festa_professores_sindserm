"use client";

import { useSyncExternalStore } from "react";

/**
 * Efeitos sonoros de videogame 8-bit sintetizados no navegador (sem arquivos
 * de áudio). Usados na portaria e nas entregas; podem ser desligados.
 */
export type SoundName = "blip" | "coin" | "powerup" | "fanfare" | "warn" | "error";

type Note = [frequency: number, start: number, duration: number, wave?: OscillatorType];

const SEQUENCES: Record<SoundName, Note[]> = {
  blip: [[1046, 0, 0.06]],
  coin: [
    [988, 0, 0.08],
    [1319, 0.08, 0.24],
  ],
  powerup: [
    [523, 0, 0.07],
    [659, 0.07, 0.07],
    [784, 0.14, 0.07],
    [1047, 0.21, 0.18],
  ],
  fanfare: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.26],
    [784, 0.52, 0.09],
    [1047, 0.62, 0.36],
  ],
  warn: [
    [466, 0, 0.11],
    [466, 0.17, 0.11],
  ],
  error: [
    [196, 0, 0.18, "sawtooth"],
    [147, 0.2, 0.32, "sawtooth"],
  ],
};

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
    for (const [frequency, start, duration, wave = "square"] of SEQUENCES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + start;
      osc.type = wave;
      osc.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.08, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    }
  } catch {
    // sem áudio
  }
}
