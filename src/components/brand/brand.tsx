import Image from "next/image";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** Emblema da festa (recorte do cartaz). Fundo preto igual ao do site. */
export function FestaEmblem({
  className,
  eager = false,
  sizes = "(max-width: 640px) 92vw, 560px",
}: {
  className?: string;
  eager?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src="/brand/festa-emblema.webp"
      alt="Festa dos/as professores/as — A luta não sai de moda — Nos embalos de sexta à noite"
      width={904}
      height={776}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      className={cn(
        // Fundo preto do cartaz "some" sobre qualquer fundo escuro (mistura de tela).
        // No papel branco a mistura "screen" apagaria a imagem: na impressão, mistura normal.
        "h-auto w-full select-none mix-blend-screen print:mx-auto print:w-[58%] print:mix-blend-normal [mask-image:radial-gradient(ellipse_72%_70%_at_50%_50%,#000_62%,transparent_100%)]",
        className,
      )}
      draggable={false}
    />
  );
}

/** Logo do SINDSERM (versão branca para fundos escuros; colorida para impressão). */
export function UnionLogo({
  variant = "white",
  className,
  sizes = "(max-width: 640px) 70vw, 320px",
  eager = false,
  fetchPriority = "auto",
}: {
  variant?: "white" | "color";
  className?: string;
  sizes?: string;
  /** Logo no topo da página: carrega junto com o conteúdo principal. */
  eager?: boolean;
  fetchPriority?: "high" | "low" | "auto";
}) {
  return (
    <Image
      src={variant === "white" ? "/brand/sindserm-branca.png" : "/brand/sindserm.png"}
      alt="SINDSERMTHE — Sindicato dos Servidores Públicos Municipais de Teresina"
      width={700}
      height={200}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={fetchPriority}
      className={cn("h-auto w-full select-none", className)}
      draggable={false}
    />
  );
}

/** Sol listrado (marca compacta para cabeçalhos e ícones). */
export function SunMark({ className }: { className?: string }) {
  // Id único por marca: com duas na página (ex.: uma escondida no celular), um id
  // repetido faz a visível usar o degradê da escondida e o sol some.
  const gradient = `sunmark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 32" aria-hidden className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6a3d" />
          <stop offset="0.5" stopColor="#ff2626" />
          <stop offset="1" stopColor="#a8000c" />
        </linearGradient>
      </defs>
      <path d="M8 24a16 16 0 0 1 32 0Z" fill={`url(#${gradient})`} />
      <rect x="6" y="14" width="36" height="1.6" fill="#080808" />
      <rect x="6" y="17.5" width="36" height="2" fill="#080808" />
      <rect x="6" y="21" width="36" height="2.4" fill="#080808" />
      <rect x="2" y="25" width="44" height="1.6" fill="#ff2626" />
      <rect x="8" y="29" width="32" height="1.2" fill="#ff2626" opacity="0.6" />
    </svg>
  );
}

/** Marca de cabeçalho: sol + nome do evento em caixa-alta condensada. */
export function BrandLockup({
  name,
  kicker,
  className,
  wrap = false,
}: {
  name: string;
  kicker?: string;
  className?: string;
  /** Nome em até duas linhas (barra lateral), em vez de cortar com reticências. */
  wrap?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <SunMark className="h-8 w-12" />
      <span className="min-w-0">
        {kicker ? <span className="pixel block text-[0.5rem] text-red">{kicker}</span> : null}
        <span className={cn("display block text-lg leading-none text-fg", wrap ? "line-clamp-2" : "truncate")}>{name}</span>
      </span>
    </span>
  );
}
