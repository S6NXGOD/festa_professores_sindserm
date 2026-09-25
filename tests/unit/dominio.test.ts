import { describe, expect, it } from "vitest";
import { ROLE_PRESETS } from "@/domain/access";
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from "@/lib/cpf";
import { formatPhone, isValidPhone, normalizePhone } from "@/lib/phone";
import { utcToZonedLocalInput, zonedLocalToUtc } from "@/lib/datetime";
import { iconSizeFor, siteIconUrl } from "@/lib/site-icon";
import { splitEventName, toSearchText } from "@/lib/text";
import { authorizationText, nextMonthValue } from "@/domain/affiliation-text";
import { isKitDeadlinePassed, kitDeadlineAt } from "@/domain/kit-deadline";
import {
  can,
  canHaveGuest,
  decideEntry,
  employeeKitAvailability,
  guestRemovalCheck,
  isLowEmployeeStock,
  kitAvailability,
  poolsForMode,
  stockPoolFor,
} from "@/domain/rules";
import { eventSettingsSchema, guestInputSchema, guestNameClash, registrationNumberKey } from "@/domain/schemas";
import type { CheckInInfo, DeliveryInfo } from "@/domain/types";
import {
  decryptSecret,
  encryptSecret,
  generateToken,
  generateVoucherCode,
  normalizeVoucherCode,
  parseQrPayload,
  qrPayloadFor,
} from "@/server/crypto";

const checkIn: CheckInInfo = {
  id: "c1",
  checkedInAt: new Date("2026-10-15T22:00:00Z"),
  checkedInByName: "Operador",
  method: "QR",
  role: "MEMBER",
};
const delivery: DeliveryInfo = {
  id: "d1",
  kitType: "MEMBER",
  deliveredAt: new Date(),
  deliveredByName: "Operador",
  beneficiaryPersonId: "p1",
  beneficiaryName: "Fulano",
};

describe("CPF", () => {
  it("normaliza e valida dígitos verificadores", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata e mascara", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(maskCpf("52998224725")).toBe("***.982.247-**");
  });
});

describe("Matrícula", () => {
  it("compara sem pontuação e sem diferenciar maiúsculas", () => {
    expect(registrationNumberKey("12.345-6")).toBe("123456");
    expect(registrationNumberKey("ab-12 3")).toBe("AB123");
    expect(registrationNumberKey(" - ")).toBeNull();
  });
});

describe("Telefone", () => {
  it("aceita DDD + número e remove +55", () => {
    expect(normalizePhone("+55 (86) 99999-8888")).toBe("86999998888");
    expect(isValidPhone("(86) 99999-8888")).toBe(true);
    expect(isValidPhone("(86) 3222-1111")).toBe(true);
    expect(isValidPhone("(86) 89999-8888")).toBe(false);
    expect(formatPhone("86999998888")).toBe("(86) 99999-8888");
  });
});

describe("Datas no fuso do evento", () => {
  it("converte horário local de São Paulo para UTC e de volta", () => {
    const utc = zonedLocalToUtc("2026-10-15T19:00", "America/Sao_Paulo");
    expect(utc?.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(utcToZonedLocalInput(utc!, "America/Sao_Paulo")).toBe("2026-10-15T19:00");
  });
  it("busca por nome ignora acentos e caixa", () => {
    expect(toSearchText("  JOSÉ  da   Conceição ")).toBe("jose da conceicao");
  });
});

describe("Horário limite dos kits", () => {
  it("usa o dia da festa e passa para a madrugada seguinte quando é antes do início", () => {
    const base = { eventDate: "2026-10-15", startTime: "19:00:00" };
    expect(kitDeadlineAt({ ...base, kitDeadlineTime: "23:30:00" })?.toISOString()).toBe("2026-10-16T02:30:00.000Z");
    expect(kitDeadlineAt({ ...base, kitDeadlineTime: "01:00" })?.toISOString()).toBe("2026-10-16T04:00:00.000Z");
    expect(kitDeadlineAt({ ...base, kitDeadlineTime: null })).toBeNull();
    expect(isKitDeadlinePassed({ ...base, kitDeadlineTime: "23:30" }, new Date("2026-10-16T02:29:59Z"))).toBe(false);
    expect(isKitDeadlinePassed({ ...base, kitDeadlineTime: "23:30" }, new Date("2026-10-16T02:30:00Z"))).toBe(true);
  });
  it("recusa horário antes do início que não seja madrugada", () => {
    const event = {
      name: "Festa",
      description: "",
      eventDate: "2026-10-15",
      startTime: "19:00",
      endTime: "",
      registrationOpensAt: "2026-09-01T08:00",
      registrationClosesAt: "2026-10-14T23:59",
    };
    expect(eventSettingsSchema.safeParse({ ...event, kitDeadlineTime: "18:00" }).success).toBe(false);
    expect(eventSettingsSchema.safeParse({ ...event, kitDeadlineTime: "02:00" }).success).toBe(true);
    expect(eventSettingsSchema.safeParse({ ...event, kitDeadlineTime: "" }).success).toBe(true);
  });
});

describe("Regras de entrada", () => {
  it("filiado válido entra; pendente, sem assinatura e rejeitado não", () => {
    expect(decideEntry({ checkIn: null, ownStatus: "CONFIRMED", hostStatus: null })).toEqual({ kind: "ALLOWED", role: "MEMBER" });
    expect(decideEntry({ checkIn: null, ownStatus: "JOINED_AT_EVENT", hostStatus: null }).kind).toBe("ALLOWED");
    expect(decideEntry({ checkIn: null, ownStatus: "PENDING", hostStatus: null })).toEqual({ kind: "BLOCKED", code: "MEMBER_PENDING" });
    expect(decideEntry({ checkIn: null, ownStatus: "AWAITING_SIGNATURE", hostStatus: null })).toEqual({
      kind: "BLOCKED",
      code: "MEMBER_AWAITING_SIGNATURE",
    });
    expect(decideEntry({ checkIn: null, ownStatus: "REJECTED", hostStatus: null })).toEqual({ kind: "BLOCKED", code: "MEMBER_REJECTED" });
  });
  it("convidado depende do responsável; rejeitado pode entrar como convidado", () => {
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: "CONFIRMED" })).toEqual({ kind: "ALLOWED", role: "GUEST" });
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: "PENDING" })).toEqual({ kind: "BLOCKED", code: "HOST_PENDING" });
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: "AWAITING_SIGNATURE" })).toEqual({
      kind: "BLOCKED",
      code: "HOST_PENDING",
    });
    expect(decideEntry({ checkIn: null, ownStatus: "REJECTED", hostStatus: "CONFIRMED" })).toEqual({ kind: "ALLOWED", role: "GUEST" });
  });
  it("entrada já registrada tem prioridade", () => {
    expect(decideEntry({ checkIn, ownStatus: "CONFIRMED", hostStatus: null }).kind).toBe("ALREADY_IN");
    expect(decideEntry({ checkIn, ownStatus: null, hostStatus: null, employee: { active: true } }).kind).toBe("ALREADY_IN");
  });
  it("funcionário(a) do SINDSERM entra pelo voucher dele(a); tirado(a) da lista, não", () => {
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: null, employee: { active: true } })).toEqual({
      kind: "ALLOWED",
      role: "EMPLOYEE",
    });
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: null, employee: { active: false } })).toEqual({
      kind: "BLOCKED",
      code: "EMPLOYEE_REMOVED",
    });
    // Tirado(a) da lista, mas convidado(a) de um(a) professor(a) confirmado(a): entra como convidado(a).
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: "CONFIRMED", employee: { active: false } })).toEqual({
      kind: "ALLOWED",
      role: "GUEST",
    });
  });
  it("convidado(a) de funcionário(a) entra enquanto o(a) funcionário(a) estiver na lista", () => {
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: null, employeeHost: { active: true } })).toEqual({
      kind: "ALLOWED",
      role: "GUEST",
    });
    expect(decideEntry({ checkIn: null, ownStatus: null, hostStatus: null, employeeHost: { active: false } })).toEqual({
      kind: "BLOCKED",
      code: "HOST_EMPLOYEE_REMOVED",
    });
    // Filiação própria válida prevalece.
    expect(decideEntry({ checkIn: null, ownStatus: "CONFIRMED", hostStatus: null, employeeHost: { active: true } })).toEqual({
      kind: "ALLOWED",
      role: "MEMBER",
    });
  });
});

describe("Regras de kits e convidado", () => {
  const base = {
    status: "CONFIRMED" as const,
    isTeacher: true,
    memberCheckedIn: true,
    hasGuest: true,
    guestCheckedIn: true,
    deliveries: {},
    deadlinePassed: false,
  };
  it("exige professor(a) com filiação válida, entrada, convidado e prazo", () => {
    expect(kitAvailability(base, "MEMBER")).toEqual({ kind: "AVAILABLE" });
    expect(kitAvailability({ ...base, status: "PENDING" }, "MEMBER")).toEqual({ kind: "BLOCKED", code: "NOT_ACTIVE_MEMBER" });
    expect(kitAvailability({ ...base, isTeacher: false }, "MEMBER")).toEqual({ kind: "BLOCKED", code: "NOT_TEACHER" });
    expect(kitAvailability({ ...base, deadlinePassed: true }, "MEMBER")).toEqual({ kind: "BLOCKED", code: "DEADLINE_PASSED" });
    // O kit do(a) professor(a) sai na entrada dele(a)...
    expect(kitAvailability({ ...base, memberCheckedIn: false }, "MEMBER")).toEqual({ kind: "BLOCKED", code: "MEMBER_NOT_CHECKED_IN" });
    // ...e o do convidado só depois que o(a) professor(a) que convidou chegou.
    expect(kitAvailability({ ...base, memberCheckedIn: false }, "GUEST")).toEqual({ kind: "BLOCKED", code: "HOST_NOT_CHECKED_IN" });
    expect(kitAvailability({ ...base, memberCheckedIn: false, guestCheckedIn: false }, "GUEST")).toEqual({
      kind: "BLOCKED",
      code: "HOST_NOT_CHECKED_IN",
    });
    // Quem já recebeu kit como convidado(a) e depois se filiou não leva um segundo.
    expect(kitAvailability({ ...base, memberReceivedGuestKit: true }, "MEMBER")).toEqual({ kind: "BLOCKED", code: "MEMBER_GOT_GUEST_KIT" });
    expect(kitAvailability({ ...base, hasGuest: false }, "GUEST")).toEqual({ kind: "BLOCKED", code: "NO_GUEST" });
    // O kit do convidado só sai depois que o convidado entrou; o do(a) professor(a) não depende disso.
    expect(kitAvailability({ ...base, guestCheckedIn: false }, "GUEST")).toEqual({ kind: "BLOCKED", code: "GUEST_NOT_CHECKED_IN" });
    expect(kitAvailability({ ...base, guestCheckedIn: false }, "MEMBER")).toEqual({ kind: "AVAILABLE" });
    expect(kitAvailability({ ...base, deliveries: { MEMBER: delivery } }, "MEMBER").kind).toBe("DELIVERED");
    // Entrega já feita continua aparecendo mesmo depois do prazo.
    expect(kitAvailability({ ...base, deadlinePassed: true, deliveries: { MEMBER: delivery } }, "MEMBER").kind).toBe("DELIVERED");
  });
  it("convidado só para professor(a) com filiação não rejeitada", () => {
    expect(canHaveGuest({ status: "PENDING", isTeacher: true })).toBe(true);
    expect(canHaveGuest({ status: "AWAITING_SIGNATURE", isTeacher: true })).toBe(true);
    expect(canHaveGuest({ status: "CONFIRMED", isTeacher: false })).toBe(false);
    expect(canHaveGuest({ status: "REJECTED", isTeacher: true })).toBe(false);
  });
  it("convidado não pode ser trocado depois de entrar ou de o kit dele sair", () => {
    expect(guestRemovalCheck({ guestCheckedIn: false, guestKitDeliveredForGuest: false })).toEqual({ ok: true });
    expect(guestRemovalCheck({ guestCheckedIn: true, guestKitDeliveredForGuest: false })).toEqual({ ok: false, code: "GUEST_CHECKED_IN" });
    expect(guestRemovalCheck({ guestCheckedIn: false, guestKitDeliveredForGuest: true })).toEqual({ ok: false, code: "GUEST_KIT_DELIVERED" });
  });
  it("pool de estoque conforme o modo; o grupo do funcionário usa o estoque dos funcionários nos dois modos", () => {
    expect(stockPoolFor("SINGLE", "GUEST")).toBe("ALL");
    expect(stockPoolFor("SPLIT", "GUEST")).toBe("GUEST");
    expect(stockPoolFor("SINGLE", "EMPLOYEE")).toBe("EMPLOYEE");
    expect(stockPoolFor("SPLIT", "EMPLOYEE")).toBe("EMPLOYEE");
    // O kit do convidado de um(a) funcionário(a) também sai do estoque dos funcionários.
    expect(stockPoolFor("SINGLE", "GUEST", true)).toBe("EMPLOYEE");
    expect(stockPoolFor("SPLIT", "GUEST", true)).toBe("EMPLOYEE");
    expect(poolsForMode("SINGLE")).toEqual(["ALL", "EMPLOYEE"]);
    expect(poolsForMode("SPLIT")).toEqual(["MEMBER", "GUEST", "EMPLOYEE"]);
  });
  it("kits do funcionário: o dele na entrada; o do convidado quando os dois chegaram", () => {
    const group = {
      active: true,
      employeeCheckedIn: true,
      hasGuest: true,
      guestCheckedIn: true,
      deliveries: {},
      deadlinePassed: false,
    };
    expect(employeeKitAvailability(group, "EMPLOYEE")).toEqual({ kind: "AVAILABLE" });
    expect(employeeKitAvailability(group, "GUEST")).toEqual({ kind: "AVAILABLE" });
    expect(employeeKitAvailability({ ...group, active: false }, "EMPLOYEE")).toEqual({ kind: "BLOCKED", code: "EMPLOYEE_REMOVED" });
    expect(employeeKitAvailability({ ...group, employeeCheckedIn: false }, "EMPLOYEE")).toEqual({
      kind: "BLOCKED",
      code: "EMPLOYEE_NOT_CHECKED_IN",
    });
    // O kit do convidado espera o(a) funcionário(a) chegar (igual ao convidado de professor(a)).
    expect(employeeKitAvailability({ ...group, employeeCheckedIn: false }, "GUEST")).toEqual({ kind: "BLOCKED", code: "HOST_NOT_CHECKED_IN" });
    expect(employeeKitAvailability({ ...group, guestCheckedIn: false }, "GUEST")).toEqual({ kind: "BLOCKED", code: "GUEST_NOT_CHECKED_IN" });
    expect(employeeKitAvailability({ ...group, hasGuest: false }, "GUEST")).toEqual({ kind: "BLOCKED", code: "NO_GUEST" });
    expect(employeeKitAvailability({ ...group, deadlinePassed: true }, "EMPLOYEE")).toEqual({ kind: "BLOCKED", code: "DEADLINE_PASSED" });
    expect(employeeKitAvailability({ ...group, deadlinePassed: true, deliveries: { EMPLOYEE: delivery } }, "EMPLOYEE").kind).toBe("DELIVERED");
  });
  it("alerta do estoque dos funcionários: falta kit para quem ainda vai receber", () => {
    expect(isLowEmployeeStock(4, 2)).toBe(false);
    expect(isLowEmployeeStock(2, 2)).toBe(false);
    expect(isLowEmployeeStock(1, 2)).toBe(true);
    expect(isLowEmployeeStock(0, 0)).toBe(false);
  });
  it("só o administrador libera funcionários", () => {
    expect(can(ROLE_PRESETS.ADMIN, "manageEmployees")).toBe(true);
    expect(can(ROLE_PRESETS.ATTENDANT, "manageEmployees")).toBe(false);
    expect(can(ROLE_PRESETS.SECURITY, "manageEmployees")).toBe(false);
  });
});

describe("Convidado", () => {
  it("CPF do convidado é opcional, mas se informado precisa ser válido", () => {
    expect(guestInputSchema.parse({ fullName: "Pedro Souza", cpf: "", isMinor: true }).cpf).toBeNull();
    expect(guestInputSchema.parse({ fullName: "Pedro Souza", cpf: "529.982.247-25", isMinor: false }).cpf).toBe("52998224725");
    expect(guestInputSchema.safeParse({ fullName: "Pedro Souza", cpf: "123", isMinor: false }).success).toBe(false);
  });
  it("mesmo nome do(a) professor(a) só é problema quando o convidado não tem CPF", () => {
    expect(guestNameClash({ fullName: "JOAO pedro  pinto", cpf: "" }, "João Pedro Pinto")).toBe(true);
    expect(guestNameClash({ fullName: "João Pedro Pinto", cpf: "529.982.247-25" }, "João Pedro Pinto")).toBe(false);
    expect(guestNameClash({ fullName: "João Pedro Pinto Filho", cpf: "" }, "João Pedro Pinto")).toBe(false);
    expect(guestNameClash(null, "João Pedro Pinto")).toBe(false);
  });
});

describe("Ficha de filiação", () => {
  it("texto da autorização igual ao da ficha, com mês e ano", () => {
    expect(authorizationText("2026-11")).toBe(
      "Autorizo que seja descontado, em favor do SINDSERM, o valor correspondente a 1% (um por cento) do meu salário base, a partir do mês de novembro do ano de 2026.",
    );
  });

  it("sugere o desconto a partir do mês seguinte, virando o ano em dezembro", () => {
    expect(nextMonthValue("2026-09-23")).toBe("2026-10");
    expect(nextMonthValue("2026-12-05")).toBe("2027-01");
  });
});

describe("Tokens e QR", () => {
  it("token aleatório não repete e o QR não carrega dados pessoais", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateToken));
    expect(tokens.size).toBe(200);
    const token = generateToken();
    expect(qrPayloadFor(token)).toMatch(/^SFP1:[0-9A-HJKMNP-TV-Z]{32}$/);
    expect(parseQrPayload(qrPayloadFor(token).toLowerCase())).toBe(token);
    expect(parseQrPayload(qrPayloadFor(token))).toBe(token);
    expect(parseQrPayload("https://exemplo.com")).toBeNull();
  });
  it("cifra e decifra com AAD", () => {
    const secret = encryptSecret("abc", "voucher:1");
    expect(secret).not.toContain("abc");
    expect(decryptSecret(secret, "voucher:1")).toBe("abc");
    expect(() => decryptSecret(secret, "voucher:2")).toThrow();
  });
  it("código curto usa alfabeto sem caracteres ambíguos", () => {
    for (let i = 0; i < 50; i++) expect(generateVoucherCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(normalizeVoucherCode("ab1o-il2z")).toBe("AB10112Z");
  });
});

describe("Nome da festa e ícone", () => {
  it("separa título e chamada no travessão (ou hífen entre espaços)", () => {
    expect(splitEventName("Festa das Professoras e Professores – SINDSERMTHE 2026")).toEqual({
      title: "Festa das Professoras e Professores",
      tagline: "SINDSERMTHE 2026",
    });
    expect(splitEventName("Festa das Professoras e Professores - SINDSERMTHE 2026").tagline).toBe("SINDSERMTHE 2026");
    expect(splitEventName("Festa A — B - C")).toEqual({ title: "Festa A", tagline: "B - C" });
    // Hífen de palavra composta não separa.
    expect(splitEventName("Festa Pré-Réveillon 2026")).toEqual({ title: "Festa Pré-Réveillon 2026", tagline: null });
    expect(splitEventName("  Festa 2026  ")).toEqual({ title: "Festa 2026", tagline: null });
  });

  it("pede o menor tamanho de ícone que cobre a tela e põe a versão na URL", () => {
    expect(iconSizeFor(1)).toBe(16);
    expect(iconSizeFor(20)).toBe(32);
    expect(iconSizeFor(180)).toBe(180);
    expect(iconSizeFor(4000)).toBe(512);
    expect(siteIconUrl(32, "q1-abc")).toBe("/icone?s=32&v=q1-abc");
    expect(siteIconUrl(192)).toBe("/icone?s=192");
  });
});
