"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { FestaEmblem } from "@/components/brand/brand";
import { Building, Check, Crown, Gift, Heart, Key, Login, QrCode, Settings, Sparkles, Whatsapp } from "@/components/icons/pixel";
import type { TutorialScene } from "@/domain/tutorial";
import { cn } from "@/lib/utils";

/*
 * Mini-cenas animadas de cada fase do tutorial: mostram o gesto em vez de só
 * descrever (o botão de confirmar, o QR sendo lido, a assinatura, os vouchers).
 * Com "reduzir movimento" ligado, ficam paradas.
 */

function useLoop() {
  const reduce = useReducedMotion();
  return reduce ? { repeat: 0 } : { repeat: Infinity };
}

/** Número que conta do zero até o valor (placar). */
function CountUp({ to, delay = 0 }: { to: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return;
    let frame = 0;
    const start = performance.now() + delay * 1000;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 900));
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, delay, reduce]);
  return <span className="tabular">{value}</span>;
}

function StartScene({ initials }: { initials: string }) {
  const loop = useLoop();
  return (
    <div className="flex h-full items-center justify-center gap-5">
      <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, ease: "easeInOut", ...loop }} className="w-28 shrink-0 sm:w-32">
        <FestaEmblem sizes="128px" />
      </motion.div>
      <div className="grid gap-2 text-center">
        <span className="pixel mx-auto rounded-[4px] bg-red px-2 py-1 text-[0.6rem] text-white shadow-[0_3px_0_0_var(--brand-strong)]">
          PLAYER {initials}
        </span>
        <motion.span
          className="pixel text-[0.62rem] text-warning"
          animate={{ opacity: [1, 0.15, 1] }}
          transition={{ duration: 1.1, ...loop }}
        >
          PRESS START
        </motion.span>
      </div>
    </div>
  );
}

function ScoreboardScene() {
  const tiles = [
    { label: "Inscrições", value: 128, tone: "text-red" },
    { label: "Prontos", value: 96, tone: "text-warning" },
    { label: "Na pista", value: 42, tone: "text-success-text" },
  ];
  return (
    <div className="grid h-full grid-cols-3 items-center gap-2 px-3">
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.15, type: "spring", stiffness: 300, damping: 20 }}
          className="rounded-lg border border-line-strong bg-surface-2 p-2.5 text-center"
        >
          <p className="text-[0.6rem] font-bold tracking-[0.08em] text-fg-dim uppercase">{tile.label}</p>
          <p className={cn("display mt-1 text-3xl", tile.tone)}>
            <CountUp to={tile.value} delay={index * 0.15} />
          </p>
        </motion.div>
      ))}
    </div>
  );
}

function QueueScene() {
  const loop = useLoop();
  return (
    <div className="flex h-full items-center justify-center px-3">
      <div className="relative w-full max-w-xs rounded-xl border border-line-strong bg-surface-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-bold text-fg">Maria Souza</p>
          <span className="rounded-md border border-warning/50 bg-warning-soft px-1.5 py-0.5 text-[0.62rem] font-bold text-warning">Para conferir</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <motion.span
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-success text-xs font-bold text-success-foreground"
            animate={{ scale: [1, 1, 0.92, 1.04, 1], boxShadow: ["0 0 0 0 rgb(34 197 94 / 0)", "0 0 0 0 rgb(34 197 94 / 0)", "0 0 0 6px rgb(34 197 94 / 0.35)", "0 0 0 0 rgb(34 197 94 / 0)", "0 0 0 0 rgb(34 197 94 / 0)"] }}
            transition={{ duration: 2.6, times: [0, 0.45, 0.55, 0.65, 1], ...loop }}
          >
            <Check className="size-3.5" /> Confirmar
          </motion.span>
          <span className="inline-flex h-8 items-center rounded-md border border-danger/50 px-2 text-[0.65rem] font-bold text-danger">Não confirmar</span>
          <span className="inline-flex size-8 items-center justify-center rounded-md border border-success/60 text-success-text">
            <Whatsapp className="size-4" />
          </span>
        </div>
        {/* O "dedo" que toca no Confirmar. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute size-5 rounded-full border-2 border-white/90 bg-white/25"
          style={{ left: "22%", top: "62%" }}
          animate={{ opacity: [0, 1, 1, 0, 0], scale: [1.6, 1, 0.7, 1.3, 1.3] }}
          transition={{ duration: 2.6, times: [0, 0.35, 0.55, 0.7, 1], ...loop }}
        />
      </div>
    </div>
  );
}

function FormScene() {
  const loop = useLoop();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative h-32 w-44 -rotate-2 rounded-md bg-[#f3e8d4] p-3 shadow-[0_12px_30px_-10px_rgb(0_0_0/0.8)]">
        <p className="pixel text-[0.45rem] text-[#17120d]">FICHA DE FILIAÇÃO</p>
        {[0, 1, 2].map((line) => (
          <span key={line} className="mt-2 block h-1.5 rounded bg-[#17120d]/15" style={{ width: `${88 - line * 14}%` }} />
        ))}
        <svg viewBox="0 0 120 30" className="absolute right-3 bottom-3 left-3 h-8" aria-hidden>
          <line x1="0" y1="26" x2="120" y2="26" stroke="#17120d" strokeOpacity="0.35" strokeWidth="1" />
          <motion.path
            d="M4 20 C 14 4, 22 26, 30 14 S 44 6, 50 18 S 64 26, 72 12 S 90 8, 96 18 L 112 16"
            fill="none"
            stroke="#e3000f"
            strokeWidth="2.2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1] }}
            transition={{ duration: 2.8, times: [0, 0.6, 1], ease: "easeInOut", ...loop }}
          />
        </svg>
      </div>
    </div>
  );
}

function VouchersScene() {
  const loop = useLoop();
  const cards = [
    { rotate: -12, x: -58, color: "border-red bg-[linear-gradient(160deg,#2a0507,#0e0e0f)]", label: "PLAYER 1" },
    { rotate: 0, x: 0, color: "border-warning bg-[linear-gradient(160deg,#2a2000,#0e0e0f)]", label: "DA CASA" },
    { rotate: 12, x: 58, color: "border-[#ff4fb4] bg-[linear-gradient(160deg,#2a0a1c,#0e0e0f)]", label: "CORTESIA" },
  ];
  return (
    <div className="relative flex h-full items-center justify-center">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          className={cn("absolute flex h-28 w-20 flex-col items-center justify-between rounded-lg border-2 p-1.5 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.9)]", card.color)}
          initial={{ rotate: 0, x: 0, opacity: 0 }}
          animate={{ rotate: card.rotate, x: card.x, opacity: 1, y: [0, -4, 0] }}
          transition={{ delay: index * 0.1, type: "spring", stiffness: 220, damping: 18, y: { duration: 2, delay: index * 0.3, ...loop } }}
        >
          <span className="pixel text-[0.4rem] text-fg">{card.label}</span>
          <span className="rounded bg-white p-1">
            <QrCode className="size-8 text-ink" />
          </span>
          <span className="h-1 w-10 rounded bg-white/25" />
        </motion.div>
      ))}
    </div>
  );
}

function GateScene() {
  const loop = useLoop();
  return (
    <div className="flex h-full items-center justify-center gap-5">
      <div className="relative size-24 rounded-xl bg-white p-2">
        <QrCode className="size-full text-ink" />
        <motion.span
          aria-hidden
          className="absolute inset-x-1 h-0.5 bg-red shadow-[0_0_10px_2px_rgb(255_38_38/0.8)]"
          animate={{ top: ["8%", "90%", "8%"] }}
          transition={{ duration: 1.8, ease: "easeInOut", ...loop }}
        />
      </div>
      <motion.div
        className="rounded-lg bg-success px-3 py-2 text-success-foreground shadow-[0_0_24px_-6px_rgb(34_197_94/0.8)]"
        animate={{ scale: [0.9, 1.05, 1], opacity: [0.6, 1, 1] }}
        transition={{ duration: 1.8, times: [0, 0.3, 1], ...loop }}
      >
        <p className="pixel text-[0.45rem] opacity-80">READY</p>
        <p className="display text-xl leading-none">LIBERADO</p>
        <p className="mt-1 flex items-center gap-1 text-[0.65rem] font-bold">
          <Gift className="size-3" /> + 1 kit
        </p>
      </motion.div>
    </div>
  );
}

function EntriesScene() {
  const rows = [
    { time: "19:02", name: "Ana Lima", how: "QR Code" },
    { time: "19:03", name: "Bruno Rocha", how: "busca" },
    { time: "19:05", name: "Carla Dias", how: "código" },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-4">
      {rows.map((row, index) => (
        <motion.div
          key={row.name}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + index * 0.35, type: "spring", stiffness: 260, damping: 22 }}
          className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs"
        >
          <span className="pixel text-[0.5rem] text-red">{row.time}</span>
          <Login className="size-3.5 text-success-text" />
          <span className="flex-1 truncate font-semibold text-fg">{row.name}</span>
          <span className="text-fg-dim">{row.how}</span>
        </motion.div>
      ))}
    </div>
  );
}

function HouseScene() {
  const loop = useLoop();
  const chips = [
    { icon: Crown, label: "Diretoria", className: "border-[#e4e4e7]/60 bg-white/10 text-[#f4f4f5]" },
    { icon: Building, label: "Funcionário(a)", className: "border-warning/50 bg-warning-soft text-warning" },
    { icon: Settings, label: "Prestador(a)", className: "border-[#22d3ee]/55 bg-[#22d3ee]/12 text-[#67e8f9]" },
    { icon: Heart, label: "Cortesia", className: "border-[#ff4fb4]/55 bg-[#ff4fb4]/12 text-[#ff8fd0]" },
  ];
  return (
    <div className="flex h-full flex-wrap content-center items-center justify-center gap-2 px-4">
      {chips.map((chip, index) => (
        <motion.span
          key={chip.label}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold", chip.className)}
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 0.5, delay: index * 0.18, repeatDelay: 1.6, ...loop }}
        >
          <chip.icon className="size-4" /> {chip.label}
        </motion.span>
      ))}
    </div>
  );
}

function AdminScene() {
  const loop = useLoop();
  return (
    <div className="flex h-full items-center justify-center gap-5">
      <motion.span
        className="inline-flex size-16 items-center justify-center rounded-xl bg-warning text-warning-foreground shadow-[0_4px_0_0_#8a6a00]"
        animate={{ rotate: [0, -12, 12, 0] }}
        transition={{ duration: 1.6, repeatDelay: 1, ...loop }}
      >
        <Key className="size-9" />
      </motion.span>
      <div className="grid gap-2">
        {["Inscrições", "Portaria"].map((area, index) => (
          <div key={area} className="flex items-center gap-2 text-xs font-semibold text-fg">
            <span className="w-16">{area}</span>
            <span className="relative inline-flex h-6 w-24 rounded-md border border-line-strong bg-surface-2 p-0.5">
              <motion.span
                className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded bg-red"
                animate={{ left: index === 0 ? ["2px", "calc(50%)", "2px"] : ["calc(50%)", "2px", "calc(50%)"] }}
                transition={{ duration: 2.4, ease: "easeInOut", ...loop }}
              />
              <span className="relative z-10 flex-1 text-center text-[0.6rem] leading-5">Ver</span>
              <span className="relative z-10 flex-1 text-center text-[0.6rem] leading-5">Editar</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelUpScene() {
  const loop = useLoop();
  return (
    <div className="relative flex h-full items-center justify-center">
      {[
        { left: "18%", top: "22%", delay: 0 },
        { left: "78%", top: "28%", delay: 0.4 },
        { left: "26%", top: "72%", delay: 0.8 },
        { left: "70%", top: "70%", delay: 1.2 },
      ].map((star) => (
        <motion.span
          key={`${star.left}-${star.top}`}
          aria-hidden
          className="absolute text-warning"
          style={{ left: star.left, top: star.top }}
          animate={{ scale: [0, 1.2, 0], rotate: [0, 90, 180] }}
          transition={{ duration: 1.6, delay: star.delay, ...loop }}
        >
          <Sparkles className="size-5" />
        </motion.span>
      ))}
      <motion.p
        className="display text-5xl text-warning drop-shadow-[0_0_18px_rgb(248_192_0/0.55)]"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 12 }}
      >
        LEVEL UP!
      </motion.p>
    </div>
  );
}

export function TutorialSceneView({ scene, initials }: { scene: TutorialScene; initials: string }) {
  switch (scene) {
    case "start":
      return <StartScene initials={initials} />;
    case "scoreboard":
      return <ScoreboardScene />;
    case "queue":
      return <QueueScene />;
    case "form":
      return <FormScene />;
    case "vouchers":
      return <VouchersScene />;
    case "gate":
      return <GateScene />;
    case "entries":
      return <EntriesScene />;
    case "house":
      return <HouseScene />;
    case "admin":
      return <AdminScene />;
    case "levelup":
      return <LevelUpScene />;
  }
}
