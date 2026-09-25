import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-lg border-2 border-input bg-surface-2 px-3.5 py-1 text-base text-fg transition-[border-color,box-shadow] outline-none placeholder:text-fg-dim file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground hover:border-[#4a4a51] focus-visible:border-red focus-visible:shadow-[0_0_0_3px_rgb(255_38_38/0.18),0_0_22px_-8px_var(--glow)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:shadow-[0_0_0_3px_rgb(255_59_59/0.18)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
