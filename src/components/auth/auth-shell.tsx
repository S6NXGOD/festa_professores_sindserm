import { BrandLockup, FestaEmblem } from "@/components/brand/brand";
import { RetroBackdrop } from "@/components/retro/retro-backdrop";
import { DEFAULT_EVENT_NAME } from "@/domain/labels";
import { cn } from "@/lib/utils";

/** Moldura das telas de login, primeiro acesso e conta. */
export function AuthShell({
  title,
  kicker = "Área da equipe",
  subtitle,
  children,
  wide = false,
  eventName = DEFAULT_EVENT_NAME,
}: {
  title: string;
  kicker?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  eventName?: string;
}) {
  return (
    <main className="relative flex min-h-dvh items-start justify-center overflow-x-clip px-4 py-8 sm:items-center">
      <RetroBackdrop variant="calm" />
      <div className={cn("relative z-10 w-full", wide ? "max-w-3xl" : "max-w-md")}>
        {wide ? (
          <BrandLockup name={eventName} kicker="SINDSERM" className="mb-6" />
        ) : (
          <FestaEmblem className="mx-auto mb-2 w-64" sizes="256px" eager />
        )}
        <div className="rounded-2xl border border-line-strong bg-surface/95 p-6 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.95),0_0_40px_-28px_var(--glow)] backdrop-blur sm:p-8">
          <p className="pixel text-[0.55rem] text-red">{kicker}</p>
          <h1 className="display mt-2 text-4xl text-fg">{title}</h1>
          {subtitle ? <div className="mt-2 text-sm text-fg-muted">{subtitle}</div> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
