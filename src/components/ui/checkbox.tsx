"use client"

import * as React from "react"
import { cn } from "cn"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { Check } from "@/components/icons/pixel"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-line-strong bg-surface-2 transition-[background-color,border-color,box-shadow] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-[#55555c] focus-visible:ring-[3px] focus-visible:ring-red/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger data-checked:border-red data-checked:bg-brand data-checked:text-white data-checked:shadow-[0_0_14px_-3px_var(--glow)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-4"
      >
        <Check />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
