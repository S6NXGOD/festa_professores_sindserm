import "server-only";
import type { Executor } from "@/server/db";
import { EDITION } from "@/domain/edition";
import { eventStartAt, eventStartLabel, hasEventStarted, isKitDeadlinePassed, kitDeadlineAt } from "@/domain/kit-deadline";
import { ENTRY_BLOCK_MESSAGE, ENTRY_KIT_MESSAGE, KIT_BLOCK_MESSAGE, KIT_TYPE_LABEL, sharedKitMessage } from "@/domain/labels";
import {
  can,
  canHaveGuest,
  employeeKitAvailability,
  type EmployeeKitInput,
  type EntryBlockCode,
  guestRemovalCheck,
  isActiveMember,
  kitAvailability,
  type KitAvailability,
  type KitBlockCode,
  type KitRegistrationInput,
  stockPoolFor,
} from "@/domain/rules";
import type { AccessMap } from "@/domain/access";
import type { AffiliationStatus, CheckInMethod, DocumentKind, EmployeeKitType, GroupKitType, ParticipantRole, EmployeeCategory } from "@/domain/types";
import { displayCpf } from "@/lib/cpf";
import { formatVoucherCode } from "@/server/crypto";
import { entryDecisionFor } from "./checkin";
import { evaluateDeskKit, hasMinorKit, walkInOf } from "./desk-kit";
import { employeeKitInput, kitInput } from "./kits";
import { employeePoolOf, type EventConfig, getEventConfig, getStockOverview, type StockOverview } from "./settings";
import { type ActiveGuest, type EmployeeGroupState, loadPersonState, type PersonState, type RegistrationState } from "./state";
import { firstName } from "@/lib/text";

export type KitView =
  | { kind: "DELIVERED"; deliveryId: string; at: Date; byName: string; beneficiaryName: string }
  | { kind: "AVAILABLE" }
  /** `code`: por que não sai (KIT_WAITLIST = na fila do kit: a equipe pode entregar um kit de sobra). */
  | { kind: "BLOCKED"; message: string; code: KitBlockCode };

/** O que acontece com os kits se a entrada for confirmada agora. */
export type KitOnEntry =
  /** `label`: a frase inteira ("1 kit de convidado"); `detail`: de quem é o kit, para o cartão da portaria. */
  | {
      kind: "WILL_DELIVER";
      count: 1 | 2;
      label: string;
      detail: string;
      /** Quantos destes kits são de menor de 18 (só aparece quando há). */
      minors?: number;
    }
  /** Convidado que chega antes de quem convidou: o kit dele sai quando essa pessoa chegar. */
  | { kind: "WAITING"; message: string }
  | { kind: "NONE"; message: string }
  /** Mesa dos kits: a portaria só registra a entrada e manda a pessoa à mesa. `extra` = kit da gordura. */
  | { kind: "AT_DESK"; extra: boolean; minor: boolean };

export type EntryView =
  | { kind: "ALREADY_IN"; at: Date; byName: string; method: CheckInMethod }
  | { kind: "ALLOWED"; role: ParticipantRole }
  | { kind: "BLOCKED"; code: EntryBlockCode; title: string; detail: string };

export interface GuestView {
  guestLinkId: string;
  personId: string;
  fullName: string;
  isMinor: boolean;
  checkedIn: boolean;
  /** Pode ser removido/trocado (não entrou e o kit dele não saiu). */
  replaceable: boolean;
}

export interface GateView {
  /** Antes do horário de início, registrar a entrada pede uma confirmação a mais. */
  eventStart: { started: boolean; label: string | null; at: string | null };
  personId: string;
  fullName: string;
  /** CPF para exibição (completo, mascarado ou "Sem CPF"). */
  cpf: string;
  /** Convidado pode não ter CPF; para virar filiado(a), o CPF passa a ser exigido. */
  hasCpf: boolean;
  isMinor: boolean;
  voucherCode: string | null;
  role: ParticipantRole | "NONE";
  ownRegistration: null | {
    id: string;
    status: AffiliationStatus;
    isTeacher: boolean;
    canHaveGuest: boolean;
    guest: GuestView | null;
    kits: Record<GroupKitType, KitView>;
  };
  /** Colaborador(a) do SINDSERM (com o convidado e os kits do grupo). */
  employee: null | {
    employeeId: string;
    active: boolean;
    jobTitle: string | null;
    category: EmployeeCategory;
    guest: GuestView | null;
    kits: Record<EmployeeKitType, KitView>;
    /** Tem direito a kit (só cortesia pode ser "sem kit"). */
    withKit: boolean;
    /** Convidado(a) sem kit: o(a) colaborador(a) que trouxe. */
    broughtBy: { personId: string; fullName: string; category: EmployeeCategory } | null;
    /** Colaborador(a): convidados sem kit que trouxe. */
    companions: { employeeId: string; personId: string; fullName: string; isMinor: boolean; checkedIn: boolean }[];
  };
  /** Quem convidou esta pessoa: um(a) professor(a) ou um(a) colaborador(a) do SINDSERM. */
  host: null | {
    kind: "MEMBER" | "EMPLOYEE";
    /** Categoria de quem convidou, quando é colaborador(a). */
    category: EmployeeCategory | null;
    /** Inscrição do(a) professor(a) (nulo quando quem convidou é funcionário(a)). */
    registrationId: string | null;
    employeeId: string | null;
    /** Vínculo de convidado ativo (para desvincular quando o responsável não foi liberado). */
    guestLinkId: string;
    personId: string;
    fullName: string;
    /** Filiação do(a) professor(a); nulo quando quem convidou é funcionário(a). */
    status: AffiliationStatus | null;
    /** Pode levar convidado agora (filiação válida ou funcionário(a) na lista). */
    active: boolean;
    checkedIn: boolean;
  };
  guestKit: null | {
    /** Kit de convidado já entregue a esta pessoa (registrado no grupo de quem convidou). */
    delivered: boolean;
    deliveredAt: Date | null;
    /** O kit de convidado do grupo já saiu para outra pessoa (antes de uma troca). */
    deliveredForOther: boolean;
  };
  /** Kits guardados até este horário; depois, sobras por ordem de chegada (nulo = guardados a festa toda). */
  kitDeadline: { at: Date; passed: boolean } | null;
  /** A montagem tem kit próprio para menor de 18 (ex.: sem bebida alcoólica): o cartão diz quando entregar esse. */
  minorKit: boolean;
  /** Onde o kit sai hoje: na mesa dos kits (verdadeiro) ou junto com a entrada. */
  kitsAtDesk: boolean;
  /** Inscrição feita na hora: o kit é o da gordura (selo no cartão e no voucher). */
  walkIn: boolean;
  entry: EntryView;
  /** Só quando a entrada está liberada: a recepção já sabe se entrega kit. */
  kitOnEntry: KitOnEntry | null;
  pastGuestLinks: { hostName: string; status: "REMOVED" | "CONVERTED"; endedAt: Date | null }[];
  openAffiliationForm: {
    id: string;
    status: "DRAFT" | "FORMALIZED";
    origin: "PUBLIC" | "STAFF";
    /** Arquivos anexados por tipo (a assinatura exige RG e contracheque; a ficha do gov.br vem à parte). */
    documents: Record<DocumentKind, number>;
    files: { id: string; kind: DocumentKind; isPdf: boolean }[];
  } | null;
  permissions: {
    checkIn: boolean;
    validateAffiliation: boolean;
    deliverKits: boolean;
    manageGuests: boolean;
    newAffiliation: boolean;
    registerAtEvent: boolean;
    adminCorrections: boolean;
    manageEmployees: boolean;
  };
}

/** Kit que sai na entrada; `minors` (quantos são de menor de 18) só entra quando há. */
function willDeliver(count: 1 | 2, label: string, detail: string, minors: number): KitOnEntry {
  return minors > 0 ? { kind: "WILL_DELIVER", count, label, detail, minors } : { kind: "WILL_DELIVER", count, label, detail };
}

const minorCount = (...people: ({ isMinor: boolean } | null)[]) => people.filter((person) => person?.isMinor).length;


/** Antes das entradas, um kit na fila não "sai junto com a entrada": a portaria já vê que ele espera vagar. */
const BEFORE_ENTRY: readonly KitBlockCode[] = ["MEMBER_NOT_CHECKED_IN", "GUEST_NOT_CHECKED_IN", "HOST_NOT_CHECKED_IN"];

function kitView(reg: RegistrationState, kitType: GroupKitType, deadlinePassed: boolean): KitView {
  const view = sharedKitView(toKitView(kitAvailability(kitInput(reg, deadlinePassed), kitType)), reg.member.fullName);
  // Depois do horário dos kits guardados, a fila não espera mais: vale o "sai junto com a entrada".
  if (view.kind === "BLOCKED" && reg.kitWaitlist[kitType] && !deadlinePassed && BEFORE_ENTRY.includes(view.code)) {
    return { ...view, message: "Na fila do kit (inscrição depois que os kits acabaram): só sai se vagar kit." };
  }
  return view;
}

/** Kit dividido: o kit do convidado é o de quem convidou (o recado diz de quem). */
function sharedKitView(view: KitView, hostName: string): KitView {
  return view.kind === "BLOCKED" && view.code === "SHARED_KIT" ? { ...view, message: `Kit dividido: o de ${hostName} é para os dois.` } : view;
}

function toKitView(availability: KitAvailability): KitView {
  if (availability.kind === "DELIVERED") {
    return {
      kind: "DELIVERED",
      deliveryId: availability.delivery.id,
      at: availability.delivery.deliveredAt,
      byName: availability.delivery.deliveredByName,
      beneficiaryName: availability.delivery.beneficiaryName,
    };
  }
  if (availability.kind === "BLOCKED") return { kind: "BLOCKED", message: KIT_BLOCK_MESSAGE[availability.code], code: availability.code };
  return { kind: "AVAILABLE" };
}

function guestView(guest: ActiveGuest, guestKitBeneficiaryId: string | null): GuestView {
  return {
    guestLinkId: guest.guestLinkId,
    personId: guest.personId,
    fullName: guest.fullName,
    isMinor: guest.isMinor,
    checkedIn: Boolean(guest.checkIn),
    replaceable: guestRemovalCheck({
      guestCheckedIn: Boolean(guest.checkIn),
      guestKitDeliveredForGuest: guestKitBeneficiaryId === guest.personId,
    }).ok,
  };
}

/** Prévia dos kits na entrada de um(a) funcionário(a) ou do convidado dele(a) (estoque dos funcionários). */
function employeeKitPreview(
  state: PersonState,
  group: EmployeeGroupState,
  role: "EMPLOYEE" | "GUEST",
  deadlinePassed: boolean,
  stock: StockOverview | null,
): KitOnEntry {
  const pool = employeePoolOf(stock);
  let left = pool?.available ?? 0;
  /** null = o kit sai; texto = por que não sai. */
  const check = (kitType: EmployeeKitType, input: EmployeeKitInput): string | null => {
    const availability = employeeKitAvailability(input, kitType);
    if (availability.kind === "DELIVERED") return kitType === "GUEST" ? ENTRY_KIT_MESSAGE.GUEST_KIT_USED : ENTRY_KIT_MESSAGE.ALREADY;
    if (availability.kind === "BLOCKED") return ENTRY_KIT_MESSAGE[availability.code];
    if (!stock) return null;
    if (!pool || pool.total === 0) return ENTRY_KIT_MESSAGE.NO_EMPLOYEE_STOCK;
    if (left <= 0) return ENTRY_KIT_MESSAGE.OUT_OF_STOCK;
    left -= 1;
    return null;
  };

  if (role === "GUEST") {
    if (group.guest?.personId !== state.person.id) return { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_GUEST };
    const input = employeeKitInput(group, deadlinePassed, { guestCheckedIn: true });
    const availability = employeeKitAvailability(input, "GUEST");
    if (availability.kind === "BLOCKED" && availability.code === "HOST_NOT_CHECKED_IN") {
      return { kind: "WAITING", message: `O kit deste convidado sai quando ${group.person.fullName} chegar.` };
    }
    if (availability.kind === "BLOCKED" && availability.code === "SHARED_KIT") return { kind: "NONE", message: sharedKitMessage(group.person.fullName) };
    const reason = check("GUEST", input);
    return reason ? { kind: "NONE", message: reason } : willDeliver(1, "1 kit de convidado", KIT_TYPE_LABEL.GUEST, minorCount(state.person));
  }

  const input = employeeKitInput(group, deadlinePassed, { employeeCheckedIn: true });
  const ownReason = check("EMPLOYEE", input);
  // Convidado que chegou antes: o kit dele sai junto com esta chegada.
  const waitingGuest = group.guest?.checkIn && !group.deliveries.GUEST ? group.guest : null;
  const guestOut = waitingGuest ? check("GUEST", input) === null : false;
  if (!ownReason && guestOut) {
    const first = firstName(state.person.fullName);
    return willDeliver(
      2,
      `2 kits: o de ${first} e o do convidado ${waitingGuest!.fullName}, que já entrou`,
      `O de ${first} e o do convidado ${waitingGuest!.fullName}, que já entrou`,
      minorCount(state.person, waitingGuest),
    );
  }
  if (!ownReason) {
    const courtesy = group.category === "COURTESY";
    // Kit dividido: o kit do(a) colaborador(a) é para os dois.
    const sharedWith = EDITION.sharedKit && !courtesy && group.guest ? firstName(group.guest.fullName) : null;
    return willDeliver(
      1,
      courtesy ? "1 kit da cortesia" : sharedWith ? `1 kit de colaborador(a), para dividir com ${sharedWith}` : "1 kit de colaborador(a)",
      courtesy ? "Kit da cortesia" : sharedWith ? `${KIT_TYPE_LABEL.EMPLOYEE}, para dividir com ${sharedWith}` : KIT_TYPE_LABEL.EMPLOYEE,
      minorCount(state.person),
    );
  }
  if (guestOut) {
    return willDeliver(
      1,
      `1 kit: o do convidado ${waitingGuest!.fullName}, que já entrou`,
      `O do convidado ${waitingGuest!.fullName}, que já entrou`,
      minorCount(waitingGuest),
    );
  }
  return { kind: "NONE", message: ownReason };
}

/** Prévia dos kits na entrada: mesma regra da confirmação, mais o saldo do estoque. */
function kitOnEntryPreview(
  state: PersonState,
  role: ParticipantRole,
  deadlinePassed: boolean,
  stock: StockOverview | null,
): KitOnEntry {
  if (role === "EMPLOYEE") return employeeKitPreview(state, state.employee!, "EMPLOYEE", deadlinePassed, stock);
  if (role === "GUEST" && !state.guestOf && state.guestOfEmployee) {
    return employeeKitPreview(state, state.guestOfEmployee.host, "GUEST", deadlinePassed, stock);
  }
  const group = role === "MEMBER" ? state.ownRegistration : state.guestOf?.host;
  if (!group) return { kind: "NONE", message: ENTRY_KIT_MESSAGE.NOT_TEACHER };

  // Saldo de cada estoque, descontado kit a kit (a chegada do(a) professor(a) pode levar 2).
  const left = new Map(stock?.pools.map((p) => [p.pool, p.available]) ?? []);
  /** null = o kit sai; texto = por que não sai. */
  const check = (kitType: GroupKitType, input: KitRegistrationInput): string | null => {
    const availability = kitAvailability(input, kitType);
    if (availability.kind === "DELIVERED") return kitType === "GUEST" ? ENTRY_KIT_MESSAGE.GUEST_KIT_USED : ENTRY_KIT_MESSAGE.ALREADY;
    if (availability.kind === "BLOCKED") return ENTRY_KIT_MESSAGE[availability.code];
    if (!stock) return null;
    const pool = stockPoolFor(stock.mode, kitType);
    const available = left.get(pool) ?? 0;
    if (available <= 0) return ENTRY_KIT_MESSAGE.OUT_OF_STOCK;
    left.set(pool, available - 1);
    return null;
  };

  if (role === "GUEST") {
    if (group.guest?.personId !== state.person.id) return { kind: "NONE", message: ENTRY_KIT_MESSAGE.NO_GUEST };
    const input = kitInput(group, deadlinePassed, { guestCheckedIn: true });
    const availability = kitAvailability(input, "GUEST");
    if (availability.kind === "BLOCKED" && availability.code === "HOST_NOT_CHECKED_IN") {
      return { kind: "WAITING", message: `O kit deste convidado sai quando ${group.member.fullName} chegar.` };
    }
    if (availability.kind === "BLOCKED" && availability.code === "SHARED_KIT") return { kind: "NONE", message: sharedKitMessage(group.member.fullName) };
    const reason = check("GUEST", input);
    return reason ? { kind: "NONE", message: reason } : willDeliver(1, "1 kit de convidado", KIT_TYPE_LABEL.GUEST, minorCount(state.person));
  }

  const input = kitInput(group, deadlinePassed, { memberCheckedIn: true });
  const ownReason = check("MEMBER", input);
  // Convidado que chegou antes: o kit dele sai junto com esta chegada.
  const waitingGuest = group.guest?.checkIn && !group.deliveries.GUEST ? group.guest : null;
  const guestOut = waitingGuest ? check("GUEST", input) === null : false;
  if (!ownReason && guestOut) {
    const first = firstName(state.person.fullName);
    return willDeliver(
      2,
      `2 kits: o de ${first} e o do convidado ${waitingGuest!.fullName}, que já entrou`,
      `O de ${first} e o do convidado ${waitingGuest!.fullName}, que já entrou`,
      minorCount(state.person, waitingGuest),
    );
  }
  // Kit dividido: o kit de quem chega é para os dois.
  const sharedWith = EDITION.sharedKit && group.guest ? firstName(group.guest.fullName) : null;
  if (!ownReason) {
    return sharedWith
      ? willDeliver(1, `1 kit de consumação, para dividir com ${sharedWith}`, `${KIT_TYPE_LABEL.MEMBER}, para dividir com ${sharedWith}`, minorCount(state.person))
      : willDeliver(1, "1 kit de consumação", KIT_TYPE_LABEL.MEMBER, minorCount(state.person));
  }
  if (guestOut) {
    return willDeliver(
      1,
      `1 kit: o do convidado ${waitingGuest!.fullName}, que já entrou`,
      `O do convidado ${waitingGuest!.fullName}, que já entrou`,
      minorCount(waitingGuest),
    );
  }
  return { kind: "NONE", message: ownReason };
}

/** Prévia do kit na entrada: no modo mesa, só o recado "kit na mesa" (ou por que não tem kit). */
function entryKitPreview(
  state: PersonState,
  role: ParticipantRole,
  config: Parameters<typeof buildGateView>[2],
  now: Date,
  deadlinePassed: boolean,
  stock: StockOverview | null,
): KitOnEntry {
  if (!config?.kitsAtDesk) return kitOnEntryPreview(state, role, deadlinePassed, stock);
  const desk = evaluateDeskKit(state, { stockMode: "SINGLE", ...config, kitsAtDesk: true }, now, null, { enteringAs: role });
  if (desk.kind === "READY") return { kind: "AT_DESK", extra: desk.extra, minor: desk.minor };
  if (desk.kind === "DELIVERED") return { kind: "NONE", message: ENTRY_KIT_MESSAGE.ALREADY };
  if (desk.kind === "BLOCKED") return { kind: "NONE", message: desk.message };
  return { kind: "NONE", message: "Sem kit." };
}

function hostView(state: PersonState): GateView["host"] {
  if (state.guestOf) {
    const host = state.guestOf.host;
    return {
      kind: "MEMBER",
      registrationId: host.id,
      employeeId: null,
      category: null,
      guestLinkId: state.guestOf.guestLinkId,
      personId: host.member.id,
      fullName: host.member.fullName,
      status: host.status,
      active: isActiveMember(host.status),
      checkedIn: Boolean(host.memberCheckIn),
    };
  }
  if (state.guestOfEmployee) {
    const host = state.guestOfEmployee.host;
    return {
      kind: "EMPLOYEE",
      registrationId: null,
      employeeId: host.id,
      category: host.category,
      guestLinkId: state.guestOfEmployee.guestLinkId,
      personId: host.person.id,
      fullName: host.person.fullName,
      status: null,
      active: host.active,
      checkedIn: Boolean(host.checkIn),
    };
  }
  return null;
}

/** DTO com apenas o necessário para a portaria (CPF mascarado para Segurança). */
export function buildGateView(
  state: PersonState,
  access: AccessMap,
  config: Pick<EventConfig, "eventDate" | "startTime" | "kitDeadlineTime" | "kitPlan"> &
    Partial<Pick<EventConfig, "stockMode" | "kitsAtDesk">> | null,
  now = new Date(),
  stock: StockOverview | null = null,
): GateView {
  const decision = entryDecisionFor(state);
  const entry: EntryView =
    decision.kind === "ALREADY_IN"
      ? {
          kind: "ALREADY_IN",
          at: decision.checkIn.checkedInAt,
          byName: decision.checkIn.checkedInByName,
          method: decision.checkIn.method,
        }
      : decision.kind === "ALLOWED"
        ? { kind: "ALLOWED", role: decision.role }
        : { kind: "BLOCKED", code: decision.code, ...ENTRY_BLOCK_MESSAGE[decision.code] };

  const deadlineAt = config ? kitDeadlineAt(config) : null;
  const deadlinePassed = isKitDeadlinePassed(config, now);

  const own = state.ownRegistration;
  // Mesma regra da entrada: funcionário(a) na lista e filiação válida prevalecem;
  // enquanto a filiação não for confirmada, quem está vinculado a alguém participa como convidado.
  let participantRole: GateView["role"] = "NONE";
  if (state.employee?.active) participantRole = "EMPLOYEE";
  else if (own && isActiveMember(own.status)) participantRole = "MEMBER";
  else if (state.guestOf || state.guestOfEmployee) participantRole = "GUEST";
  else if (own) participantRole = "MEMBER";
  const staffGroup = state.employee;

  const hostGuestDelivery = state.guestOf?.host.deliveries.GUEST ?? state.guestOfEmployee?.host.deliveries.GUEST;
  const guestKitIsMine = Boolean(hostGuestDelivery && hostGuestDelivery.beneficiaryPersonId === state.person.id);
  const isGuest = Boolean(state.guestOf || state.guestOfEmployee);

  return {
    personId: state.person.id,
    fullName: state.person.fullName,
    cpf: displayCpf(state.person.cpf, can(access, "viewFullCpf")),
    hasCpf: Boolean(state.person.cpf),
    isMinor: state.person.isMinor,
    voucherCode: state.voucher ? formatVoucherCode(state.voucher.code) : null,
    role: participantRole,
    ownRegistration: own
      ? {
          id: own.id,
          status: own.status,
          isTeacher: own.isTeacher,
          canHaveGuest: canHaveGuest(own),
          guest: own.guest ? guestView(own.guest, own.deliveries.GUEST?.beneficiaryPersonId ?? null) : null,
          kits: { MEMBER: kitView(own, "MEMBER", deadlinePassed), GUEST: kitView(own, "GUEST", deadlinePassed) },
        }
      : null,
    employee: staffGroup
      ? {
          employeeId: staffGroup.id,
          active: staffGroup.active,
          jobTitle: staffGroup.jobTitle,
          category: staffGroup.category,
          guest: staffGroup.guest ? guestView(staffGroup.guest, staffGroup.deliveries.GUEST?.beneficiaryPersonId ?? null) : null,
          kits: {
            EMPLOYEE: toKitView(employeeKitAvailability(employeeKitInput(staffGroup, deadlinePassed), "EMPLOYEE")),
            GUEST: sharedKitView(toKitView(employeeKitAvailability(employeeKitInput(staffGroup, deadlinePassed), "GUEST")), staffGroup.person.fullName),
          },
          withKit: staffGroup.withKit,
          broughtBy: staffGroup.broughtBy
            ? { personId: staffGroup.broughtBy.personId, fullName: staffGroup.broughtBy.fullName, category: staffGroup.broughtBy.category }
            : null,
          companions: staffGroup.companions.map((c) => ({
            employeeId: c.employeeId,
            personId: c.personId,
            fullName: c.fullName,
            isMinor: c.isMinor,
            checkedIn: c.checkedIn,
          })),
        }
      : null,
    host: hostView(state),
    guestKit: isGuest
      ? {
          delivered: guestKitIsMine,
          deliveredAt: guestKitIsMine ? hostGuestDelivery!.deliveredAt : null,
          deliveredForOther: Boolean(hostGuestDelivery && !guestKitIsMine),
        }
      : null,
    kitDeadline: deadlineAt ? { at: deadlineAt, passed: deadlinePassed } : null,
    minorKit: hasMinorKit(config),
    kitsAtDesk: Boolean(config?.kitsAtDesk),
    walkIn: walkInOf(state),
    entry,
    kitOnEntry: entry.kind === "ALLOWED" ? entryKitPreview(state, entry.role, config, now, deadlinePassed, stock) : null,
    eventStart: config
      ? { started: hasEventStarted(config, now), label: eventStartLabel(config), at: eventStartAt(config)?.toISOString() ?? null }
      : { started: true, label: null, at: null },
    pastGuestLinks: state.pastGuestLinks.map((p) => ({ hostName: p.hostName, status: p.status, endedAt: p.endedAt })),
    openAffiliationForm: state.openAffiliationForm,
    permissions: {
      checkIn: can(access, "checkIn"),
      validateAffiliation: can(access, "validateAffiliation"),
      deliverKits: can(access, "deliverKits"),
      manageGuests: can(access, "manageGuests"),
      newAffiliation: can(access, "newAffiliation"),
      registerAtEvent: can(access, "registerAtEvent"),
      adminCorrections: can(access, "adminCorrections"),
      manageEmployees: can(access, "manageEmployees"),
    },
  };
}

/** Carrega a pessoa e monta a visão da portaria. */
export async function loadGateView(ex: Executor, personId: string, access: AccessMap): Promise<GateView | null> {
  const [state, config, stock] = await Promise.all([loadPersonState(ex, personId), getEventConfig(ex), getStockOverview(ex)]);
  return state ? buildGateView(state, access, config, new Date(), stock) : null;
}
