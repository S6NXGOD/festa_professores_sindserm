import { describe, expect, it } from "vitest";
import { firstName, properName } from "@/lib/text";
import { estimateLines, VOUCHER_IMAGE, voucherImageLayout } from "@/lib/voucher-image-layout";

const base = {
  venue: "Clube do Marquês",
  hasHelp: true,
};

describe("imagem do voucher: tudo cabe na moldura", () => {
  it("nome e textos curtos: emblema e QR no tamanho cheio", () => {
    const layout = voucherImageLayout({
      ...base,
      fullName: "Ana Lima",
      subtitle: "Professor(a) filiado(a)",
      kitLine: "1 kit de consumação",
      statusLine: null,
    });
    expect(layout.nameSize).toBe(96);
    expect(layout.emblemHeight).toBe(VOUCHER_IMAGE.emblem.height);
    expect(layout.qrSize).toBe(VOUCHER_IMAGE.qr.size);
    expect(layout.contentHeight).toBeLessThanOrEqual(layout.available);
  });

  it("os dois vouchers do print (nomes longos + aviso de filiação): o emblema encolhe e a faixa do kit não é espremida", () => {
    const member = voucherImageLayout({
      ...base,
      fullName: "PAOLA FRANCINETTE RODRIGUES DE SOUSA SANTOS",
      subtitle: "Professor(a) filiado(a)",
      kitLine: `2 kits de consumação: o seu e o de ${firstName("GABRIEL ARCANJO DOS SANTOS SOBRINHO")}`,
      statusLine: "Aguardando o SINDSERM confirmar a filiação",
    });
    const guest = voucherImageLayout({
      ...base,
      fullName: "GABRIEL ARCANJO DOS SANTOS SOBRINHO",
      subtitle: `Convidado(a) de ${properName("Paola Francinette Rodrigues de Sousa Santos")}`,
      kitLine: `1 kit de consumação, depois que ${firstName("Paola Francinette Rodrigues de Sousa Santos")} chegar`,
      statusLine: null,
    });
    for (const layout of [member, guest]) {
      expect(layout.contentHeight).toBeLessThanOrEqual(layout.available);
      expect(layout.qrSize).toBeGreaterThanOrEqual(VOUCHER_IMAGE.qr.minSize);
    }
    // Com o primeiro nome, a faixa do kit volta a caber numa linha só.
    expect(estimateLines("2 kits de consumação: o seu e o de Gabriel", 30, 790, 0.53)).toBe(1);
    expect(estimateLines("1 kit de consumação, depois que Paola chegar", 30, 790, 0.53)).toBe(1);
  });

  it("pior caso (nome de 120 letras e quem convidou também): fonte menor, emblema e QR menores, mas cabe", () => {
    const huge = "Maria Aparecida Francinette Conceição Rodrigues de Sousa Santos Albuquerque Cavalcanti Nascimento Oliveira Pereira Lima";
    expect(huge.length).toBeGreaterThan(110);
    const layout = voucherImageLayout({
      ...base,
      fullName: huge,
      subtitle: `Convidado(a) de ${huge}`,
      kitLine: "1 kit de consumação, depois que Maria chegar",
      statusLine: "Aguardando o SINDSERM confirmar a filiação",
    });
    expect(layout.nameSize).toBeLessThan(66);
    expect(layout.contentHeight).toBeLessThanOrEqual(layout.available);
    expect(layout.emblemWidth / layout.emblemHeight).toBeCloseTo(VOUCHER_IMAGE.emblem.width / VOUCHER_IMAGE.emblem.height, 1);
  });
});

describe("nomes no meio das frases", () => {
  it("nome todo em maiúsculas (ou minúsculas) vira Nome Próprio; o resto fica como veio", () => {
    expect(properName("GABRIEL ARCANJO DOS SANTOS SOBRINHO")).toBe("Gabriel Arcanjo dos Santos Sobrinho");
    expect(properName("maria das dores e silva")).toBe("Maria das Dores e Silva");
    expect(properName("ANA-CLARA  D'ÁVILA")).toBe("Ana-Clara D'Ávila");
    expect(properName("Paola McDonald de Sousa")).toBe("Paola McDonald de Sousa");
    expect(firstName("  GABRIEL ARCANJO")).toBe("Gabriel");
    expect(firstName("Luiza Souza Lima")).toBe("Luiza");
  });
});
