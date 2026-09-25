import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Este arquivo é lido pelo drizzle-kit (Node puro): não importar "server-only" aqui.

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const createdAt = () => timestamptz("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const staffRoleEnum = pgEnum("staff_role", ["ADMIN", "ATTENDANT", "SECURITY"]);
/**
 * PENDING: declarou ser filiado(a), aguarda conferência.
 * AWAITING_SIGNATURE: não era filiado(a) e preencheu a ficha antes da festa;
 * falta assinar a autorização de desconto na recepção.
 */
export const affiliationStatusEnum = pgEnum("affiliation_status", [
  "PENDING",
  "AWAITING_SIGNATURE",
  "CONFIRMED",
  "REJECTED",
  "JOINED_AT_EVENT",
]);
export const registrationOriginEnum = pgEnum("registration_origin", [
  "PUBLIC_FORM",
  "PRE_AFFILIATION",
  "STAFF",
  "GUEST_CONVERSION",
  "NEW_AFFILIATION",
]);
export const guestLinkStatusEnum = pgEnum("guest_link_status", ["ACTIVE", "REMOVED", "CONVERTED"]);
/*
 * EMPLOYEE (funcionários do SINDSERM) foi acrescentado depois. Valores novos de
 * um enum não podem ser usados na mesma transação da migration que os cria: as
 * regras (CHECK) que falam deles comparam o texto (`coluna::text`).
 */
export const kitTypeEnum = pgEnum("kit_type", ["MEMBER", "GUEST", "EMPLOYEE"]);
export const stockModeEnum = pgEnum("stock_mode", ["SINGLE", "SPLIT"]);
/**
 * EMPLOYEE: estoque dos funcionários do SINDSERM (kit do funcionário e do
 * convidado dele), sempre separado dos kits de professoras, professores e convidados.
 */
export const stockPoolEnum = pgEnum("stock_pool", ["ALL", "MEMBER", "GUEST", "EMPLOYEE"]);
export const participantRoleEnum = pgEnum("participant_role", ["MEMBER", "GUEST", "EMPLOYEE"]);
/** Documentos exigidos na ficha de filiação: cópia do RG e do contracheque. */
export const affiliationDocumentKindEnum = pgEnum("affiliation_document_kind", ["RG", "PAYSLIP"]);
export const checkInMethodEnum = pgEnum("check_in_method", ["QR", "SEARCH", "CODE"]);
export const affiliationFormStatusEnum = pgEnum("affiliation_form_status", [
  "DRAFT",
  "FORMALIZED",
  "CANCELLED",
]);
/** PUBLIC: preenchida pelo(a) interessado(a) antes da festa; STAFF: pelo Atendimento. */
export const affiliationFormOriginEnum = pgEnum("affiliation_form_origin", ["PUBLIC", "STAFF"]);
/**
 * Colaboradores do SINDSERM liberados para a festa: funcionários (STAFF, o
 * padrão de quem já estava na lista), diretoria (BOARD) e prestadores de
 * serviço (CONTRACTOR). Todos com a mesma regra: voucher próprio, 1 kit e 1 convidado.
 */
export const employeeCategoryEnum = pgEnum("employee_category", ["STAFF", "BOARD", "CONTRACTOR"]);

// ---------------------------------------------------------------------------
// Better Auth (equipe). Participantes não possuem conta.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: staffRoleEnum("role").notNull().default("SECURITY"),
  active: boolean("active").notNull().default(true),
  /**
   * Permissões personalizadas (JSON com o nível de cada área do sistema).
   * Nulo = as do perfil (`role`), que é o modelo de partida.
   */
  permissions: text("permissions"),
  /** Senha provisória (criada ou redefinida pelo administrador): troca obrigatória no próximo acesso. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Configuração do evento (linha única, criada ao concluir o setup)
// ---------------------------------------------------------------------------

export const eventConfig = pgTable(
  "event_config",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull(),
    description: text("description"),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time"),
    registrationOpensAt: timestamptz("registration_opens_at").notNull(),
    registrationClosesAt: timestamptz("registration_closes_at").notNull(),
    /**
     * Horário limite (no dia da festa) para retirar kits. Se for menor que o
     * horário de início, vale para a madrugada seguinte. Nulo = sem limite.
     */
    kitDeadlineTime: time("kit_deadline_time"),
    /** Local da festa (opcionais): aparecem na página inicial, na inscrição e nos vouchers. */
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    venueDescription: text("venue_description"),
    /** Link do Google Maps (compartilhar ou incorporar). */
    venueMapsUrl: text("venue_maps_url"),
    /** WhatsApp da organização para dúvidas (somente dígitos, com DDD). Aparece no botão de ajuda. */
    helpWhatsapp: text("help_whatsapp"),
    /** Mensagem de divulgação escrita pela organização. Nula = a mensagem automática, montada com os dados da festa. */
    shareMessage: text("share_message"),
    stockMode: stockModeEnum("stock_mode").notNull(),
    lowStockThreshold: integer("low_stock_threshold").notNull(),
    setupCompletedAt: timestamptz("setup_completed_at").notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("event_config_singleton", sql`${t.id} = 1`),
    check(
      "event_config_registration_period",
      sql`${t.registrationClosesAt} > ${t.registrationOpensAt}`,
    ),
    check("event_config_low_stock_threshold", sql`${t.lowStockThreshold} >= 0`),
    check("event_config_help_whatsapp_digits", sql`${t.helpWhatsapp} IS NULL OR ${t.helpWhatsapp} ~ '^[0-9]{10,13}$'`),
  ],
);

/** Foto do local da festa (uma só), já reduzida e sem metadados (EXIF/GPS). */
export const eventPhoto = pgTable(
  "event_photo",
  {
    id: integer("id").primaryKey().default(1),
    data: bytea("data").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [check("event_photo_singleton", sql`${t.id} = 1`)],
);

/**
 * Ícone do site (aba do navegador, tela inicial do celular e marca do painel),
 * trocado em Configurações. Guarda a versão quadrada de 512 px em PNG; sem
 * linha, vale o emblema da festa.
 */
export const siteIcon = pgTable(
  "site_icon",
  {
    id: integer("id").primaryKey().default(1),
    data: bytea("data").notNull(),
    /** Resumo do conteúdo (vai na URL como ?v=): muda quando a imagem muda. */
    version: text("version").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [check("site_icon_singleton", sql`${t.id} = 1`)],
);

/**
 * Estoque de kits. No modo SINGLE existe apenas o pool ALL; no modo SPLIT,
 * MEMBER e GUEST. `delivered` só aumenta com entrega confirmada e a constraint
 * garante que o estoque nunca fique negativo.
 */
export const kitStock = pgTable(
  "kit_stock",
  {
    pool: stockPoolEnum("pool").primaryKey(),
    total: integer("total").notNull(),
    delivered: integer("delivered").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("kit_stock_total_non_negative", sql`${t.total} >= 0`),
    check("kit_stock_delivered_non_negative", sql`${t.delivered} >= 0`),
    check("kit_stock_never_negative", sql`${t.delivered} <= ${t.total}`),
  ],
);

// ---------------------------------------------------------------------------
// Pessoas, inscrições e convidados
// ---------------------------------------------------------------------------

/**
 * Uma pessoa física. CPF (somente dígitos) e matrícula da prefeitura são
 * chaves únicas; a matrícula é comparada sem pontuação e sem diferenciar
 * maiúsculas (coluna gerada `registration_number_key`).
 */
export const person = pgTable(
  "person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    searchName: text("search_name").notNull(),
    /** Obrigatório para filiados; opcional para convidados (ex.: crianças). */
    cpf: text("cpf"),
    whatsapp: text("whatsapp"),
    registrationNumber: text("registration_number"),
    registrationNumberKey: text("registration_number_key").generatedAlwaysAs(
      sql`NULLIF(upper(regexp_replace(registration_number, '[^0-9A-Za-z]', '', 'g')), '')`,
    ),
    workplace: text("workplace"),
    isMinor: boolean("is_minor").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("person_cpf_unique").on(t.cpf),
    uniqueIndex("person_registration_number_unique").on(t.registrationNumberKey),
    check("person_cpf_digits", sql`${t.cpf} IS NULL OR ${t.cpf} ~ '^[0-9]{11}$'`),
    check("person_whatsapp_digits", sql`${t.whatsapp} IS NULL OR ${t.whatsapp} ~ '^[0-9]{10,13}$'`),
    index("person_search_name_idx").on(t.searchName),
  ],
);

/**
 * Inscrição de um filiado (grupo). Cada pessoa tem no máximo uma inscrição
 * como filiada; o status de filiação vive aqui. Só professoras e professores têm direito
 * ao kit de consumação e a levar convidado.
 */
export const registration = pgTable(
  "registration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberPersonId: uuid("member_person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    status: affiliationStatusEnum("status").notNull().default("PENDING"),
    isTeacher: boolean("is_teacher").notNull(),
    origin: registrationOriginEnum("origin").notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    submissionId: uuid("submission_id"),
    statusChangedAt: timestamptz("status_changed_at"),
    statusChangedByUserId: text("status_changed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    statusNote: text("status_note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("registration_member_person_unique").on(t.memberPersonId),
    uniqueIndex("registration_access_token_unique").on(t.accessTokenHash),
    uniqueIndex("registration_submission_unique").on(t.submissionId),
    index("registration_status_idx").on(t.status),
    index("registration_created_at_idx").on(t.createdAt),
  ],
);

/**
 * Vínculo do convidado com quem convidou: a inscrição de um(a) professor(a) ou
 * um(a) funcionário(a) do SINDSERM (no máximo um convidado ativo por anfitrião).
 * O convidado ativo é quem tem direito ao kit de convidado. O histórico é
 * mantido: vínculos removidos ou convertidos (convidado que virou filiado) permanecem.
 */
export const guestLink = pgTable(
  "guest_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Professor(a) que convidou (nulo quando quem convidou é funcionário(a)). */
    registrationId: uuid("registration_id").references(() => registration.id, { onDelete: "restrict" }),
    /** Funcionário(a) do SINDSERM que convidou. */
    employeeId: uuid("employee_id").references(() => employee.id, { onDelete: "restrict" }),
    guestPersonId: uuid("guest_person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    status: guestLinkStatusEnum("status").notNull().default("ACTIVE"),
    addedByUserId: text("added_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    endedAt: timestamptz("ended_at"),
    endedByUserId: text("ended_by_user_id").references(() => user.id, { onDelete: "set null" }),
    endReason: text("end_reason"),
    convertedToRegistrationId: uuid("converted_to_registration_id").references(
      () => registration.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    // Uma pessoa só pode ser convidada ativa de um filiado por vez.
    uniqueIndex("guest_link_one_active_per_person")
      .on(t.guestPersonId)
      .where(sql`${t.status} = 'ACTIVE'`),
    // Cada professor(a) ou funcionário(a) leva no máximo um convidado.
    uniqueIndex("guest_link_one_active_per_registration")
      .on(t.registrationId)
      .where(sql`${t.status} = 'ACTIVE'`),
    uniqueIndex("guest_link_one_active_per_employee")
      .on(t.employeeId)
      .where(sql`${t.status} = 'ACTIVE'`),
    // Quem convidou é um(a) professor(a) ou um(a) funcionário(a), nunca os dois.
    check("guest_link_one_host", sql`(${t.registrationId} IS NULL) <> (${t.employeeId} IS NULL)`),
    check("guest_link_ended_consistency", sql`(${t.status} = 'ACTIVE') = (${t.endedAt} IS NULL)`),
    check(
      "guest_link_conversion_consistency",
      sql`(${t.status} = 'CONVERTED') = (${t.convertedToRegistrationId} IS NOT NULL)`,
    ),
    index("guest_link_registration_idx").on(t.registrationId),
    index("guest_link_employee_idx").on(t.employeeId),
    index("guest_link_guest_person_idx").on(t.guestPersonId),
  ],
);

/**
 * Funcionários do SINDSERM liberados para a festa (cadastro só interno, pelo
 * administrador). Cada um tem voucher próprio, recebe 1 kit do estoque dos
 * funcionários e pode levar 1 convidado (com kit do mesmo estoque, depois que
 * o funcionário chegar). Remover mantém o histórico.
 */
export const employee = pgTable(
  "employee",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    /** Setor ou cargo no sindicato (ex.: Secretaria, Financeiro, Jurídico). */
    jobTitle: text("job_title"),
    category: employeeCategoryEnum("category").notNull().default("STAFF"),
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    removedAt: timestamptz("removed_at"),
    removedByUserId: text("removed_by_user_id").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("employee_person_unique").on(t.personId), index("employee_removed_at_idx").on(t.removedAt)],
);

// ---------------------------------------------------------------------------
// Vouchers, entrada e kits
// ---------------------------------------------------------------------------

/**
 * Voucher (QR) individual. O QR contém apenas um token aleatório; o banco guarda
 * o hash SHA-256 (para busca) e uma cópia cifrada (AES-256-GCM) para reexibição.
 */
export const voucher = pgTable(
  "voucher",
  {
    id: uuid("id").primaryKey(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(),
    issuedAt: timestamptz("issued_at").notNull().defaultNow(),
    issuedByUserId: text("issued_by_user_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamptz("revoked_at"),
    revokedByUserId: text("revoked_by_user_id").references(() => user.id, { onDelete: "set null" }),
    revokeReason: text("revoke_reason"),
  },
  (t) => [
    uniqueIndex("voucher_code_unique").on(t.code),
    uniqueIndex("voucher_token_hash_unique").on(t.tokenHash),
    uniqueIndex("voucher_one_active_per_person")
      .on(t.personId)
      .where(sql`${t.revokedAt} IS NULL`),
    check("voucher_code_format", sql`${t.code} ~ '^[0-9A-HJKMNP-TV-Z]{8}$'`),
  ],
);

export const checkIn = pgTable(
  "check_in",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    role: participantRoleEnum("role").notNull(),
    registrationId: uuid("registration_id").references(() => registration.id, {
      onDelete: "restrict",
    }),
    guestLinkId: uuid("guest_link_id").references(() => guestLink.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").references(() => employee.id, { onDelete: "restrict" }),
    voucherId: uuid("voucher_id").references(() => voucher.id, { onDelete: "restrict" }),
    method: checkInMethodEnum("method").notNull(),
    checkedInAt: timestamptz("checked_in_at").notNull().defaultNow(),
    checkedInByUserId: text("checked_in_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledByUserId: text("cancelled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    // Entrada única por pessoa (desconsiderando estornos administrativos).
    uniqueIndex("check_in_one_active_per_person")
      .on(t.personId)
      .where(sql`${t.cancelledAt} IS NULL`),
    check(
      "check_in_role_links",
      sql`(${t.role} = 'GUEST') = (${t.guestLinkId} IS NOT NULL)`,
    ),
    check(
      "check_in_employee_link",
      sql`(${t.role}::text = 'EMPLOYEE') = (${t.employeeId} IS NOT NULL)`,
    ),
    index("check_in_checked_in_at_idx").on(t.checkedInAt),
  ],
);

export const kitDelivery = pgTable(
  "kit_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Grupo do(a) professor(a) (kits MEMBER e GUEST). */
    registrationId: uuid("registration_id").references(() => registration.id, { onDelete: "restrict" }),
    /** Grupo do(a) funcionário(a) (kits EMPLOYEE e GUEST, do estoque dos funcionários). */
    employeeId: uuid("employee_id").references(() => employee.id, { onDelete: "restrict" }),
    kitType: kitTypeEnum("kit_type").notNull(),
    /** Em nome de quem o kit ficou registrado: quem convidou (professor(a) ou funcionário(a)). */
    recipientPersonId: uuid("recipient_person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    /** Para quem o kit se destina (o(a) próprio(a) professor(a), o convidado ou o(a) funcionário(a)). */
    beneficiaryPersonId: uuid("beneficiary_person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    guestLinkId: uuid("guest_link_id").references(() => guestLink.id, { onDelete: "restrict" }),
    stockPool: stockPoolEnum("stock_pool").notNull(),
    deliveredAt: timestamptz("delivered_at").notNull().defaultNow(),
    deliveredByUserId: text("delivered_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledByUserId: text("cancelled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    // Cada filiado retira no máximo 1 kit próprio e 1 kit de convidado.
    uniqueIndex("kit_delivery_once_per_type")
      .on(t.registrationId, t.kitType)
      .where(sql`${t.cancelledAt} IS NULL`),
    // Cada funcionário(a) recebe no máximo 1 kit próprio e 1 kit de convidado.
    uniqueIndex("kit_delivery_once_per_employee")
      .on(t.employeeId, t.kitType)
      .where(sql`${t.cancelledAt} IS NULL`),
    check("kit_delivery_guest_link", sql`(${t.kitType} = 'GUEST') = (${t.guestLinkId} IS NOT NULL)`),
    check(
      "kit_delivery_member_kit_is_own",
      sql`${t.kitType} = 'GUEST' OR ${t.beneficiaryPersonId} = ${t.recipientPersonId}`,
    ),
    check(
      "kit_delivery_guest_kit_not_to_self",
      sql`${t.kitType}::text <> 'GUEST' OR ${t.beneficiaryPersonId} <> ${t.recipientPersonId}`,
    ),
    // Todo kit pertence a um grupo só: o do(a) professor(a) ou o do(a) funcionário(a).
    // Kit de professor(a) é do grupo do(a) professor(a); kit de funcionário(a), do grupo dele(a).
    check(
      "kit_delivery_owner",
      sql`(${t.registrationId} IS NULL) <> (${t.employeeId} IS NULL) AND (${t.kitType}::text <> 'EMPLOYEE' OR ${t.employeeId} IS NOT NULL) AND (${t.kitType}::text <> 'MEMBER' OR ${t.registrationId} IS NOT NULL)`,
    ),
    index("kit_delivery_delivered_at_idx").on(t.deliveredAt),
  ],
);

// ---------------------------------------------------------------------------
// Ficha de filiação SINDSERM (preenchida antes da festa ou no Atendimento)
// ---------------------------------------------------------------------------

export const affiliationForm = pgTable(
  "affiliation_form",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    status: affiliationFormStatusEnum("status").notNull().default("DRAFT"),
    origin: affiliationFormOriginEnum("origin").notNull(),
    isTeacher: boolean("is_teacher").notNull(),
    formDate: date("form_date", { mode: "string" }).notNull(),
    fullName: text("full_name").notNull(),
    motherName: text("mother_name").notNull(),
    fatherName: text("father_name"),
    address: text("address").notNull(),
    addressNumber: text("address_number").notNull(),
    neighborhood: text("neighborhood").notNull(),
    email: text("email"),
    whatsapp: text("whatsapp").notNull(),
    birthDate: date("birth_date", { mode: "string" }).notNull(),
    rg: text("rg").notNull(),
    cpf: text("cpf").notNull(),
    workplace: text("workplace").notNull(),
    registrationNumber: text("registration_number").notNull(),
    jobTitle: text("job_title").notNull(),
    admissionDate: date("admission_date", { mode: "string" }).notNull(),
    contributionStartMonth: text("contribution_start_month").notNull(),
    authorizationAccepted: boolean("authorization_accepted").notNull(),
    authorizationText: text("authorization_text").notNull(),
    authorizationAcceptedAt: timestamptz("authorization_accepted_at").notNull(),
    /** Nulo quando preenchida pelo(a) próprio(a) interessado(a) no formulário público. */
    createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    formalizedAt: timestamptz("formalized_at"),
    formalizedByUserId: text("formalized_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    registrationId: uuid("registration_id").references(() => registration.id, {
      onDelete: "restrict",
    }),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledByUserId: text("cancelled_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    check("affiliation_form_authorization_accepted", sql`${t.authorizationAccepted} = true`),
    check("affiliation_form_formalized_consistency", sql`(${t.status} = 'FORMALIZED') = (${t.formalizedAt} IS NOT NULL)`),
    check(
      "affiliation_form_formalized_registration",
      sql`${t.status} <> 'FORMALIZED' OR ${t.registrationId} IS NOT NULL`,
    ),
    check(
      "affiliation_form_origin_author",
      sql`${t.origin} = 'PUBLIC' OR ${t.createdByUserId} IS NOT NULL`,
    ),
    check("affiliation_form_cpf_digits", sql`${t.cpf} ~ '^[0-9]{11}$'`),
    check(
      "affiliation_form_contribution_month",
      sql`${t.contributionStartMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    // No máximo uma ficha aberta ou formalizada por pessoa.
    uniqueIndex("affiliation_form_one_open_per_person")
      .on(t.personId)
      .where(sql`${t.status} IN ('DRAFT', 'FORMALIZED')`),
    index("affiliation_form_status_idx").on(t.status),
  ],
);

/**
 * Cópias do RG e do contracheque anexadas à ficha de filiação. O arquivo fica
 * cifrado (AES-256-GCM) e só a equipe abre. Sem ficha (`form_id` nulo) é um
 * envio ainda não confirmado: o formulário público liga os anexos à ficha ao
 * gravar; envios soltos são apagados depois de um dia.
 */
export const affiliationDocument = pgTable(
  "affiliation_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id").references(() => affiliationForm.id, { onDelete: "cascade" }),
    kind: affiliationDocumentKindEnum("kind").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("affiliation_document_form_idx").on(t.formId),
    index("affiliation_document_created_at_idx").on(t.createdAt),
    check("affiliation_document_type", sql`${t.contentType} IN ('image/jpeg', 'application/pdf')`),
  ],
);

// ---------------------------------------------------------------------------
// Auditoria e rate limiting
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_action_idx").on(t.action),
  ],
);

/** Janela fixa de rate limiting. A chave nunca contém IP em texto puro (HMAC). */
export const rateLimit = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamptz("reset_at").notNull(),
});

export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
export type AffiliationStatus = (typeof affiliationStatusEnum.enumValues)[number];
export type KitType = (typeof kitTypeEnum.enumValues)[number];
export type StockMode = (typeof stockModeEnum.enumValues)[number];
export type StockPool = (typeof stockPoolEnum.enumValues)[number];
export type CheckInMethod = (typeof checkInMethodEnum.enumValues)[number];
export type RegistrationOrigin = (typeof registrationOriginEnum.enumValues)[number];
export type AffiliationFormOrigin = (typeof affiliationFormOriginEnum.enumValues)[number];
export type AffiliationDocumentKind = (typeof affiliationDocumentKindEnum.enumValues)[number];
