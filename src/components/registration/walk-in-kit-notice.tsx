import { WalkInStamp } from "@/components/gate/walk-in-stamp";
import { Package } from "@/components/icons/pixel";

/**
 * Cadastro feito na hora (as inscrições já fecharam) com gordura: quem a equipe
 * cadastrar agora ganha o voucher amarelo e o kit sai da gordura.
 */
export function WalkInKitNotice({ free }: { free: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-[#ffd23f]/70 bg-[#ffd23f]/10 p-4" data-testid="walk-in-kit-notice">
      <WalkInStamp />
      <p className="mt-2 flex items-start gap-2 font-bold text-fg">
        <Package className="mt-0.5 size-5 shrink-0 text-[#ffd23f]" />
        As inscrições já fecharam: quem você cadastrar agora pega o kit da gordura.
      </p>
      <p className="mt-1 text-sm text-fg-muted">
        O voucher sai amarelo (inscrição na hora) para a mesa dos kits entregar da caixa certa. Gordura livre agora:{" "}
        <strong className="text-fg tabular">{free}</strong> {free === 1 ? "kit" : "kits"}.
      </p>
    </div>
  );
}
