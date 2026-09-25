import { Star } from "@/components/icons/pixel";
import { cn } from "@/lib/utils";

/** Letreiro corrido (como os painéis de LED das casas de show dos anos 80). */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const content = (
    <>
      {items.map((item, index) => (
        <span key={index} className="flex shrink-0 items-center gap-6 pr-6">
          <span>{item}</span>
          <Star className="size-3.5 text-red" />
        </span>
      ))}
    </>
  );
  return (
    <div
      className={cn(
        "relative overflow-hidden border-y border-red/40 bg-ink/90 py-2 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]",
        className,
      )}
    >
      <div className="pixel flex w-max animate-marquee text-[0.62rem] text-fg motion-reduce:animate-none" aria-hidden>
        <div className="flex">{content}</div>
        <div className="flex">{content}</div>
      </div>
      <span className="sr-only">{items.join(" · ")}</span>
    </div>
  );
}
