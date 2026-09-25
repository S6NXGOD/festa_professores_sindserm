"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Chart, ChevronDown, Key, Logout, Play, QrCode, Volume, VolumeOff } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/domain/labels";
import type { StaffRole } from "@/domain/types";
import { authClient } from "@/lib/auth-client";
import { playSound, setSoundEnabled, useSoundEnabled } from "@/lib/sound";
import { initials } from "@/lib/text";
import { cn } from "@/lib/utils";

export function UserMenu({
  name,
  role,
  showPanel,
  showGate,
  compact = false,
}: {
  name: string;
  role: StaffRole;
  showPanel?: boolean;
  showGate?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const soundOn = useSoundEnabled();

  function signOut() {
    startTransition(async () => {
      try {
        await authClient.signOut();
      } finally {
        router.replace("/entrar");
        router.refresh();
      }
    });
  }

  function toggleSound() {
    setSoundEnabled(!soundOn);
    // Ao ligar, toca a "moeda" da entrada confirmada: a pessoa ouve como é.
    if (!soundOn) playSound("coin");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn("h-11 gap-2 px-2 normal-case", compact && "px-1.5")} data-testid="user-menu">
          <span className="pixel inline-flex size-8 items-center justify-center rounded-md bg-brand text-[0.55rem] text-white shadow-[0_3px_0_0_var(--brand-strong)]">
            {initials(name)}
          </span>
          {!compact ? (
            <span className="hidden text-left leading-tight [font-stretch:100%] sm:block">
              <span className="block max-w-40 truncate font-sans text-sm font-semibold tracking-normal text-fg">{name}</span>
              <span className="block font-sans text-xs font-medium tracking-normal text-fg-muted">{ROLE_LABEL[role]}</span>
            </span>
          ) : null}
          <ChevronDown className="size-4 text-fg-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-fg">{name}</span>
          <span className="block text-xs font-normal text-fg-muted">{ROLE_LABEL[role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showPanel ? (
          <DropdownMenuItem asChild>
            <Link href="/painel">
              <Chart /> Painel
            </Link>
          </DropdownMenuItem>
        ) : null}
        {showGate ? (
          <DropdownMenuItem asChild>
            <Link href="/portaria">
              <QrCode /> Portaria
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            toggleSound();
          }}
          className="items-start"
          data-testid="toggle-sound"
        >
          {soundOn ? <Volume className="mt-0.5" /> : <VolumeOff className="mt-0.5" />}
          <span className="flex flex-col">
            <span>{soundOn ? "Sons 8-bit: ligados" : "Sons 8-bit: desligados"}</span>
            <span className="text-xs font-normal text-fg-muted">Tocam ao ler QR, confirmar entrada e entregar kit</span>
          </span>
        </DropdownMenuItem>
        {soundOn ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              playSound("coin");
            }}
          >
            <Play /> Ouvir um exemplo
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/conta">
            <Key /> Trocar senha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} disabled={pending} variant="destructive" data-testid="sign-out">
          <Logout /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
