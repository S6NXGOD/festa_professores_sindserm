"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { FormField } from "@/components/forms/form-field";
import { CpfInput, PhoneInput } from "@/components/forms/masked-input";
import {
  Building,
  Cancel,
  Check,
  ClipboardNote,
  Clock,
  ExternalLink,
  Gift,
  Link as LinkIcon,
  Loader,
  Pencil,
  Printer,
  QrCode,
  Reload,
  Search,
  Teach,
  Trash,
  Undo,
  Unlink,
  User,
  Users,
  Warning,
} from "@/components/icons/pixel";
import { FormDocuments } from "@/components/documents/form-documents";
import { TeacherQuestion } from "@/components/registration/wizard-parts";
import { Panel, PixelTag, PlayerTag } from "@/components/retro/bits";
import { DeadlineTimer } from "@/components/retro/countdown";
import { AffiliationBadge, ToneBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DOCUMENT_KIND_LABEL, EMPLOYEE_CATEGORY_TITLE, KIT_TYPE_LABEL } from "@/domain/labels";
import type { KitType } from "@/domain/types";
import { callAction } from "@/lib/call-action";
import { formatShortDateTime } from "@/lib/datetime";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { cancelAffiliationFormAction, formalizeAffiliationAction } from "@/server/actions/affiliation-forms";
import {
  cancelCheckInAction,
  cancelDeliveryAction,
  confirmAfterProofAction,
  decideAffiliationAction,
  deliverKitAction,
  linkPersonAsGuestAction,
  type MemberOption,
  registerDeclaredMemberAction,
  reissueVoucherAction,
  removeGuestAction,
  reopenAffiliationAction,
  searchMembersAction,
  setTeacherStatusAction,
} from "@/server/actions/operations";
import type { GateView, GuestView, KitView } from "@/server/services/gate-view";
import { AddGuestDialog } from "./add-guest-dialog";
import { KitStatusText } from "./gate-result";

export interface PersonOperationsProps {
  view: GateView;
  /** Base para links de pessoas: "/portaria/pessoa" ou "/painel/participantes". */
  personBasePath: string;
  onChanged?: () => void;
  /** A filiação acabou de ser confirmada (na portaria: perguntar se registra a entrada). */
  onEntryUnlocked?: () => void;
}

const isActive = (status?: string) => status === "CONFIRMED" || status === "JOINED_AT_EVENT";

export function PersonOperations({ view, personBasePath, onChanged, onEntryUnlocked }: PersonOperationsProps) {
  const unlocked = () => {
    onChanged?.();
    onEntryUnlocked?.();
  };
  const own = view.ownRegistration;
  const p = view.permissions;
  const host = view.host;

  if (view.employee) {
    const staffGroup = view.employee;
    return (
      <div className="scroll-mt-20 space-y-4" id="person-operations">
        <EmployeeSection view={view} />
        {staffGroup.active && p.deliverKits ? (
          <GroupKitsSection
            view={view}
            intro="Os kits saem sozinhos com as entradas, do estoque dos colaboradores. O do convidado só sai depois que o(a) colaborador(a) chegar: se o convidado chegou antes, o kit dele sai junto com a entrada do(a) colaborador(a)."
            cards={[
              { type: "EMPLOYEE", label: KIT_TYPE_LABEL.EMPLOYEE, detail: `Para ${view.fullName}, na entrada dele(a)`, state: staffGroup.kits.EMPLOYEE },
              {
                type: "GUEST",
                label: KIT_TYPE_LABEL.GUEST,
                detail: guestKitDetail(staffGroup.kits.GUEST, staffGroup.guest),
                state: staffGroup.kits.GUEST,
                guestName: staffGroup.guest?.fullName,
              },
            ]}
            onChanged={onChanged}
          />
        ) : null}
        {p.manageGuests ? (
          <GuestSection
            view={view}
            host={{ employeeId: staffGroup.employeeId }}
            guest={staffGroup.guest}
            canHaveGuest={staffGroup.active}
            emptyText="Sem convidado. Cada colaborador(a) pode levar um."
            blockedText="Fora da lista de colaboradores: não é possível cadastrar convidado."
            personBasePath={personBasePath}
            onChanged={onChanged}
          />
        ) : null}
        {p.adminCorrections ? <AdminSection view={view} onChanged={onChanged} /> : null}
      </div>
    );
  }

  return (
    <div className="scroll-mt-20 space-y-4" id="person-operations">
      {own?.status === "PENDING" && p.validateAffiliation ? (
        <VerifySection view={view} onChanged={onChanged} onConfirmed={unlocked} />
      ) : null}
      {own?.status === "REJECTED" && p.validateAffiliation ? <ProofSection view={view} onConfirmed={unlocked} /> : null}
      {own?.status === "AWAITING_SIGNATURE" && p.newAffiliation && view.openAffiliationForm ? (
        <SignatureSection view={view} formId={view.openAffiliationForm.id} onChanged={onChanged} onConfirmed={unlocked} />
      ) : null}

      {host?.kind === "EMPLOYEE" && !host.active && p.manageGuests ? (
        <Panel title="Colaborador(a) responsável fora da lista" icon={Unlink}>
          <p className="mb-3 text-sm text-fg-muted">
            {host.fullName} saiu da lista de colaboradores do SINDSERM, então {view.fullName} não entra como convidado(a) dele(a).
            Desvincule para ligar a outra pessoa ou fazer a filiação.
          </p>
          <ConfirmActionDialog
            trigger={
              <Button variant="outline" data-testid="unlink-from-host">
                <Unlink /> Desvincular
              </Button>
            }
            title="Desvincular de quem convidou?"
            description={`${view.fullName} deixa de ser convidado(a) de ${host.fullName}. O vínculo fica no histórico.`}
            confirmLabel="Desvincular"
            tone="danger"
            onConfirm={() => removeGuestAction({ guestLinkId: host.guestLinkId })}
            successMessage="Convidado(a) desvinculado(a)."
            onDone={onChanged}
          />
        </Panel>
      ) : null}

      {host?.kind === "MEMBER" && host.status !== "REJECTED" && !isActive(host.status ?? undefined) && p.validateAffiliation ? (
        <Panel title="Responsável ainda não liberado" icon={Clock}>
          <p className="mb-3 text-sm text-fg-muted">
            A entrada do convidado depende da filiação de {host.fullName} (
            {host.status === "AWAITING_SIGNATURE" ? "ficha para assinar" : "aguardando conferência"}).
          </p>
          <Button asChild variant="outline">
            <Link href={`${personBasePath}/${host.personId}`}>
              <ExternalLink /> Abrir cadastro do responsável
            </Link>
          </Button>
        </Panel>
      ) : null}

      {host?.kind === "MEMBER" && host.status === "REJECTED" && p.manageGuests ? (
        <Panel title="Responsável sem filiação confirmada" icon={Unlink}>
          <p className="mb-3 text-sm text-fg-muted">
            A filiação de {host.fullName} não foi confirmada, então {view.fullName} não entra como convidado(a) nesse grupo.
            Desvincule para ligar a outro(a) professor(a) ou fazer a filiação.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ConfirmActionDialog
              trigger={
                <Button variant="outline" data-testid="unlink-from-host">
                  <Unlink /> Desvincular
                </Button>
              }
              title="Desvincular do responsável?"
              description={`${view.fullName} deixa de ser convidado(a) de ${host.fullName}. O vínculo fica no histórico.`}
              confirmLabel="Desvincular"
              tone="danger"
              onConfirm={() => removeGuestAction({ guestLinkId: host.guestLinkId })}
              successMessage="Convidado(a) desvinculado(a)."
              onDone={onChanged}
            />
            <Button asChild variant="outline">
              <Link href={`${personBasePath}/${host.personId}`}>
                <ExternalLink /> Abrir responsável
              </Link>
            </Button>
          </div>
        </Panel>
      ) : null}

      {own && isActive(own.status) && own.isTeacher && p.deliverKits ? <KitsSection view={view} onChanged={onChanged} /> : null}
      {own && p.manageGuests ? <PlayerTwoSection view={view} personBasePath={personBasePath} onChanged={onChanged} /> : null}

      <MembershipSection view={view} onChanged={onChanged} />

      {p.adminCorrections ? <AdminSection view={view} onChanged={onChanged} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Colaborador(a) do SINDSERM: categoria, setor, convidado e voucher. */
function EmployeeSection({ view }: { view: GateView }) {
  const staffGroup = view.employee!;
  const p = view.permissions;
  return (
    <Panel title={EMPLOYEE_CATEGORY_TITLE[staffGroup.category]} icon={Building} action={<PixelTag tone="warning">Da casa</PixelTag>}>
      {staffGroup.active ? (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <dt className="text-[0.68rem] font-bold tracking-[0.08em] text-fg-dim uppercase">Setor</dt>
              <dd className="font-semibold text-fg">{staffGroup.jobTitle ?? "Não informado"}</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <dt className="text-[0.68rem] font-bold tracking-[0.08em] text-fg-dim uppercase">Direitos</dt>
              <dd className="font-semibold text-fg">1 kit + 1 convidado (com kit)</dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {p.manageGuests ? (
              <Button asChild variant="outline">
                <Link href={`/painel/participantes/${view.personId}/voucher`} data-testid="employee-voucher-link">
                  <QrCode /> Ver / enviar vouchers
                </Link>
              </Button>
            ) : null}
            {p.manageEmployees ? (
              <Button asChild variant="ghost">
                <Link href="/painel/colaboradores">
                  <Users /> Lista de colaboradores
                </Link>
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-fg-muted">
          {view.fullName} foi tirado(a) da lista de colaboradores: o voucher não vale mais.{" "}
          {p.manageEmployees ? (
            <Link href="/painel/colaboradores?filtro=removidos" className="font-semibold text-fg underline underline-offset-4">
              Ver na lista de colaboradores
            </Link>
          ) : (
            "Procure a organização."
          )}
        </p>
      )}
    </Panel>
  );
}

function guestKitDetail(kit: KitView, guest: GuestView | null) {
  if (kit.kind === "DELIVERED") return `Para ${kit.beneficiaryName}`;
  return guest ? `Para ${guest.fullName}, quando os dois já chegaram` : "Para o convidado, quando os dois já chegaram";
}

function VerifySection({ view, onChanged, onConfirmed }: { view: GateView; onChanged?: () => void; onConfirmed: () => void }) {
  const own = view.ownRegistration!;
  return (
    <Panel title="Conferência de filiação" icon={Check} tone="red">
      <p className="mb-4 text-sm text-fg-muted">
        Confira se {view.fullName} é filiado(a) antes de liberar a entrada. Declarou ser{" "}
        <strong className="text-fg">{own.isTeacher ? "professor(a)" : "não professor(a)"}</strong>.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ConfirmActionDialog
          trigger={
            <Button variant="success" size="lg" data-testid="confirm-affiliation">
              <Check /> Confirmar filiação
            </Button>
          }
          title="Confirmar filiação?"
          description={`${view.fullName} passa a ter direito à entrada${own.isTeacher ? ", ao kit e a um convidado" : " (sem kit, por não ser professor(a))"}.`}
          confirmLabel="Confirmar filiação"
          tone="success"
          sound="coin"
          onConfirm={() => decideAffiliationAction({ registrationId: own.id, decision: "CONFIRM" })}
          successMessage="Filiação confirmada."
          onDone={onConfirmed}
        />
        <ConfirmActionDialog
          trigger={
            <Button variant="destructive" size="lg" data-testid="reject-affiliation">
              <Cancel /> Não confirmar
            </Button>
          }
          title="Não confirmar a filiação?"
          description="A pessoa não entra como filiada. Ainda pode ser convidada de um(a) professor(a) ou fazer a filiação na hora."
          confirmLabel="Não confirmar"
          tone="danger"
          justification="optional"
          justificationLabel="Observação"
          onConfirm={(note) => decideAffiliationAction({ registrationId: own.id, decision: "REJECT", note })}
          successMessage="Filiação marcada como não confirmada."
          onDone={onChanged}
        />
      </div>
    </Panel>
  );
}

/** Filiação "não confirmada", mas a pessoa comprova na hora que é filiada. */
function ProofSection({ view, onConfirmed }: { view: GateView; onConfirmed: () => void }) {
  const own = view.ownRegistration!;
  const firstName = view.fullName.split(" ")[0];
  return (
    <Panel title="Comprovou que é filiado(a)?" icon={Check} tone="red">
      <p className="mb-4 text-sm text-fg-muted">
        A filiação de {firstName} foi marcada como não confirmada. Se {firstName} mostrar agora um comprovante (por exemplo, o
        contracheque com o desconto do SINDSERM), confirme aqui: a entrada é liberada na hora.
      </p>
      <ConfirmActionDialog
        trigger={
          <Button variant="success" size="lg" className="w-full sm:w-auto" data-testid="confirm-after-proof">
            <Check /> Comprovou: confirmar filiação
          </Button>
        }
        title="Confirmar a filiação?"
        description={`${view.fullName} passa a ter direito à entrada${own.isTeacher ? ", ao kit de consumação e a 1 convidado" : ""}. Escreva como a pessoa comprovou (fica na auditoria).`}
        confirmLabel="Confirmar filiação"
        tone="success"
        sound="fanfare"
        justification="required"
        justificationLabel="Como comprovou? (ex.: contracheque com o desconto do SINDSERM)"
        onConfirm={(text) => confirmAfterProofAction({ registrationId: own.id, justification: text })}
        successMessage="Filiação confirmada. Pode entrar!"
        onDone={onConfirmed}
      />
    </Panel>
  );
}

function SignatureSection({
  view,
  formId,
  onChanged,
  onConfirmed,
}: {
  view: GateView;
  formId: string;
  onChanged?: () => void;
  onConfirmed: () => void;
}) {
  const form = view.openAffiliationForm;
  const missing = (["RG", "PAYSLIP"] as const).filter((kind) => !form?.documents[kind]);
  return (
    <Panel title="Ficha para assinar" icon={ClipboardNote} tone="red">
      <p className="mb-4 text-sm text-fg-muted">
        {view.fullName} preencheu a ficha de filiação antes da festa. Confira o RG e o contracheque, imprima, colha a
        assinatura da autorização de desconto e confirme — a entrada é liberada na hora.
      </p>
      {form ? (
        <div className="mb-4">
          <FormDocuments formId={form.id} files={form.files} canRemove onChanged={onChanged} />
          {missing.length ? (
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-warning" data-testid="gate-missing-documents">
              <Warning className="size-4 shrink-0" /> Falta: {missing.map((kind) => DOCUMENT_KIND_LABEL[kind]).join(" e ")}. Tire a foto
              acima para liberar a assinatura.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline" size="lg">
          <Link href={`/painel/filiacoes/${formId}/imprimir`} target="_blank" data-testid="print-ficha">
            <Printer /> Imprimir ficha
          </Link>
        </Button>
        <ConfirmActionDialog
          trigger={
            <Button variant="success" size="lg" data-testid="confirm-signature" disabled={missing.length > 0}>
              <Pencil /> Assinatura colhida
            </Button>
          }
          title="A ficha foi assinada?"
          description={`Confirme só depois que a ficha impressa estiver assinada. ${view.fullName} passa a ser filiado(a) na festa.`}
          confirmLabel="Confirmar assinatura"
          tone="success"
          sound="fanfare"
          onConfirm={() => formalizeAffiliationAction(formId)}
          successMessage="Filiação registrada. Bem-vindo(a) ao SINDSERM!"
          onDone={onConfirmed}
        />
        <Button asChild variant="ghost">
          <Link href={`/painel/filiacoes/${formId}`}>
            <ClipboardNote /> Revisar dados da ficha
          </Link>
        </Button>
        <ConfirmActionDialog
          trigger={
            <Button variant="ghost" className="text-danger">
              <Cancel /> Não vai assinar
            </Button>
          }
          title="Cancelar a ficha?"
          description="A ficha deixa de valer e a inscrição não libera a entrada como filiado(a). Os dados ficam no histórico."
          confirmLabel="Cancelar ficha"
          tone="danger"
          onConfirm={() => cancelAffiliationFormAction(formId)}
          successMessage="Ficha cancelada."
          onDone={onChanged}
        />
      </div>
    </Panel>
  );
}

function KitsSection({ view, onChanged }: { view: GateView; onChanged?: () => void }) {
  const own = view.ownRegistration!;
  return (
    <GroupKitsSection
      view={view}
      intro="Os kits saem sozinhos com as entradas e o estoque baixa na hora. O do convidado só sai depois que o(a) professor(a) chegar: se o convidado chegou antes, o kit dele sai junto com a entrada do(a) professor(a)."
      cards={[
        { type: "MEMBER", label: KIT_TYPE_LABEL.MEMBER, detail: `Para ${view.fullName}, na entrada dele(a)`, state: own.kits.MEMBER },
        {
          type: "GUEST",
          label: KIT_TYPE_LABEL.GUEST,
          detail: guestKitDetail(own.kits.GUEST, own.guest),
          state: own.kits.GUEST,
          guestName: own.guest?.fullName,
        },
      ]}
      onChanged={onChanged}
    />
  );
}

interface KitCard {
  type: KitType;
  label: string;
  detail: string;
  state: KitView;
  guestName?: string;
}

/** Kits do grupo de quem convidou (professor(a) ou funcionário(a)): o dele(a) e o do convidado. */
function GroupKitsSection({
  view,
  cards,
  intro,
  onChanged,
}: {
  view: GateView;
  cards: KitCard[];
  intro: string;
  onChanged?: () => void;
}) {
  return (
    <Panel
      title="Kits de consumação"
      icon={Gift}
      action={
        view.kitDeadline ? (
          <span
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
              view.kitDeadline.passed ? "border-danger/50" : "border-line-strong",
            )}
          >
            <Clock className="size-4 text-red" />
            <DeadlineTimer deadline={view.kitDeadline.at} />
          </span>
        ) : null
      }
    >
      <p className="mb-3 text-sm text-fg-muted">{intro}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((kit) => {
          const state = kit.state;
          return (
            <div
              key={kit.type}
              className={cn(
                "flex flex-col gap-3 rounded-xl border-2 p-4",
                state.kind === "DELIVERED"
                  ? "border-success/40 bg-success-soft"
                  : state.kind === "AVAILABLE"
                    ? "border-red/50 bg-brand-soft"
                    : "border-line bg-surface-2",
              )}
            >
              <div>
                <p className="display text-xl text-fg">{kit.label}</p>
                <p className="text-sm text-fg-muted">{kit.detail}</p>
                <p className="mt-2 text-sm">
                  <KitStatusText kit={state} />
                </p>
              </div>
              {state.kind === "AVAILABLE" ? (
                <ConfirmActionDialog
                  trigger={
                    <Button size="lg" data-testid={`deliver-${kit.type.toLowerCase()}-kit`}>
                      <Gift /> Entregar agora
                    </Button>
                  }
                  title={`Entregar o ${kit.label.toLowerCase()} agora?`}
                  description={
                    kit.type === "GUEST"
                      ? `O kit de ${kit.guestName ?? "convidado"} não saiu junto com as entradas (ex.: o estoque tinha acabado). Entregue agora.`
                      : `O kit de ${view.fullName} não saiu na entrada (ex.: o estoque tinha acabado). Entregue agora.`
                  }
                  confirmLabel="Registrar entrega"
                  tone="success"
                  sound="powerup"
                  onConfirm={async () => {
                    const result = await callAction(deliverKitAction({ personId: view.personId, kitType: kit.type }));
                    if (result.ok && result.data.stock.low) {
                      toast.warning(`Estoque baixo: restam ${result.data.stock.available} kits.`);
                    }
                    return result;
                  }}
                  successMessage="Entrega registrada."
                  onDone={onChanged}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function PlayerTwoSection({ view, personBasePath, onChanged }: { view: GateView; personBasePath: string; onChanged?: () => void }) {
  const own = view.ownRegistration!;

  if (!own.isTeacher) {
    return (
      <Panel title="Convidado" icon={Users}>
        <p className="text-sm text-fg-muted">
          Filiado(a) que não é professor(a): participa sem kit de consumação e sem convidado. Se foi marcado por engano, corrija
          em Atendimento.
        </p>
      </Panel>
    );
  }

  return (
    <GuestSection
      view={view}
      host={{ registrationId: own.id }}
      guest={own.guest}
      canHaveGuest={own.canHaveGuest}
      emptyText="Sem convidado. Cada professor(a) pode levar um."
      blockedText="Filiação não confirmada: não é possível cadastrar convidado."
      personBasePath={personBasePath}
      onChanged={onChanged}
    />
  );
}

/** Convidado (Player 2) de quem convidou: professor(a) ou funcionário(a) do SINDSERM. */
function GuestSection({
  view,
  host,
  guest,
  canHaveGuest,
  emptyText,
  blockedText,
  personBasePath,
  onChanged,
}: {
  view: GateView;
  host: { registrationId?: string; employeeId?: string };
  guest: GuestView | null;
  canHaveGuest: boolean;
  emptyText: string;
  blockedText: string;
  personBasePath: string;
  onChanged?: () => void;
}) {
  return (
    <Panel title="Convidado" icon={Users} action={<PlayerTag player={2} />}>
      {guest ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5" data-testid="player2-card">
          <div className="min-w-[11rem] flex-1">
            <Link href={`${personBasePath}/${guest.personId}`} className="font-bold text-fg hover:text-red hover:underline">
              {guest.fullName}
            </Link>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {guest.isMinor ? (
                <ToneBadge tone="warning" icon={Warning}>
                  Menor
                </ToneBadge>
              ) : null}
              <ToneBadge tone={guest.checkedIn ? "success" : "neutral"}>{guest.checkedIn ? "Presente" : "Não entrou"}</ToneBadge>
            </div>
          </div>
          {canHaveGuest && guest.replaceable ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/participantes/${guest.personId}/voucher`} aria-label={`Voucher de ${guest.fullName}`}>
                  <QrCode /> Voucher
                </Link>
              </Button>
              <AddGuestDialog
                host={host}
                holderName={view.fullName}
                replace={{ guestLinkId: guest.guestLinkId, fullName: guest.fullName }}
                onDone={onChanged}
              />
              <ConfirmActionDialog
                trigger={
                  <Button variant="ghost" size="icon-sm" className="text-fg-muted hover:text-danger" aria-label={`Remover ${guest.fullName}`}>
                    <Trash />
                  </Button>
                }
                title={`Remover ${guest.fullName}?`}
                description="O convidado deixa de ser convidado e o QR Code dele é cancelado. O histórico é mantido."
                confirmLabel="Remover convidado"
                tone="danger"
                onConfirm={() => removeGuestAction({ guestLinkId: guest.guestLinkId })}
                successMessage="Convidado removido."
                onDone={onChanged}
              />
            </div>
          ) : !guest.replaceable ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/painel/participantes/${guest.personId}/voucher`} aria-label={`Voucher de ${guest.fullName}`}>
                <QrCode /> Voucher
              </Link>
            </Button>
          ) : null}
          {!guest.replaceable ? (
            <p className="w-full text-xs text-fg-dim">
              {guest.checkedIn ? "Já entrou: não pode ser trocado." : "O kit dele já saiu: troca só com estorno do administrador."}
            </p>
          ) : null}
        </div>
      ) : canHaveGuest ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-line p-4">
          <p className="text-sm text-fg-muted">{emptyText}</p>
          <AddGuestDialog host={host} holderName={view.fullName} onDone={onChanged} />
        </div>
      ) : (
        <p className="text-sm text-fg-muted">{blockedText}</p>
      )}
    </Panel>
  );
}

/**
 * Correção da resposta "é professor(a)?" do(a) filiado(a) (com confirmação e
 * auditoria). Ex.: marcou "professor(a)" por engano, ou a conferência mostrou o contrário.
 */
function TeacherToggle({ view, onChanged }: { view: GateView; onChanged?: () => void }) {
  const own = view.ownRegistration!;
  const next = !own.isTeacher;
  return (
    <ConfirmActionDialog
      trigger={
        <Button variant="outline" data-testid="toggle-teacher">
          <Teach /> {next ? "Corrigir: é professor(a)" : "Corrigir: não é professor(a)"}
        </Button>
      }
      title={next ? `${view.fullName} é professor(a)?` : `${view.fullName} não é professor(a)?`}
      description={
        next
          ? "Passa a ter direito ao kit de consumação e a levar 1 convidado."
          : "Perde o direito ao kit de consumação e ao convidado. Só dá para corrigir se nenhum kit foi entregue e não houver convidado cadastrado."
      }
      confirmLabel={next ? "Sim, é professor(a)" : "Sim, não é professor(a)"}
      onConfirm={() => setTeacherStatusAction({ registrationId: own.id, isTeacher: next })}
      successMessage="Resposta corrigida."
      onDone={onChanged}
    />
  );
}

// ---------------------------------------------------------------------------

function MembershipSection({ view, onChanged }: { view: GateView; onChanged?: () => void }) {
  const own = view.ownRegistration;
  const p = view.permissions;
  const active = isActive(own?.status);
  const canNewAffiliation = p.newAffiliation && !active && own?.status !== "AWAITING_SIGNATURE";
  const canDeclare = p.registerAtEvent && !own && view.role === "GUEST";
  const canLinkAsGuest = p.manageGuests && !view.host && (!own || own.status === "REJECTED");

  const canToggleTeacher = Boolean(own) && p.manageGuests && own?.status !== "REJECTED";
  if (!canNewAffiliation && !canDeclare && !canLinkAsGuest && !p.manageGuests) return null;

  return (
    <Panel title="Atendimento" icon={ClipboardNote}>
      <div className="grid gap-2 sm:grid-cols-2">
        {canNewAffiliation ? (
          <Button asChild variant="secondary">
            <Link
              href={
                view.openAffiliationForm
                  ? `/painel/filiacoes/${view.openAffiliationForm.id}`
                  : `/painel/filiacoes/nova?pessoa=${view.personId}`
              }
            >
              <ClipboardNote /> {view.openAffiliationForm ? "Continuar ficha de filiação" : "Fazer ficha de filiação"}
            </Link>
          </Button>
        ) : null}
        {canDeclare ? <DeclaredMemberDialog view={view} onChanged={onChanged} /> : null}
        {canToggleTeacher ? <TeacherToggle view={view} onChanged={onChanged} /> : null}
        {canLinkAsGuest ? <LinkAsGuestDialog view={view} onChanged={onChanged} /> : null}
        {p.manageGuests ? (
          <>
            <Button asChild variant="outline">
              <Link href={`/painel/participantes/${view.personId}/voucher`}>
                <QrCode /> Ver / imprimir voucher
              </Link>
            </Button>
            <ConfirmActionDialog
              trigger={
                <Button variant="outline">
                  <Reload /> Reemitir QR Code
                </Button>
              }
              title="Reemitir o QR Code?"
              description="O QR Code atual deixa de funcionar e um novo voucher é gerado para esta pessoa."
              confirmLabel="Reemitir"
              onConfirm={() => reissueVoucherAction(view.personId)}
              successMessage="Novo QR Code emitido."
              onDone={onChanged}
            />
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function DeclaredMemberDialog({ view, onChanged }: { view: GateView; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [cpf, setCpf] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [workplace, setWorkplace] = useState("");
  const [isTeacher, setIsTeacher] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await callAction(
        registerDeclaredMemberAction({
          personId: view.personId,
          cpf: view.hasCpf ? undefined : cpf,
          whatsapp,
          registrationNumber,
          workplace,
          isTeacher: isTeacher as boolean,
        }),
      );
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        playSound("error");
        toast.error(result.error);
        return;
      }
      toast.success("Cadastrado(a) como filiado(a). Agora faça a conferência.");
      setOpen(false);
      onChanged?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <User /> Já é filiado(a)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar como filiado(a)</DialogTitle>
          <DialogDescription>
            Para quem já é filiado(a) mas estava só como convidado(a). A filiação fica aguardando conferência e, até lá, a
            pessoa continua como convidada{view.host ? ` de ${view.host.fullName}` : ""}. Confirmada a filiação, a vaga de
            convidado de quem convidou fica livre.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!view.hasCpf ? (
            <FormField
              id="declared-cpf"
              label="CPF"
              description="Foi cadastrado(a) como convidado(a) sem CPF: para filiados, o CPF é obrigatório."
              error={errors.cpf}
            >
              <CpfInput id="declared-cpf" value={cpf} onChange={setCpf} />
            </FormField>
          ) : null}
          <FormField id="declared-whatsapp" label="WhatsApp" error={errors.whatsapp}>
            <PhoneInput id="declared-whatsapp" value={whatsapp} onChange={setWhatsapp} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="declared-registration" label="Matrícula" error={errors.registrationNumber}>
              <Input id="declared-registration" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
            </FormField>
            <FormField id="declared-workplace" label="Lotação" error={errors.workplace}>
              <Input id="declared-workplace" value={workplace} onChange={(e) => setWorkplace(e.target.value)} />
            </FormField>
          </div>
          <TeacherQuestion value={isTeacher} onChange={setIsTeacher} error={errors.isTeacher} subject="A pessoa" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending || isTeacher === null}>
            {pending ? <Loader className="animate-spin-steps" /> : <Check />} Cadastrar como filiado(a)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkAsGuestDialog({ view, onChanged }: { view: GateView; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberOption[] | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      const result = await callAction(searchMembersAction(query));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setResults(result.data);
    });
  }

  function link(member: MemberOption) {
    startTransition(async () => {
      const result = await callAction(linkPersonAsGuestAction({ personId: view.personId, registrationId: member.registrationId }));
      if (!result.ok) {
        playSound("error");
        toast.error(result.error);
        return;
      }
      playSound("powerup");
      toast.success(`${view.fullName} agora é convidado(a) de ${member.fullName}.`);
      setOpen(false);
      onChanged?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <LinkIcon /> Vincular como convidado
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular a um(a) professor(a)</DialogTitle>
          <DialogDescription>{view.fullName} vira o Player 2 do(a) professor(a) escolhido(a).</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            search();
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou CPF do(a) professor(a)" />
          <Button type="submit" size="icon" disabled={pending} aria-label="Buscar">
            <Search />
          </Button>
        </form>
        {results !== null && results.length === 0 ? <p className="text-sm text-fg-muted">Ninguém encontrado.</p> : null}
        <ul className="max-h-64 divide-y divide-line overflow-y-auto">
          {(results ?? []).map((member) => (
            <li key={member.registrationId} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{member.fullName}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <AffiliationBadge status={member.status} short />
                  {member.hasGuest ? <ToneBadge tone="neutral">Já tem convidado</ToneBadge> : null}
                </div>
              </div>
              <Button size="sm" onClick={() => link(member)} disabled={pending || member.hasGuest}>
                Vincular
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function AdminSection({ view, onChanged }: { view: GateView; onChanged?: () => void }) {
  const own = view.ownRegistration;
  const staffGroup = view.employee;
  // Kits entregues do grupo de quem convidou (professor(a) ou funcionário(a)).
  const delivered: { type: KitType; kit: Extract<KitView, { kind: "DELIVERED" }> }[] = [];
  for (const [type, kit] of [
    ...(own ? ([["MEMBER", own.kits.MEMBER], ["GUEST", own.kits.GUEST]] as const) : []),
    ...(staffGroup ? ([["EMPLOYEE", staffGroup.kits.EMPLOYEE], ["GUEST", staffGroup.kits.GUEST]] as const) : []),
  ]) {
    if (kit.kind === "DELIVERED") delivered.push({ type, kit });
  }
  const canReopen =
    own &&
    (own.status === "CONFIRMED" || own.status === "REJECTED") &&
    delivered.length === 0 &&
    view.entry.kind !== "ALREADY_IN" &&
    !own.guest?.checkedIn;
  if (view.entry.kind !== "ALREADY_IN" && delivered.length === 0 && !canReopen) return null;

  return (
    <Panel title="Correções do administrador" icon={Undo}>
      <p className="mb-3 text-sm text-fg-muted">Use só para corrigir registros feitos por engano. Tudo fica na auditoria.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {view.entry.kind === "ALREADY_IN" ? (
          <ConfirmActionDialog
            trigger={
              <Button variant="outline">
                <Undo /> Estornar entrada
              </Button>
            }
            title="Estornar a entrada?"
            description={`A entrada registrada ${formatShortDateTime(view.entry.at)} será cancelada. Os kits que dependiam dela voltam ao estoque (na entrada de quem convidou, também o do convidado).`}
            confirmLabel="Estornar entrada"
            tone="danger"
            justification="required"
            onConfirm={(justification) => cancelCheckInAction({ personId: view.personId, justification })}
            successMessage="Entrada estornada."
            onDone={onChanged}
          />
        ) : null}
        {delivered.map(({ type, kit }) => (
          <ConfirmActionDialog
            key={type}
            trigger={
              <Button variant="outline">
                <Undo /> Estornar {KIT_TYPE_LABEL[type].toLowerCase()}
              </Button>
            }
            title={`Estornar ${KIT_TYPE_LABEL[type].toLowerCase()}?`}
            description={
              staffGroup
                ? "A entrega é cancelada e o kit volta ao estoque dos colaboradores."
                : "A entrega é cancelada e o kit volta ao estoque."
            }
            confirmLabel="Estornar entrega"
            tone="danger"
            justification="required"
            onConfirm={(justification) => cancelDeliveryAction({ deliveryId: kit.deliveryId, justification })}
            successMessage="Entrega estornada."
            onDone={onChanged}
          />
        ))}
        {canReopen ? (
          <ConfirmActionDialog
            trigger={
              <Button variant="outline">
                <Reload /> Reabrir conferência
              </Button>
            }
            title="Reabrir a conferência da filiação?"
            description={
              <>
                O status volta para <AffiliationBadge status="PENDING" short />.
              </>
            }
            confirmLabel="Reabrir"
            justification="required"
            onConfirm={(justification) => reopenAffiliationAction({ registrationId: own!.id, justification })}
            successMessage="Conferência reaberta."
            onDone={onChanged}
          />
        ) : null}
      </div>
    </Panel>
  );
}
