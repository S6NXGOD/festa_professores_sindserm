import { Zap } from "@/components/icons/pixel";
import { cn } from "@/lib/utils";

/**
 * Selo "Inscrição na hora": quem se inscreveu depois que as inscrições fecharam
 * pega o kit da gordura (estoque separado do oficial). O mesmo selo aparece no
 * voucher, na portaria e na mesa dos kits, para ninguém confundir a caixa.
 */
export function WalkInStamp({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "pixel inline-flex -rotate-2 items-center gap-1.5 rounded-[4px] border-2 border-[#1a1033] bg-[#ffd23f] text-[#1a1033] shadow-[2px_2px_0_0_#1a1033]",
        size === "lg" ? "px-2.5 py-1.5 text-[0.62rem]" : "px-1.5 py-1 text-[0.5rem]",
        className,
      )}
      data-testid="walk-in-stamp"
    >
      <Zap className={size === "lg" ? "size-4" : "size-3"} />
      Inscrição na hora
    </span>
  );
}
