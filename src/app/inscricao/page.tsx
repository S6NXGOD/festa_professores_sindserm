import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHelp, HelpLine } from "@/components/help/help";
import { Calendar, Home, QrCode } from "@/components/icons/pixel";
import { ClosingSoon } from "@/components/public/closing-soon";
import { PublicShell } from "@/components/public/public-shell";
import { VenueCompact } from "@/components/public/venue";
import { RegistrationFlow } from "@/components/registration/registration-flow";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatTime, todayInZone } from "@/lib/datetime";
import { db } from "@/server/db";
import { getConfig, getEventInfo, getRegistrationWindow } from "@/server/queries/config";
import { getKitSupply } from "@/server/services/kit-waitlist";

export const metadata: Metadata = { title: "Inscrição" };

export default async function RegistrationPage({ searchParams }: PageProps<"/inscricao">) {
  const [config, window, params, event, kitSupply] = await Promise.all([
    getConfig(),
    getRegistrationWindow(),
    searchParams,
    getEventInfo(),
    getKitSupply(db),
  ]);
  if (!config) redirect("/");

  if (window.state !== "OPEN") {
    return (
      <PublicShell eventName={config.name} help={{ topic: "me inscrever na festa" }}>
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
          <Calendar className="mx-auto size-12 text-red" />
          <p className="pixel mt-5 text-[0.6rem] text-fg-muted">{window.state === "NOT_OPEN" ? "Aguarde" : "Game over"}</p>
          <h1 className="display mt-2 text-4xl text-fg">
            {window.state === "NOT_OPEN" ? "Inscrições ainda não abertas" : "Inscrições encerradas"}
          </h1>
          <p className="mt-3 text-fg-muted">
            {window.state === "NOT_OPEN"
              ? `As inscrições começam em ${formatDateTime(window.opensAt)}.`
              : window.state === "CLOSED"
                ? `O período de inscrições terminou em ${formatDateTime(window.closesAt)}.`
                : "O período de inscrições terminou."}
          </p>
          {window.state === "CLOSED" ? (
            <Link
              href="/vouchers"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-fg underline-offset-4 hover:underline"
              data-testid="closed-recover-link"
            >
              <QrCode className="size-4 text-red" /> Já se inscreveu? Recuperar meus vouchers
            </Link>
          ) : null}
          {window.state === "CLOSED" ? (
            <AdminHelp topic="tirar uma dúvida sobre a inscrição (as inscrições já encerraram)" className="mt-5" />
          ) : (
            <HelpLine lead="Dúvidas?" topic="me inscrever na festa" className="mt-3 justify-center" />
          )}
          <Button asChild variant="outline" className="mt-6">
            <Link href="/">
              <Home /> Voltar ao início
            </Link>
          </Button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell eventName={config.name} backdrop="calm" help={{ topic: "fazer a minha inscrição", className: "bottom-28 sm:bottom-6" }}>
      <ClosingSoon closesAt={window.closesAt} label={formatTime(window.closesAt)} />
      <RegistrationFlow
        initialPath={params.ficha === "1" ? "ficha" : "choose"}
        today={todayInZone()}
        venue={event?.venue ? <VenueCompact venue={event.venue} /> : null}
        kitSupply={kitSupply}
      />
    </PublicShell>
  );
}
