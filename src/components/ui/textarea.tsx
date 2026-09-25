import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full resize-none rounded-lg border-2 border-input bg-surface-2 px-3.5 py-3 text-base text-fg transition-[border-color,box-shadow] outline-none placeholder:text-fg-dim hover:border-[#4a4a51] focus-visible:border-red focus-visible:shadow-[0_0_0_3px_rgb(255_38_38/0.18),0_0_22px_-8px_var(--glow)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
