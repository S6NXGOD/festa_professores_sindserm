import Image from "next/image";
import { SiteIconMark } from "@/components/brand/site-icon";
import { splitEventName } from "@/lib/text";
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

/**
 * Marca de cabeçalho: ícone do site + nome da festa em caixa-alta condensada.
 * Com travessão no nome ("Festa ... – SINDSERMTHE 2026"), a parte depois dele
 * vira a chamada em cima do título, no lugar do `kicker`.
 */
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
  const { title, tagline } = splitEventName(name);
  const label = tagline ?? kicker;
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <SiteIconMark />
      <span className="min-w-0">
        {label ? <span className="pixel block truncate text-[0.5rem] text-red">{label}</span> : null}
        <span className={cn("display block text-lg leading-none text-fg", wrap ? "line-clamp-2" : "truncate")}>{title}</span>
      </span>
    </span>
  );
}
