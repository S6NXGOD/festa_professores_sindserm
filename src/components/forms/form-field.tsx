import { Warning } from "@/components/icons/pixel";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** Campo com rótulo, descrição e mensagem de erro acessível. */
export function FormField({
  id,
  label,
  description,
  error,
  children,
  className,
  optional,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <Field data-invalid={error ? true : undefined} className={cn("gap-2", className)}>
      <FieldLabel htmlFor={id} className="text-[0.78rem] font-bold tracking-[0.08em] text-fg-muted uppercase">
        {label}
        {optional ? <span className="font-medium tracking-normal text-fg-dim normal-case">(opcional)</span> : null}
      </FieldLabel>
      {children}
      {description && !error ? <FieldDescription className="text-xs text-fg-dim">{description}</FieldDescription> : null}
      {error ? (
        <FieldError id={`${id}-error`} className="flex items-center gap-1.5 text-xs font-semibold text-danger">
          <Warning className="size-3.5" />
          {error}
        </FieldError>
      ) : null}
    </Field>
  );
}
