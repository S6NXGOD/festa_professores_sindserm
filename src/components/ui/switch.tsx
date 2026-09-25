"use client"

import * as React from "react"
import { cn } from "cn"
import { Switch as SwitchPrimitive } from "radix-ui"

/** Chave no estilo de aparelho de som: trilho escuro e LED vermelho quando ligada. */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-7 w-12 shrink-0 items-center rounded-md border-2 border-line-strong bg-ink p-0.5 transition-[border-color,box-shadow] outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-[3px] focus-visible:ring-red/50 data-checked:border-red data-checked:shadow-[0_0_14px_-4px_var(--glow)] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-[5px] bg-surface-3 shadow-[inset_0_-2px_0_rgb(0_0_0/0.4)] transition-transform data-checked:translate-x-5 data-checked:bg-red data-checked:shadow-[0_0_10px_var(--glow)]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
