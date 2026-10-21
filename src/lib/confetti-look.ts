import type { Options } from "canvas-confetti";
import { EDITION } from "@/domain/edition";

/** As cores do verão: pôr do sol, sol, água da piscina, mar e espuma. */
const SUMMER_COLORS = ["#ff5233", "#ffd24a", "#1fd6c9", "#2e78ff", "#fff9f0", "#ff7ab6"];

/**
 * O visual do confete da festa: quadradinhos "pixelados" nas cores pedidas
 * (anos 80) ou bolinhas nas cores do verão (bolhas e gotas).
 */
export function confettiLook(colors: string[]): Pick<Options, "colors" | "shapes"> {
  return EDITION.theme === "verao" ? { colors: SUMMER_COLORS, shapes: ["circle"] } : { colors, shapes: ["square"] };
}
