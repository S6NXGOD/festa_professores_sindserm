/** Leva a tela ao topo (onde aparece o resultado), respeitando "reduzir movimento". */
export function scrollToTop(container?: HTMLElement | null) {
  const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  (container ?? window).scrollTo({ top: 0, behavior });
}
