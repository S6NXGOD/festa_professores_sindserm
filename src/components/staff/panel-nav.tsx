"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLockup } from "@/components/brand/brand";
import {
  Building,
  Chart,
  ClipboardNote,
  Database,
  Gift,
  Key,
  List,
  Login,
  Menu,
  type PixelIcon,
  QrCode,
  Settings,
} from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { type AccessMap, can } from "@/domain/access";
import { PANEL_NAV } from "@/domain/nav";
import { cn } from "@/lib/utils";

/** Tamanho das filas de trabalho, mostrado no item do menu onde o trabalho é feito. */
export interface NavBadges {
  pending: number;
  signature: number;
}

/** Ícone de cada item do menu (a lista e as permissões ficam em domain/nav). */
const ICON: Record<string, PixelIcon> = {
  "/painel": Chart,
  "/portaria": QrCode,
  "/painel/entradas": Login,
  "/painel/kits": Gift,
  "/painel/inscricoes": List,
  "/painel/filiacoes": ClipboardNote,
  "/painel/colaboradores": Building,
  "/painel/usuarios": Key,
  "/painel/auditoria": Database,
  "/painel/configuracoes": Settings,
};

function NavIcon({ href, className }: { href: string; className?: string }) {
  const Icon = ICON[href] ?? List;
  return <Icon className={className} />;
}

function NavLinks({ access, badges, onNavigate }: { access: AccessMap; badges: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-4" aria-label="Navegação do painel" data-testid="panel-nav">
      {PANEL_NAV.map((group) => {
        const items = group.items.filter((item) => can(access, item.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.title} className="grid gap-1">
            <p className="pixel px-3 pb-1 text-[0.5rem] tracking-[0.12em] text-fg-dim uppercase">{group.title}</p>
            {items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const badge = item.badge ? badges[item.badge] : 0;
              return (
                <Link
                  key={item.href}
                  href={badge > 0 && item.queueHref ? item.queueHref : item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-bold transition-colors",
                    active ? "bg-brand-soft text-fg" : "text-fg-muted hover:bg-white/5 hover:text-fg",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={cn(
                      "absolute inset-y-2 left-0 w-1 rounded-r bg-red transition-opacity",
                      active ? "opacity-100 shadow-[0_0_10px_var(--red)]" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <NavIcon href={item.href} className={cn("size-5", active ? "text-red" : "text-fg-dim group-hover:text-fg-muted")} />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 ? (
                    <span
                      className="pixel rounded-[3px] bg-warning px-1.5 py-1 text-[0.5rem] text-warning-foreground tabular"
                      data-testid={`nav-badge-${item.badge}`}
                      aria-label={`${badge} ${item.badge === "pending" ? "para conferir" : "para assinar"}`}
                    >
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export function PanelSidebar({ access, badges, eventName }: { access: AccessMap; badges: NavBadges; eventName: string }) {
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-line bg-ink-2/95 px-3 py-5 lg:flex">
      <Link href="/painel" className="rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-red">
        <BrandLockup name={eventName} kicker="Painel" wrap />
      </Link>
      {/* Em telas baixas (notebook), o menu rola sem empurrar o rodapé para fora. */}
      <div className="no-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <NavLinks access={access} badges={badges} />
      </div>
      <p className="pixel px-2 text-[0.45rem] leading-relaxed text-fg-dim">
        A luta não
        <br />
        sai de moda
      </p>
    </aside>
  );
}

export function PanelMobileNav({ access, badges, eventName }: { access: AccessMap; badges: NavBadges; eventName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative lg:hidden" aria-label="Abrir menu">
          <Menu />
          {badges.pending + badges.signature > 0 ? (
            <span className="absolute top-2 right-2 size-2 animate-blink rounded-[2px] bg-warning" />
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-6 overflow-y-auto border-line bg-ink-2 p-4">
        {/* Espaço à direita para o nome da festa não encostar no "X" de fechar. */}
        <SheetHeader className="p-0 pr-9">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <BrandLockup name={eventName} kicker="Painel" wrap />
        </SheetHeader>
        <NavLinks access={access} badges={badges} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
