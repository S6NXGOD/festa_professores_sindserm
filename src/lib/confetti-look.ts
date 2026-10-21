import type { Options } from "canvas-confetti";
import { EDITION } from "@/domain/edition";

/** As cores da logo do verão: vermelho e laranja do pôr do sol, amarelo do sol, ciano da piscina e o creme das letras. */
const SUMMER_COLORS = ["#f23c1c", "#ff8a1f", "#ffd23a", "#1cb8f2", "#fff1d6"];

/**
 * O visual do confete da festa: quadradinhos "pixelados" nas cores pedidas
 * (anos 80) ou bolinhas nas cores do verão (bolhas e gotas).
 */
export function confettiLook(colors: string[]): Pick<Options, "colors" | "shapes"> {
  return EDITION.theme === "verao" ? { colors: SUMMER_COLORS, shapes: ["circle"] } : { colors, shapes: ["square"] };
}
