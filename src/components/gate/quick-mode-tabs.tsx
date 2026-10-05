import Link from "next/link";
import { Heart, UserPlus } from "@/components/icons/pixel";
import { cn } from "@/lib/utils";

/**
 * Os dois cadastros rápidos da portaria, lado a lado: filiado(a) que chegou sem
 * inscrição ou cortesia da organização. Só aparece para quem pode fazer os dois;
 * o nome digitado na busca vai junto.
 */
export function QuickModeTabs({
  current,
  canRegister,
  canCourtesy,
  name,
}: {
  current: "registration" | "courtesy";
  canRegister: boolean;
  canCourtesy: boolean;
  name?: string;
}) {
  if (!canRegister || !canCourtesy) return null;
  const query = name ? `?nome=${encodeURIComponent(name)}` : "";
  const tabs = [
    { id: "registration", href: `/portaria/cadastro${query}`, label: "Filiado(a)", hint: "sem inscrição", icon: UserPlus },
    { id: "courtesy", href: `/portaria/cortesia${query}`, label: "Cortesia", hint: "da organização", icon: Heart },
  ] as const;
  return (
    <nav className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface p-1.5" aria-label="Tipo de cadastro rápido" data-testid="quick-mode-tabs">
      {tabs.map((tab) => {
        const selected = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            replace
            aria-current={selected ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 px-2 py-1.5 text-left transition-[color,background-color,border-color,transform] active:scale-95",
              selected
                ? tab.id === "courtesy"
                  ? "border-[#ff4fb4]/70 bg-[#ff4fb4]/15 text-fg shadow-[0_0_18px_-8px_rgb(255_79_180/0.9)]"
                  : "border-red/70 bg-red/15 text-fg shadow-[0_0_18px_-8px_var(--glow)]"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
            data-testid={`quick-mode-${tab.id}`}
          >
            <tab.icon className={cn("size-5 shrink-0", selected && tab.id === "courtesy" && "text-[#ff8fd0]")} />
            <span className="leading-tight">
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className="block text-xs opacity-80">{tab.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
