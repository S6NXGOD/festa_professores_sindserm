import Link from "next/link";
import { BrandLockup, UnionLogo } from "@/components/brand/brand";
import { HelpButton, HelpLine } from "@/components/help/help";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { SoundToggle } from "@/components/retro/sound-toggle";
import { cn } from "@/lib/utils";

/**
 * Moldura das páginas públicas: cenário anos 80, marca da festa, ajuda pelo
 * WhatsApp (número vem do layout raiz; sem número, nada aparece) e rodapé do sindicato.
 */
export function PublicShell({
  eventName,
  children,
  className,
  wide = false,
  backdrop = "stage",
  help,
}: {
  eventName: string;
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
  backdrop?: "stage" | "hero" | "calm";
  /**
   * Botão flutuante de dúvidas: assunto da mensagem pronta e posição (ex.: acima
   * da barra de botões do formulário). `false` esconde o botão.
   */
  help?: { topic?: string; className?: string } | false;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip print:block print:min-h-0">
      <RetroBackdrop variant={backdrop} />
      <header className="no-print safe-top relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pb-3">
        <Link href="/" className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-red">
          {/* Nome em até duas linhas: "Festa das Professoras e Professores 2026" não cabe numa linha no celular. */}
          <BrandLockup name={eventName} kicker="SINDSERM" wrap />
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <SoundToggle />
          <UnionLogo className="hidden w-36 opacity-90 sm:block" sizes="144px" eager fetchPriority="high" />
        </div>
      </header>
      <main className={cn("relative z-10 mx-auto w-full flex-1 px-4 pt-4 pb-16 print:p-0", wide ? "max-w-5xl" : "max-w-2xl", className)}>
        {children}
      </main>
      <footer className="no-print relative z-10 border-t border-line/60 bg-ink/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-6 text-center sm:flex-row sm:justify-between sm:text-left">
          {/* Mesmo arquivo do logo do topo: o Next confunde as duas cópias e acusa "LCP lazy" se esta for lazy.
              Carrega junto, mas com prioridade baixa (não atrasa o conteúdo principal). */}
          <UnionLogo className="w-52" sizes="208px" eager fetchPriority="low" />
          <div className="text-xs text-fg-dim">
            <p>{eventName} · inscrições do SINDSERM.</p>
            <HelpLine lead="Dúvidas?" className="mt-1 justify-center text-xs sm:justify-start" />
            <Link href="/entrar" className="mt-1 inline-block font-semibold text-fg-muted underline-offset-4 hover:text-fg hover:underline">
              Acesso da equipe
            </Link>
          </div>
        </div>
      </footer>
      {help !== false ? <HelpButton topic={help?.topic} className={help?.className} /> : null}
    </div>
  );
}
