"use client";

import { Printer } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}
