"use client";

import { useSyncExternalStore } from "react";
import { EDITION } from "@/domain/edition";

/**
 * Efeitos sonoros de videogame 8-bit sintetizados no navegador (sem arquivos
 * de áudio). Usados na portaria e nas entregas; podem ser desligados.
 */
export type SoundName = "blip" | "coin" | "powerup" | "fanfare" | "levelup" | "warn" | "error";

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
  // Subiu de nível: arpejo rápido de dó maior até o agudo e um brilho no fim (inscrição nova, fim do tutorial).
  levelup: [
    [523, 0, 0.06],
    [659, 0.06, 0.06],
    [784, 0.12, 0.06],
    [1047, 0.18, 0.06],
    [1319, 0.24, 0.06],
    [1568, 0.3, 0.2],
    [1319, 0.52, 0.06],
    [2093, 0.58, 0.3, "triangle"],
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

/*
 * Verão (festa das servidoras e servidores): os mesmos avisos, com timbre de
 * marimba/tambor de aço (seno com um harmônico, que soa e some) e um "splash"
 * de água nas comemorações. Mesmas durações: nada fica mais lento na portaria.
 */
const SUMMER_SEQUENCES: Record<SoundName, Note[]> = {
  blip: [[880, 0, 0.14]],
  coin: [
    [784, 0, 0.12],
    [1175, 0.09, 0.32],
  ],
  powerup: [
    [523, 0, 0.1],
    [587, 0.07, 0.1],
    [659, 0.14, 0.1],
    [784, 0.21, 0.1],
    [1047, 0.28, 0.3],
  ],
  fanfare: [
    [523, 0, 0.14],
    [659, 0.1, 0.14],
    [784, 0.2, 0.14],
    [1047, 0.3, 0.3],
    [880, 0.52, 0.12],
    [1047, 0.62, 0.42],
  ],
  levelup: [
    [587, 0, 0.1],
    [659, 0.06, 0.1],
    [784, 0.12, 0.1],
    [880, 0.18, 0.1],
    [1047, 0.24, 0.1],
    [1319, 0.3, 0.24],
    [1175, 0.52, 0.1],
    [1568, 0.58, 0.36],
  ],
  warn: [
    [392, 0, 0.16],
    [392, 0.2, 0.16],
  ],
  error: [
    [220, 0, 0.2, "triangle"],
    [165, 0.22, 0.34, "triangle"],
  ],
};

/** Comemorações do verão terminam com um "splash" de água. */
const SPLASH: readonly SoundName[] = ["levelup", "fanfare", "powerup"];

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

/** Marimba: seno com um harmônico, ataque rápido e decaimento que soa. */
function playSummer(ctx: AudioContext, name: SoundName) {
  for (const [frequency, start, duration, wave = "sine"] of SUMMER_SEQUENCES[name]) {
    const at = ctx.currentTime + start;
    for (const [multiple, level] of [
      [1, 0.11],
      [2, 0.035],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(frequency * multiple, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.16);
    }
  }
  if (SPLASH.includes(name)) splash(ctx, SUMMER_SEQUENCES[name].reduce((end, [, start, duration]) => Math.max(end, start + duration), 0));
}

/** Ruído filtrado curto: a água espirrando. */
function splash(ctx: AudioContext, delay: number) {
  const length = Math.floor(ctx.sampleRate * 0.4);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const at = ctx.currentTime + delay;
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2400, at);
  filter.frequency.exponentialRampToValueAtTime(700, at + 0.35);
  filter.Q.value = 0.9;
  gain.gain.setValueAtTime(0.09, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
  source.stop(at + 0.42);
}

export function playSound(name: SoundName) {
  if (typeof window === "undefined" || !readEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  try {
    if (EDITION.theme === "verao") {
      playSummer(ctx, name);
      return;
    }
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
