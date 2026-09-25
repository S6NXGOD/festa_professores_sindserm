"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

import { Check, Close, Info, Loader, Warning } from "@/components/icons/pixel"

/** Avisos no estilo "mensagem de fliperama": fundo escuro, faixa colorida e ícone pixel. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      closeButton
      className="toaster group"
      icons={{
        success: <Check className="size-5 text-success-text" />,
        info: <Info className="size-5 text-fg" />,
        warning: <Warning className="size-5 text-warning" />,
        error: <Close className="size-5 text-danger" />,
        loading: <Loader className="size-5 animate-spin-steps" />,
      }}
      style={
        {
          "--normal-bg": "var(--surface-2)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--line-strong)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !gap-3 !border-2 !font-sans !text-[0.95rem] !shadow-[0_18px_40px_-16px_rgb(0_0_0/0.9)] data-[type=success]:!border-success/60 data-[type=error]:!border-danger/70 data-[type=warning]:!border-warning/70",
          title: "!font-semibold",
          description: "!text-fg-muted",
          closeButton: "!bg-surface-3 !border-line-strong !text-fg",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
