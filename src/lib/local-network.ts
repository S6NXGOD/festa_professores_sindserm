import { networkInterfaces } from "node:os";

/**
 * Os endereços IPv4 desta máquina na rede local (ex.: 192.168.1.36). Rodando o
 * sistema no computador, é por eles que o celular (ou outro computador) na
 * mesma rede abre as telas — por exemplo, para testar a portaria.
 */
export function localNetworkAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry !== undefined && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry!.address);
}
