import { describe, expect, it } from "vitest";
import { personWhatsappMessage, registrationWhatsappMessage } from "@/domain/whatsapp-messages";
import { samePhone, whatsappLink } from "@/lib/phone";

const eventName = "Festa das Professoras e Professores – SINDSERMTHE 2026";

describe("WhatsApp de quem se inscreveu", () => {
  it("mensagem pronta pelo primeiro nome e pela situação da inscrição", () => {
    const pending = registrationWhatsappMessage({ fullName: "  Maria  das Dores Souza", status: "PENDING", eventName });
    expect(pending).toMatch(/^Olá, Maria! Aqui é da organização da Festa das Professoras e Professores – SINDSERMTHE 2026\./);
    expect(pending).toContain("conferindo a sua filiação");
    expect(registrationWhatsappMessage({ fullName: "Ana Lima", status: "AWAITING_SIGNATURE", eventName })).toContain("assinar na recepção");
    expect(registrationWhatsappMessage({ fullName: "Ana Lima", status: "REJECTED", eventName })).toContain("contracheque");
    expect(registrationWhatsappMessage({ fullName: "Ana Lima", status: "CONFIRMED", eventName })).toContain("confirmada");
    expect(registrationWhatsappMessage({ fullName: "Ana Lima", status: "JOINED_AT_EVENT", eventName })).toContain("confirmada");
    expect(personWhatsappMessage({ fullName: "Rosa Dias", eventName })).toBe(`Olá, Rosa! Aqui é da organização da ${eventName}.`);
  });

  it("link abre a conversa com o número em formato internacional e o texto codificado", () => {
    const link = whatsappLink("(86) 99876-5432", "Olá, Ana! Até a festa & obrigado?");
    expect(link.startsWith("https://wa.me/5586998765432?text=")).toBe(true);
    expect(decodeURIComponent(link.split("?text=")[1]!)).toBe("Olá, Ana! Até a festa & obrigado?");
  });
});

describe("mesmo WhatsApp (recuperar vouchers)", () => {
  it("aceita máscara, +55 e o celular com ou sem o 9; recusa número diferente ou vazio", () => {
    expect(samePhone("(86) 99999-8888", "86999998888")).toBe(true);
    expect(samePhone("(86) 99999-8888", "86 9999-8888")).toBe(true);
    expect(samePhone("+55 86 99999-8888", "(86) 9999-8888")).toBe(true);
    expect(samePhone("(86) 99999-8888", "(85) 99999-8888")).toBe(false);
    expect(samePhone("(86) 99999-8888", "(86) 99999-8889")).toBe(false);
    expect(samePhone(null, "86999998888")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });
});
