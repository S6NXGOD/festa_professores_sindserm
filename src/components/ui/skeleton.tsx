import { cn } from "cn"

/** Carregando: bloco escuro com uma faixa de luz passando, como um VHS rebobinando. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-xl bg-surface-2 after:absolute after:inset-0 after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/6 after:to-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
