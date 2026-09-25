"use client";

import { HelpLine } from "@/components/help/help";
import { Reload, Warning } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60dvh] items-center justify-center px-4">
      <div className="max-w-md rounded-2xl border border-danger/40 bg-surface p-8 text-center">
        <Warning className="mx-auto size-12 text-danger" />
        <p className="pixel mt-5 text-[0.62rem] text-fg-muted">Continue?</p>
        <h1 className="display mt-2 text-4xl text-fg">Algo deu errado</h1>
        <p className="mt-3 text-fg-muted">Não foi possível carregar esta tela. Tente de novo em instantes.</p>
        <Button onClick={reset} className="mt-6">
          <Reload /> Tentar de novo
        </Button>
        <HelpLine lead="Continua dando erro?" topic={'usar o site (apareceu "Algo deu errado")'} className="mt-5 justify-center" />
      </div>
    </main>
  );
}
