/**
 * Sons da festa (sintetizados, sem arquivos): cada som, nos dois temas, toca
 * sem valor que o navegador recusaria (rampa exponencial até zero dá erro),
 * tudo o que começa a tocar para, e os sons da portaria continuam curtos.
 */
import { describe, expect, it } from "vitest";
import { play8bit, playSummer, type SoundName } from "@/lib/sound-synth";

const NAMES: SoundName[] = ["blip", "coin", "powerup", "fanfare", "levelup", "warn", "error"];

interface FakeSource {
  startAt?: number;
  stopAt?: number;
}

/** Contexto de áudio de mentira: registra o que cada som agenda. */
function fakeAudio() {
  const problems: string[] = [];
  const sources: FakeSource[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime(value: number, time: number) {
      if (!Number.isFinite(value) || !(time >= 0)) problems.push(`${name}: ${value} em ${time}`);
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      if (!(value > 0) || !(time >= 0)) problems.push(`${name}: rampa até ${value} em ${time}`);
    },
  });
  const node = () => ({ connect: <T>(target: T) => target });
  const source = (extra: Record<string, unknown>) => {
    const created: FakeSource & Record<string, unknown> = {
      ...node(),
      ...extra,
      start(time: number) {
        created.startAt = time;
      },
      stop(time: number) {
        created.stopAt = time;
      },
    };
    sources.push(created);
    return created;
  };
  const ctx = {
    sampleRate: 8000,
    currentTime: 0,
    destination: node(),
    createOscillator: () => source({ type: "sine", frequency: param("frequência") }),
    createBufferSource: () => source({ buffer: null }),
    createGain: () => ({ ...node(), gain: param("volume") }),
    createBiquadFilter: () => ({ ...node(), type: "lowpass", frequency: param("filtro"), Q: param("Q") }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param("limite"), knee: param("joelho"), ratio: param("razão") }),
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, problems, sources };
}

function schedule(play: typeof play8bit, name: SoundName) {
  const audio = fakeAudio();
  play(audio.ctx, audio.ctx.destination, name, 0);
  const end = Math.max(...audio.sources.map((source) => source.stopAt ?? Number.POSITIVE_INFINITY));
  return { ...audio, end };
}

describe("sons da festa", () => {
  for (const [theme, play] of [
    ["8-bit (anos 80)", play8bit],
    ["verão", playSummer],
  ] as const) {
    it(`${theme}: todo som toca sem valor inválido e tudo o que começa para`, () => {
      for (const name of NAMES) {
        const { problems, sources, end } = schedule(play, name);
        expect(problems, name).toEqual([]);
        expect(sources.length, name).toBeGreaterThan(0);
        for (const source of sources) {
          expect(source.startAt, name).toBeTypeOf("number");
          expect(source.stopAt! > source.startAt!, name).toBe(true);
        }
        expect(end, name).toBeLessThanOrEqual(1.6);
      }
    });
  }

  it("verão: os sons da portaria e dos formulários continuam curtos (não atrasam ninguém)", () => {
    for (const name of ["blip", "coin", "warn", "error"] as const) {
      expect(schedule(playSummer, name).end, name).toBeLessThanOrEqual(0.5);
    }
  });
});
