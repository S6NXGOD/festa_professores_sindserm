/** Vibração curta de feedback (só após interação do usuário, exigência dos navegadores). */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // sem suporte
  }
}
