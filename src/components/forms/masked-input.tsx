"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { maskCpfInput } from "@/lib/cpf";
import { maskPhoneInput } from "@/lib/phone";

type InputProps = Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onChange?: (value: string) => void;
};

/** Campo de CPF com máscara progressiva e teclado numérico no celular. */
export function CpfInput({ value = "", onChange, ...props }: InputProps) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      placeholder="000.000.000-00"
      maxLength={14}
      {...props}
      value={maskCpfInput(value)}
      onChange={(event) => onChange?.(maskCpfInput(event.target.value))}
    />
  );
}

export function PhoneInput({ value = "", onChange, ...props }: InputProps) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="(00) 00000-0000"
      maxLength={16}
      {...props}
      value={maskPhoneInput(value)}
      onChange={(event) => onChange?.(maskPhoneInput(event.target.value))}
    />
  );
}
