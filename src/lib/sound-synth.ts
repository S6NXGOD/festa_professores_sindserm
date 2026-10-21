/**
 * Síntese dos efeitos sonoros (sem arquivos de áudio), separada da tela para
 * poder ser medida: recebe o contexto de áudio, a saída e o instante de início.
 *
 * - Anos 80 (professoras e professores): videogame 8-bit, ondas quadradas.
 * - Verão (servidoras e servidores, "Quem luta também se diverte"): sons de
 *   piscina e praia — gota d'água, bolhas, onda, splash, steel drum (tambor de
 *   aço) e o apito do salva-vidas nos avisos. Tão curtos quanto os do
 *   fliperama: a portaria não fica mais lenta.
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

/** Videogame 8-bit (anos 80). */
export function play8bit(ctx: BaseAudioContext, out: AudioNode, name: SoundName, when: number) {
  for (const [frequency, start, duration, wave = "square"] of SEQUENCES[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = when + start;
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.08, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }
}

// ---------------------------------------------------------------------------
// Verão

type Voice = (ctx: BaseAudioContext, out: AudioNode, at: number) => void;

const SUMMER: Record<SoundName, Voice> = {
  // Toque: uma gota d'água.
  blip: (ctx, out, at) => drop(ctx, out, at, 680, 1500, 0.07),
  // Deu certo (QR lido, entrada): gota + o "plim" do steel drum.
  coin: (ctx, out, at) => {
    drop(ctx, out, at, 540, 1300, 0.06);
    pan(ctx, out, at + 0.05, 1319, 0.42);
  },
  // Kit entregue, salvo: bolhas subindo e um acorde do steel drum.
  powerup: (ctx, out, at) => {
    bubbles(ctx, out, at, 5);
    pan(ctx, out, at + 0.28, 1047, 0.45, 0.8);
    pan(ctx, out, at + 0.28, 1319, 0.45, 0.6);
    pan(ctx, out, at + 0.28, 1568, 0.45, 0.45);
  },
  // Inscrição feita: frase de calipso no steel drum, splash e bolhas.
  fanfare: (ctx, out, at) => {
    const riff: [frequency: number, start: number, length: number][] = [
      [784, 0, 0.3],
      [1047, 0.12, 0.3],
      [1319, 0.24, 0.3],
      [1568, 0.36, 0.35],
      [1319, 0.54, 0.3],
      [1568, 0.66, 0.3],
      [2093, 0.78, 0.75],
    ];
    for (const [frequency, start, length] of riff) pan(ctx, out, at + start, frequency, length);
    splash(ctx, out, at + 0.8, 0.45);
    bubbles(ctx, out, at + 0.9, 3);
  },
  // Inscrição nova no painel ("Onda nova!"): a onda vem e quebra num arpejo.
  levelup: (ctx, out, at) => {
    wave(ctx, out, at, 0.62);
    [1047, 1319, 1568, 2093].forEach((frequency, index) => pan(ctx, out, at + 0.3 + index * 0.07, frequency, index === 3 ? 0.7 : 0.3));
  },
  // Opa! (falta resolver): dois toques curtos do apito do salva-vidas.
  warn: (ctx, out, at) => {
    whistle(ctx, out, at, 0.13);
    whistle(ctx, out, at + 0.2, 0.17);
  },
  // Parou: a boia murchando.
  error: (ctx, out, at) => deflate(ctx, out, at, 0.38),
};

/**
 * Volume de cada som do verão, medido contra o 8-bit (mesmo volume médio; o
 * apito, na faixa em que o ouvido é mais sensível, um pouco abaixo).
 */
const SUMMER_LEVEL: Record<SoundName, number> = { blip: 1.35, coin: 0.8, powerup: 0.55, fanfare: 0.5, levelup: 0.45, warn: 0.4, error: 0.5 };

/** Piscina e praia (verão). */
export function playSummer(ctx: BaseAudioContext, out: AudioNode, name: SoundName, when: number) {
  const bus = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  bus.gain.value = SUMMER_LEVEL[name];
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  bus.connect(limiter).connect(out);
  SUMMER[name](ctx, bus, when);
}

/** Envelope curto: sobe rápido e some (sem estalo no começo nem no fim). */
function envelope(gain: GainNode, at: number, peak: number, attack: number, length: number) {
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
}

/** Gota d'água: seno que sobe rápido de tom e some ("plic"). */
function drop(ctx: BaseAudioContext, out: AudioNode, at: number, from: number, to: number, length: number, peak = 0.2) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.6);
  envelope(gain, at, peak, 0.004, length);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** Bolhas: gotas rápidas, cada uma mais aguda. */
function bubbles(ctx: BaseAudioContext, out: AudioNode, at: number, count: number) {
  for (let index = 0; index < count; index++) {
    const base = 380 + index * 110 + (index % 2) * 45;
    drop(ctx, out, at + index * 0.055, base, base * 2.3, 0.05, 0.14);
  }
}

/**
 * Steel drum: fundamental, oitava e a 12ª (as notas do tambor de aço são
 * afinadas assim), o agudo some antes, e a afinação "assenta" no ataque, como
 * a baqueta batendo no aço.
 */
function pan(ctx: BaseAudioContext, out: AudioNode, at: number, frequency: number, length: number, level = 1) {
  for (const [multiple, peak, decay] of [
    [1, 0.13, length],
    [2, 0.06, length * 0.6],
    [3, 0.03, length * 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency * multiple * 0.985, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * multiple, at + 0.03);
    envelope(gain, at, peak * level, 0.004, decay);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Um segundo de ruído branco (reaproveitado). */
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseCache.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buffer);
  }
  return buffer;
}

/** Splash: a água espirrando e caindo (ruído filtrado que desce). */
function splash(ctx: BaseAudioContext, out: AudioNode, at: number, length: number) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noise(ctx);
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2600, at);
  filter.frequency.exponentialRampToValueAtTime(700, at + length);
  filter.Q.value = 0.9;
  envelope(gain, at, 0.22, 0.01, length);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + length + 0.02);
}

/** Onda: o mar vem crescendo e quebra (o filtro sobe e desce). */
function wave(ctx: BaseAudioContext, out: AudioNode, at: number, length: number) {
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noise(ctx);
  filter.type = "bandpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(300, at);
  filter.frequency.exponentialRampToValueAtTime(1700, at + length * 0.55);
  filter.frequency.exponentialRampToValueAtTime(450, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.26, at + length * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
  source.stop(at + length + 0.02);
}

/** Apito do salva-vidas: tom agudo com o trinado da bolinha e um pouco de sopro. */
function whistle(ctx: BaseAudioContext, out: AudioNode, at: number, length: number) {
  const osc = ctx.createOscillator();
  const trill = ctx.createOscillator();
  const depth = ctx.createGain();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(2300, at);
  trill.type = "sine";
  trill.frequency.setValueAtTime(30, at);
  depth.gain.setValueAtTime(110, at);
  trill.connect(depth).connect(osc.frequency);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.06, at + 0.015);
  gain.gain.setValueAtTime(0.06, at + length - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(out);
  osc.start(at);
  trill.start(at);
  osc.stop(at + length + 0.02);
  trill.stop(at + length + 0.02);

  const breath = ctx.createBufferSource();
  const airy = ctx.createBiquadFilter();
  const breathGain = ctx.createGain();
  breath.buffer = noise(ctx);
  airy.type = "highpass";
  airy.frequency.value = 3200;
  envelope(breathGain, at, 0.025, 0.01, length);
  breath.connect(airy).connect(breathGain).connect(out);
  breath.start(at);
  breath.stop(at + length + 0.02);
}

/** A boia murchando: tom que desce tremendo, e um "plof" no fim. */
function deflate(ctx: BaseAudioContext, out: AudioNode, at: number, length: number) {
  const osc = ctx.createOscillator();
  const wobble = ctx.createOscillator();
  const depth = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(470, at);
  osc.frequency.exponentialRampToValueAtTime(120, at + length);
  wobble.type = "sine";
  wobble.frequency.setValueAtTime(12, at);
  depth.gain.setValueAtTime(22, at);
  wobble.connect(depth).connect(osc.frequency);
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  envelope(gain, at, 0.2, 0.01, length);
  osc.connect(filter).connect(gain).connect(out);
  osc.start(at);
  wobble.start(at);
  osc.stop(at + length + 0.02);
  wobble.stop(at + length + 0.02);
  drop(ctx, out, at + length - 0.06, 260, 150, 0.08, 0.16);
}
