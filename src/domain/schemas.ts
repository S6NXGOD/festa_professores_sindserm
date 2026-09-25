/**
 * Schemas Zod compartilhados entre formulários (cliente) e server actions.
 * O servidor sempre revalida com os mesmos schemas.
 */
import { z } from "zod";
import { isValidCpf, normalizeCpf } from "@/lib/cpf";
import { normalizeMapsInput } from "@/lib/maps";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { normalizeSpaces, toSearchText } from "@/lib/text";
import { ACCESS_LEVELS, sanitizeAccess } from "./access";
import { EMPLOYEE_CATEGORIES, STAFF_ROLES } from "./types";

const NAME_REGEX = /^[\p{L}\p{M}'’. -]+$/u;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const LOCAL_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const FREE_TEXT_REGEX = /^[^<>{}\\]*$/;

function isRealDate(value: string) {
  if (!DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m! - 1 && date.getUTCDate() === d;
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

// ---------------------------------------------------------------------------
// Campos reutilizáveis
// ---------------------------------------------------------------------------

export const fullNameField = (label = "o nome completo") =>
  z
    .string()
    .transform(normalizeSpaces)
    .pipe(
      z
        .string()
        .min(1, `Informe ${label}`)
        .max(120, "Nome muito longo")
        .regex(NAME_REGEX, "Use apenas letras")
        .refine((v) => v.split(" ").filter((w) => /\p{L}/u.test(w)).length >= 2, "Informe nome e sobrenome"),
    );

export const cpfField = z
  .string()
  .transform(normalizeCpf)
  .pipe(z.string().min(1, "Informe o CPF").refine(isValidCpf, "CPF inválido"));

/** CPF opcional (convidado): vazio vira null; preenchido precisa ser válido. */
export const optionalCpfField = z
  .string()
  .transform(normalizeCpf)
  .refine((v) => v === "" || isValidCpf(v), "CPF inválido")
  .transform((v) => (v === "" ? null : v));

export const phoneField = z
  .string()
  .transform(normalizePhone)
  .pipe(z.string().min(1, "Informe o WhatsApp").refine(isValidPhone, "Número inválido (DDD + número)"));

/** WhatsApp opcional: vazio vira null; preenchido precisa ser válido. */
export const optionalPhoneField = z
  .string()
  .transform(normalizePhone)
  .refine((v) => v === "" || isValidPhone(v), "Número inválido (DDD + número)")
  .transform((v) => (v === "" ? null : v));

const shortText = (label: string, min: number, max: number) =>
  z
    .string()
    .transform(normalizeSpaces)
    .pipe(
      z
        .string()
        .min(1, `Informe ${label}`)
        .min(min, `${label[0]!.toUpperCase()}${label.slice(1)} muito curto`)
        .max(max, "Texto muito longo")
        .regex(FREE_TEXT_REGEX, "Caracteres inválidos"),
    );

/** Matrícula da prefeitura (chave única, comparada sem pontuação). */
export const registrationNumberField = z
  .string()
  .transform(normalizeSpaces)
  .pipe(
    z
      .string()
      .min(1, "Informe a matrícula")
      .max(30, "Matrícula muito longa")
      .regex(/^[\p{L}\p{N}./ -]+$/u, "Use letras, números, ponto, barra ou hífen")
      .refine((v) => /[\p{L}\p{N}]/u.test(v), "Informe a matrícula"),
  );

/** Chave de comparação da matrícula (mesma regra da coluna gerada no banco). */
export function registrationNumberKey(value: string | null | undefined): string | null {
  const key = (value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return key || null;
}

export const workplaceField = shortText("a lotação/local de trabalho", 2, 120);

export const dateField = (label = "a data") =>
  z.string().min(1, `Informe ${label}`).refine(isRealDate, "Data inválida");

export const timeField = z.string().regex(TIME_REGEX, "Horário inválido");

export const localDateTimeField = (label: string) =>
  z.string().min(1, `Informe ${label}`).regex(LOCAL_DATETIME_REGEX, "Data e hora inválidas");

const optionalText = (max: number) =>
  z
    .string()
    .transform(normalizeSpaces)
    .pipe(z.string().max(max, "Texto muito longo").regex(FREE_TEXT_REGEX, "Caracteres inválidos"))
    .transform((v) => (v === "" ? null : v));

/** Texto livre com parágrafos: mantém quebras de linha (no máximo uma linha em branco). */
const optionalMultilineText = (max: number) =>
  z
    .string()
    .transform((v) =>
      v
        .normalize("NFC")
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(z.string().max(max, "Texto muito longo").regex(FREE_TEXT_REGEX, "Caracteres inválidos"))
    .transform((v) => (v === "" ? null : v));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido")
  .transform((v) => (v === "" ? null : v));

const optionalName = (label: string) =>
  z
    .string()
    .transform(normalizeSpaces)
    .refine((v) => v === "" || fullNameField(label).safeParse(v).success, "Nome inválido")
    .transform((v) => (v === "" ? null : v));

/** Resposta obrigatória de sim/não (o formulário começa sem resposta). */
const yesNoField = (message: string) => z.boolean({ error: message });

const consentField = (message: string) => z.boolean().refine((v) => v, message);

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : Number(value);

const quantity = (label: string) =>
  z
    .number({ error: `Informe ${label}` })
    .int("Use um número inteiro")
    .min(0, "Não pode ser negativo")
    .max(1_000_000, "Valor muito alto");

const intField = (label: string) => z.preprocess(emptyToUndefined, quantity(label));

/** Campo numérico opcional: vazio vira undefined (validado depois conforme o modo). */
const optionalIntField = (label: string) => z.preprocess(emptyToUndefined, quantity(label).optional());

// ---------------------------------------------------------------------------
// Convidado (um por professor(a))
// ---------------------------------------------------------------------------

export const guestInputSchema = z.object({
  fullName: fullNameField("o nome completo do convidado"),
  /** Opcional: muitos convidados são crianças ou não sabem o CPF de cabeça. */
  cpf: optionalCpfField,
  isMinor: z.boolean(),
});
export type GuestInput = z.input<typeof guestInputSchema>;

const PRIVACY_MESSAGE = "É necessário concordar com o aviso de privacidade";
const TEACHER_MESSAGE = "Responda se você é professor(a)";

export const SAME_NAME_GUEST_MESSAGE = "Mesmo nome do(a) professor(a): informe o CPF do convidado para mostrar que é outra pessoa";

/**
 * Convidado sem CPF com o mesmo nome do(a) professor(a): provavelmente é a
 * própria pessoa (o que daria um kit a mais). Homônimo de verdade? Basta
 * informar o CPF do convidado.
 */
export function guestNameClash(guest: { fullName?: string | null; cpf?: string | null } | null | undefined, memberName?: string | null) {
  if (!guest || !memberName || normalizeCpf(guest.cpf ?? "")) return false;
  const name = toSearchText(guest.fullName ?? "");
  return name.length > 0 && name === toSearchText(memberName);
}

function refineGuest(
  data: { isTeacher: boolean; guest: { fullName: string; cpf: string | null } | null },
  member: { cpf: string; fullName: string },
  ctx: z.RefinementCtx,
) {
  if (!data.guest) return;
  if (!data.isTeacher) {
    ctx.addIssue({ code: "custom", path: ["guest"], message: "Somente professoras e professores podem levar convidado" });
  } else if (data.guest.cpf && data.guest.cpf === member.cpf) {
    ctx.addIssue({ code: "custom", path: ["guest", "cpf"], message: "O convidado precisa ter outro CPF" });
  } else if (guestNameClash(data.guest, member.fullName)) {
    ctx.addIssue({ code: "custom", path: ["guest", "cpf"], message: SAME_NAME_GUEST_MESSAGE });
  }
}

// ---------------------------------------------------------------------------
// Inscrição de quem já é filiado(a)
// ---------------------------------------------------------------------------

export const memberDataSchema = z.object({
  fullName: fullNameField(),
  cpf: cpfField,
  whatsapp: phoneField,
  registrationNumber: registrationNumberField,
  workplace: workplaceField,
});

export const registrationSchema = z
  .object({
    submissionId: z.uuid(),
    member: memberDataSchema,
    isTeacher: yesNoField(TEACHER_MESSAGE),
    guest: guestInputSchema.nullable(),
    privacyConsent: consentField(PRIVACY_MESSAGE),
  })
  .superRefine((data, ctx) => refineGuest(data, data.member, ctx));

export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationData = z.output<typeof registrationSchema>;
export type MemberData = z.output<typeof memberDataSchema>;

/**
 * Convidado cadastrado/trocado pelo Atendimento. Quem convida é a inscrição de
 * um(a) professor(a) (`registrationId`) ou um(a) funcionário(a) do SINDSERM
 * (`employeeId`).
 */
export const addGuestSchema = z.object({
  registrationId: z.uuid().nullable().optional(),
  employeeId: z.uuid().nullable().optional(),
  fullName: fullNameField("o nome completo do convidado"),
  cpf: optionalCpfField,
  isMinor: z.boolean(),
  /** Vincula uma pessoa já cadastrada (ex.: filiação não confirmada), mesmo sem CPF. */
  personId: z.uuid().nullable().optional(),
  /** Troca: o convidado atual sai e o novo entra na mesma operação. */
  replaceGuestLinkId: z.uuid().nullable().optional(),
});
export type AddGuestInput = z.input<typeof addGuestSchema>;
export type AddGuestData = z.output<typeof addGuestSchema>;

// ---------------------------------------------------------------------------
// Ficha de filiação SINDSERM (mesmos campos da ficha impressa)
// ---------------------------------------------------------------------------

export const affiliationFieldsSchema = z.object({
  fullName: fullNameField(),
  motherName: fullNameField("o nome da mãe"),
  fatherName: optionalName("o nome do pai"),
  address: shortText("o endereço", 3, 160),
  addressNumber: shortText("o número", 1, 10),
  neighborhood: shortText("o bairro", 2, 80),
  email: optionalEmail,
  whatsapp: phoneField,
  birthDate: dateField("a data de nascimento"),
  rg: z
    .string()
    .transform(normalizeSpaces)
    .pipe(
      z
        .string()
        .min(1, "Informe o RG")
        .max(20, "RG muito longo")
        .regex(/^[\p{L}\p{N}./ -]+$/u, "RG inválido"),
    ),
  cpf: cpfField,
  workplace: workplaceField,
  registrationNumber: registrationNumberField,
  jobTitle: shortText("o cargo/função", 2, 80),
  admissionDate: dateField("a data de admissão"),
  contributionStartMonth: z.string().regex(MONTH_REGEX, "Informe o mês e o ano de início do desconto"),
});
export type AffiliationFieldsInput = z.input<typeof affiliationFieldsSchema>;
export type AffiliationFieldsData = z.output<typeof affiliationFieldsSchema>;

const AUTHORIZATION_MESSAGE = "É necessário aceitar a autorização de desconto";

/** RG: frente e verso (ou um PDF). Contracheque: normalmente 1 arquivo. */
export const MAX_FILES_PER_DOCUMENT = 4;

const uploadIds = z.array(z.uuid()).max(MAX_FILES_PER_DOCUMENT, `No máximo ${MAX_FILES_PER_DOCUMENT} arquivos`);

/** Cópias do RG e do contracheque (ids dos envios já feitos). */
export const requiredDocumentsSchema = z.object({
  rg: uploadIds.min(1, "Anexe a foto do RG (frente e verso)"),
  payslip: uploadIds.min(1, "Anexe o contracheque"),
});
export type DocumentsInput = z.input<typeof requiredDocumentsSchema>;

/**
 * Ficha preenchida pelo(a) próprio(a) interessado(a) antes da festa. Na
 * recepção, falta apenas assinar a ficha impressa. RG e contracheque são
 * obrigatórios: sem eles a filiação não é confirmada.
 */
export const preAffiliationSchema = z
  .object({
    submissionId: z.uuid(),
    ficha: affiliationFieldsSchema,
    isTeacher: yesNoField(TEACHER_MESSAGE),
    guest: guestInputSchema.nullable(),
    authorizationAccepted: consentField(AUTHORIZATION_MESSAGE),
    documents: requiredDocumentsSchema,
    privacyConsent: consentField(PRIVACY_MESSAGE),
  })
  .superRefine((data, ctx) => refineGuest(data, data.ficha, ctx));
export type PreAffiliationInput = z.input<typeof preAffiliationSchema>;
export type PreAffiliationData = z.output<typeof preAffiliationSchema>;

/**
 * Ficha preenchida/revisada pelo Atendimento. Os documentos podem ser
 * anexados agora ou depois (antes de confirmar a assinatura).
 */
export const affiliationFormSchema = affiliationFieldsSchema.extend({
  personId: z.uuid().nullable(),
  formDate: dateField("a data da ficha"),
  isTeacher: yesNoField("Informe se a pessoa é professor(a)"),
  authorizationAccepted: consentField(AUTHORIZATION_MESSAGE),
  documents: z.object({ rg: uploadIds, payslip: uploadIds }).optional(),
});
export type AffiliationFormInput = z.input<typeof affiliationFormSchema>;
export type AffiliationFormData = z.output<typeof affiliationFormSchema>;

/** Pessoa cadastrada como convidada que diz já ser filiada. */
export const declaredMemberSchema = z.object({
  personId: z.uuid(),
  /** Obrigatório só quando a pessoa foi cadastrada como convidada sem CPF. */
  cpf: optionalCpfField.optional(),
  whatsapp: phoneField,
  registrationNumber: registrationNumberField,
  workplace: workplaceField,
  isTeacher: yesNoField("Informe se a pessoa é professor(a)"),
});
export type DeclaredMemberInput = z.input<typeof declaredMemberSchema>;

export const personCorrectionSchema = z.object({
  personId: z.uuid(),
  fullName: fullNameField(),
  /** Vazio = sem CPF (permitido só para quem é apenas convidado). */
  cpf: optionalCpfField,
  whatsapp: optionalPhoneField,
  registrationNumber: optionalText(30),
  workplace: optionalText(120),
  isMinor: z.boolean(),
});
export type PersonCorrectionInput = z.input<typeof personCorrectionSchema>;

/** Correção de "é professor(a)?" em uma inscrição. */
export const teacherStatusSchema = z.object({
  registrationId: z.uuid(),
  isTeacher: z.boolean(),
});
export type TeacherStatusInput = z.input<typeof teacherStatusSchema>;

// ---------------------------------------------------------------------------
// Colaboradores do SINDSERM: diretoria, funcionários e prestadores (cadastro só interno)
// ---------------------------------------------------------------------------

/** Setor ou cargo no sindicato (opcional). */
export const employeeJobTitleField = optionalText(60);

export const SAME_NAME_EMPLOYEE_GUEST_MESSAGE =
  "Mesmo nome do(a) colaborador(a): informe o CPF do convidado para mostrar que é outra pessoa";

const employeeFields = z.object({
  fullName: fullNameField(),
  /** Opcional: ajuda a achar a pessoa na portaria e evita cadastro duplicado. */
  cpf: optionalCpfField,
  /** Opcional: para mandar o voucher direto no WhatsApp da pessoa. */
  whatsapp: optionalPhoneField,
  jobTitle: employeeJobTitleField,
  /** Diretoria, funcionário(a) ou prestador(a) de serviço: mesma regra, voucher com a categoria. */
  category: z.enum(EMPLOYEE_CATEGORIES).default("STAFF"),
});

/** Cadastro do(a) funcionário(a), já com o convidado (opcional). */
export const employeeSchema = employeeFields
  .extend({ guest: guestInputSchema.nullable() })
  .superRefine((data, ctx) => {
    if (!data.guest) return;
    if (data.guest.cpf && data.cpf && data.guest.cpf === data.cpf) {
      ctx.addIssue({ code: "custom", path: ["guest", "cpf"], message: "O convidado precisa ter outro CPF" });
    } else if (guestNameClash(data.guest, data.fullName)) {
      ctx.addIssue({ code: "custom", path: ["guest", "cpf"], message: SAME_NAME_EMPLOYEE_GUEST_MESSAGE });
    }
  });
export type EmployeeInput = z.input<typeof employeeSchema>;
export type EmployeeData = z.output<typeof employeeSchema>;

/** Edição dos dados do(a) funcionário(a) (o convidado é trocado pela tela da pessoa). */
export const updateEmployeeSchema = employeeFields.extend({ employeeId: z.uuid() });
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;
export type UpdateEmployeeData = z.output<typeof updateEmployeeSchema>;

/** Até 200 nomes por vez, um por linha. */
export const MAX_BULK_EMPLOYEES = 200;

export const bulkEmployeesSchema = z.object({
  text: z.string().max(20_000, "Lista muito longa"),
  /** A lista colada inteira é de uma categoria (ex.: só a diretoria). */
  category: z.enum(EMPLOYEE_CATEGORIES).default("STAFF"),
});
export type BulkEmployeesInput = z.input<typeof bulkEmployeesSchema>;

export interface BulkEmployeeLine {
  line: number;
  fullName: string;
  jobTitle: string | null;
  /** Nome do convidado (terceira coluna), se houver. */
  guestName: string | null;
}

/** Numeração ou marcador no começo da linha ("1.", "2)", "3 -", "-", "•"). */
const LIST_MARKER = /^\s*(?:\d{1,3}\s*[.)ºª-]?|[-–—•*·])\s+/;
/** Coluna de numeração de planilha ("1<tab>Maria Souza"). */
const NUMBER_CELL = /^\d{1,3}[.)ºª]?$/;

/**
 * Lê a lista colada, um funcionário por linha: "Nome; Setor; Convidado" (setor
 * e convidado são opcionais). Separa por ";", tab ou " - ". Linhas vazias,
 * numeração ("1.", "•") e colunas vazias no começo (planilha) são ignoradas;
 * coluna vazia no meio mantém a posição (ex.: "Maria Souza;; João Souza").
 */
export function parseEmployeeLines(text: string): { rows: BulkEmployeeLine[]; errors: { line: number; message: string }[] } {
  const rows: BulkEmployeeLine[] = [];
  const errors: { line: number; message: string }[] = [];
  text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((raw, index) => {
      const line = index + 1;
      if (!raw.trim()) return;
      const cells = raw
        .replace(LIST_MARKER, "")
        .split(/\t|;|\s[-–—]\s/)
        .map((cell) => cell.trim());
      while (cells.length > 0 && cells[0] === "") cells.shift();
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      if (cells.length > 1 && NUMBER_CELL.test(cells[0]!)) cells.shift();
      const [namePart = "", jobPart = "", guestPart = "", ...extra] = cells;
      const name = fullNameField().safeParse(namePart);
      if (!name.success) {
        errors.push({ line, message: `${namePart || "(vazio)"}: ${name.error.issues[0]?.message ?? "nome inválido"}` });
        return;
      }
      if (extra.length > 0) {
        errors.push({ line, message: `${name.data}: use no máximo 3 colunas (nome; setor; convidado)` });
        return;
      }
      const job = employeeJobTitleField.safeParse(jobPart);
      if (!job.success) {
        errors.push({ line, message: `${name.data}: setor inválido` });
        return;
      }
      let guestName: string | null = null;
      if (guestPart) {
        const guest = fullNameField("o nome e sobrenome do convidado").safeParse(guestPart);
        if (!guest.success) {
          errors.push({ line, message: `Convidado de ${name.data}: ${guest.error.issues[0]?.message ?? "nome inválido"}` });
          return;
        }
        if (toSearchText(guest.data) === toSearchText(name.data)) {
          errors.push({ line, message: `${name.data}: o convidado não pode ter o mesmo nome` });
          return;
        }
        guestName = guest.data;
      }
      rows.push({ line, fullName: name.data, jobTitle: job.data, guestName });
    });
  if (rows.length + errors.length > MAX_BULK_EMPLOYEES) {
    errors.push({ line: 0, message: `Cole no máximo ${MAX_BULK_EMPLOYEES} nomes por vez.` });
  }
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Configuração do evento
// ---------------------------------------------------------------------------

export const eventSettingsSchema = z
  .object({
    name: shortText("o nome do evento", 3, 120),
    description: optionalMultilineText(1000),
    eventDate: dateField("a data do evento"),
    startTime: timeField,
    endTime: z
      .string()
      .refine((v) => v === "" || TIME_REGEX.test(v), "Horário inválido")
      .transform((v) => (v === "" ? null : v)),
    registrationOpensAt: localDateTimeField("a abertura das inscrições"),
    registrationClosesAt: localDateTimeField("o encerramento das inscrições"),
    /** Horário limite para retirar kits no dia da festa (vazio = sem limite). */
    kitDeadlineTime: z
      .string()
      .refine((v) => v === "" || TIME_REGEX.test(v), "Horário inválido")
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((d, ctx) => {
    if (d.registrationClosesAt <= d.registrationOpensAt) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationClosesAt"],
        message: "O encerramento deve ser depois da abertura",
      });
    }
    // Limite antes do início só faz sentido na madrugada seguinte (até 6h).
    if (d.kitDeadlineTime && TIME_REGEX.test(d.startTime)) {
      const deadline = toMinutes(d.kitDeadlineTime);
      if (deadline <= toMinutes(d.startTime) && deadline > 6 * 60) {
        ctx.addIssue({
          code: "custom",
          path: ["kitDeadlineTime"],
          message: "Use um horário depois do início da festa (ou na madrugada, até 6h)",
        });
      }
    }
  });
export type EventSettingsInput = z.input<typeof eventSettingsSchema>;
export type EventSettingsData = z.output<typeof eventSettingsSchema>;

/** Local da festa: aparece na página inicial, na inscrição e nos vouchers. */
export const venueSettingsSchema = z.object({
  venueName: optionalText(120),
  venueAddress: optionalText(200),
  venueDescription: optionalMultilineText(1000),
  venueMapsUrl: z
    .string()
    .max(4000, "Link muito longo")
    .transform((value, ctx) => {
      const result = normalizeMapsInput(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: "Cole um link do Google Maps (ou o código de incorporar o mapa)" });
        return z.NEVER;
      }
      return result.url;
    }),
});
export type VenueSettingsInput = z.input<typeof venueSettingsSchema>;
export type VenueSettingsData = z.output<typeof venueSettingsSchema>;

/** Contato para dúvidas (botão de ajuda nas páginas públicas). */
export const helpSettingsSchema = z.object({
  helpWhatsapp: optionalPhoneField,
});
export type HelpSettingsInput = z.input<typeof helpSettingsSchema>;
export type HelpSettingsData = z.output<typeof helpSettingsSchema>;

export const stockSettingsSchema = z
  .object({
    stockMode: z.enum(["SINGLE", "SPLIT"]),
    totalAll: optionalIntField("a quantidade de kits"),
    totalMember: optionalIntField("a quantidade de kits de professor(a)"),
    totalGuest: optionalIntField("a quantidade de kits de convidado"),
    /** Estoque dos funcionários (sempre separado). Vazio = 0. */
    totalEmployee: optionalIntField("a quantidade de kits dos colaboradores"),
    lowStockThreshold: intField("o limite de alerta"),
  })
  .superRefine((d, ctx) => {
    const required: (keyof typeof d)[] =
      d.stockMode === "SINGLE" ? ["totalAll"] : ["totalMember", "totalGuest"];
    for (const key of required) {
      if (d[key] === undefined) ctx.addIssue({ code: "custom", path: [key], message: "Informe a quantidade" });
    }
  });
export type StockSettingsInput = z.input<typeof stockSettingsSchema>;
export type StockSettingsData = z.output<typeof stockSettingsSchema>;

export const setupSchema = z.object({
  event: eventSettingsSchema,
  stock: stockSettingsSchema,
});
export type SetupInput = z.input<typeof setupSchema>;

// ---------------------------------------------------------------------------
// Usuários da equipe
// ---------------------------------------------------------------------------

export const passwordField = z
  .string()
  .min(10, "Use pelo menos 10 caracteres")
  .max(128, "Senha muito longa");

export const staffEmailField = z.string().trim().toLowerCase().pipe(z.email("E-mail inválido").max(160));

export const bootstrapAdminSchema = z
  .object({
    setupToken: z.string().min(1, "Informe o token de configuração"),
    name: fullNameField(),
    email: staffEmailField,
    password: passwordField,
    passwordConfirmation: z.string(),
  })
  .refine((d) => d.password === d.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "As senhas não conferem",
  });
export type BootstrapAdminInput = z.input<typeof bootstrapAdminSchema>;

/**
 * Permissões por área. Níveis que a área não aceita viram "sem acesso": dado
 * adulterado nunca ganha acesso a mais.
 */
export const accessMapSchema = z
  .object({
    modules: z.record(z.string(), z.enum(ACCESS_LEVELS)),
    fullCpf: z.boolean(),
  })
  .transform((value) => sanitizeAccess(value));

export const createUserSchema = z.object({
  name: fullNameField(),
  email: staffEmailField,
  role: z.enum(STAFF_ROLES),
  password: passwordField,
  /** Permissões ajustadas; ausente ou igual ao perfil = as do perfil. */
  access: accessMapSchema.nullish(),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: fullNameField(),
  role: z.enum(STAFF_ROLES),
  active: z.boolean(),
  access: accessMapSchema.nullish(),
  /** Pedir que a pessoa crie uma senha nova no próximo acesso. */
  mustChangePassword: z.boolean().optional(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: passwordField,
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ["newPassword"],
    message: "Escolha uma senha diferente da atual",
  });
export type ChangeOwnPasswordInput = z.input<typeof changeOwnPasswordSchema>;

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordField,
});

export const justificationField = z
  .string()
  .transform(normalizeSpaces)
  .pipe(z.string().min(10, "Descreva o motivo (mínimo de 10 caracteres)").max(500, "Texto muito longo"));
