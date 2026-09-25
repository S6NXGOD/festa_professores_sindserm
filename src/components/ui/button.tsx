import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/**
 * Botões no estilo fliperama: caixa-alta condensada, borda inferior "física"
 * que afunda ao tocar (variantes principais) e brilho neon no foco.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-transparent font-display text-[0.95rem] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase [font-stretch:75%] outline-none select-none focus-visible:ring-[3px] focus-visible:ring-red/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  {
    variants: {
      variant: {
        default: "arcade bg-brand text-brand-foreground",
        success: "arcade bg-success text-success-foreground [--arcade-edge:#0f6b33] [--glow:rgb(34_197_94/0.45)]",
        light: "arcade bg-fg text-ink [--arcade-edge:#8b8781] [--glow:rgb(255_255_255/0.3)]",
        outline:
          "border-line-strong bg-ink/40 text-fg transition-[border-color,box-shadow,color] hover:border-red hover:text-white hover:shadow-[0_0_20px_-6px_var(--glow)] aria-expanded:border-red",
        secondary:
          "bg-surface-3 text-fg shadow-[0_4px_0_0_#050505] transition-[transform,box-shadow,background-color] hover:bg-[#2b2b2f] active:translate-y-[3px] active:shadow-[0_1px_0_0_#050505]",
        ghost: "text-fg-muted transition-colors hover:bg-white/6 hover:text-fg aria-expanded:bg-white/6 aria-expanded:text-fg",
        destructive:
          "border-danger/55 bg-danger-soft text-danger transition-[background-color,box-shadow] hover:bg-danger/20 hover:shadow-[0_0_20px_-6px_rgb(255_59_59/0.6)]",
        link: "border-0 px-0 font-sans font-semibold tracking-normal normal-case [font-stretch:100%] text-red underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        xs: "h-7 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3 text-sm",
        lg: "h-12 px-5 text-base",
        xl: "h-16 gap-3 rounded-xl px-6 text-xl [&_svg:not([class*='size-'])]:size-6",
        icon: "size-11",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
