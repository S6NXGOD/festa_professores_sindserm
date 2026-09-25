import Link from "next/link";
import { HelpLine } from "@/components/help/help";
import { Home } from "@/components/icons/pixel";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <RetroBackdrop />
      <div className="text-center">
        <p className="pixel text-[0.62rem] text-fg-muted">Erro 404</p>
        <h1 className="pixel mt-4 animate-flicker text-3xl leading-tight text-red neon-red sm:text-5xl">Game over</h1>
        <p className="mx-auto mt-6 max-w-sm text-fg-muted">
          Esta fita não existe. O endereço pode estar errado ou o conteúdo saiu do ar.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">
            <Home /> Voltar ao início
          </Link>
        </Button>
        <HelpLine lead="Se perdeu?" topic="achar uma página do site" className="mt-6 justify-center" />
        <p className="pixel mt-8 text-[0.55rem] text-fg-dim">
          Insert coin<span className="animate-blink">_</span>
        </p>
      </div>
    </main>
  );
}
