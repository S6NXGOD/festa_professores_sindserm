import type { ActionResult } from "./action-result";

export const NETWORK_ERROR_MESSAGE = "Falha de comunicação com o servidor. Verifique a conexão e tente novamente.";

/**
 * Aguarda uma server action no navegador. Se a requisição nem chegar ao
 * servidor (rede instável, servidor reiniciando), a promise rejeita: aqui isso
 * vira um resultado de erro comum, para a tela nunca ficar presa em
 * "carregando" nem cair na página de erro.
 */
export async function callAction<T>(promise: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await promise;
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE, code: "NETWORK" };
  }
}
