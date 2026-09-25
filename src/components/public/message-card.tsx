import Link from "next/link";
import type { PixelIcon } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Cartão centralizado para estados vazios, erros e avisos em páginas públicas. */
export function MessageCard({
  icon: Icon,
  title,
  kicker,
  children,
  tone = "brand",
  action,
}: {
  icon: PixelIcon;
  title: string;
  kicker?: string;
  children?: React.ReactNode;
  tone?: "brand" | "danger" | "warning";
  action?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
      <Icon
        className={cn(
          "mx-auto size-12",
          tone === "brand" && "text-red",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      />
      {kicker ? <p className="pixel mt-5 text-[0.6rem] text-fg-muted">{kicker}</p> : null}
      <h1 className="display mt-2 text-4xl text-fg">{title}</h1>
      {children ? <div className="mt-3 text-fg-muted">{children}</div> : null}
      {action ? (
        <Button asChild variant="outline" className="mt-6">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
