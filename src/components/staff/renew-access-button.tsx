"use client";

import { useState } from "react";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { Link } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopyLinkBox } from "@/components/voucher/copy-link-box";
import { callAction } from "@/lib/call-action";
import { renewAccessAction } from "@/server/actions/operations";

/** Gera um novo link de vouchers do grupo (o anterior deixa de funcionar). */
export function RenewAccessButton({ registrationId }: { registrationId: string }) {
  const [token, setToken] = useState<string | null>(null);

  return (
    <>
      <ConfirmActionDialog
        trigger={
          <Button variant="outline">
            <Link /> Novo link de vouchers
          </Button>
        }
        title="Gerar novo link de vouchers?"
        description="O link anterior do filiado deixa de funcionar. Os QR Codes continuam os mesmos."
        confirmLabel="Gerar link"
        onConfirm={async () => {
          const result = await callAction(renewAccessAction(registrationId));
          if (result.ok) setToken(result.data.accessToken);
          return result;
        }}
      />
      <Dialog open={Boolean(token)} onOpenChange={(open) => !open && setToken(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link de vouchers do grupo</DialogTitle>
            <DialogDescription>Envie ao(à) professor(a). O link mostra todos os vouchers do grupo e só é exibido agora.</DialogDescription>
          </DialogHeader>
          {token ? <CopyLinkBox path={`/vouchers/${token}`} label="Novo link" /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
