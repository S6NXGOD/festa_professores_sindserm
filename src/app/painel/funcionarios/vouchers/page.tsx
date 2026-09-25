import { redirect } from "next/navigation";

/** Endereço antigo da impressão dos vouchers da casa. */
export default function OldEmployeeVouchersPage() {
  redirect("/painel/colaboradores/vouchers");
}
