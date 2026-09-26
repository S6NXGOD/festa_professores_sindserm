import { Whatsapp } from "@/components/icons/pixel";
import { formatPhone, whatsappLink } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * Conversa no WhatsApp com a pessoa, já com a mensagem escrita (a equipe revisa
 * antes de enviar). Sem número cadastrado, não aparece.
 */
export function WhatsAppButton({
  phone,
  name,
  message,
  label = "WhatsApp",
  compact = false,
  className,
  testId,
}: {
  phone: string | null | undefined;
  name: string;
  message: string;
  /** Texto do botão (ex.: o próprio número). */
  label?: string;
  /** Só o ícone (linhas de lista). */
  compact?: boolean;
  className?: string;
  testId?: string;
}) {
  if (!phone) return null;
  return (
    <a
      href={whatsappLink(phone, message)}
      target="_blank"
      rel="noopener noreferrer"
      title={`WhatsApp de ${name}: ${formatPhone(phone)}`}
      aria-label={`Conversar com ${name} no WhatsApp (${formatPhone(phone)})`}
      data-testid={testId}
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-2 border-success/60 bg-success/10 font-bold text-success-text transition-[background-color,border-color,transform] outline-none hover:border-success hover:bg-success/20 focus-visible:ring-[3px] focus-visible:ring-success/50 active:scale-95",
        compact ? "size-10" : "h-10 px-3 text-sm",
        className,
      )}
    >
      <Whatsapp className="size-5" />
      {compact ? null : label}
    </a>
  );
}
