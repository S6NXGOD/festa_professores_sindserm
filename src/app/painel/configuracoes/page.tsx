import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gift, MapPin, Settings, Whatsapp } from "@/components/icons/pixel";
import { EventSettingsForm, HelpSettingsForm } from "@/components/settings/settings-forms";
import { VenuePhotoField, VenueSettingsForm } from "@/components/settings/venue-settings";
import { PageHeader, Panel } from "@/components/staff/panel-ui";
import { Button } from "@/components/ui/button";
import { APP_TIME_ZONE, utcToZonedLocalInput } from "@/lib/datetime";
import { maskPhoneInput } from "@/lib/phone";
import { db } from "@/server/db";
import { getConfig } from "@/server/queries/config";
import { getEventPhotoMeta } from "@/server/services/venue";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requirePageActor("manageSettings");
  const [config, photo] = await Promise.all([getConfig(), getEventPhotoMeta(db)]);
  if (!config) redirect("/setup/evento");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Configurações da festa"
        description="Alterações ficam registradas na auditoria. As artes (cartaz e logos) ficam na pasta public — veja o README."
        actions={
          <Button asChild variant="outline">
            <Link href="/painel/kits">
              <Gift /> Estoque de kits
            </Link>
          </Button>
        }
      />
      <Panel title="Festa, inscrições e kits" icon={Settings}>
        <EventSettingsForm
          timeZone={APP_TIME_ZONE}
          initial={{
            name: config.name,
            description: config.description ?? "",
            eventDate: config.eventDate,
            startTime: config.startTime.slice(0, 5),
            endTime: config.endTime?.slice(0, 5) ?? "",
            registrationOpensAt: utcToZonedLocalInput(config.registrationOpensAt),
            registrationClosesAt: utcToZonedLocalInput(config.registrationClosesAt),
            kitDeadlineTime: config.kitDeadlineTime?.slice(0, 5) ?? "",
          }}
        />
      </Panel>
      <Panel title="WhatsApp para dúvidas" icon={Whatsapp}>
        <p className="mb-4 text-sm text-fg-muted">
          Aparece no botão verde de ajuda (página inicial, inscrição e vouchers), no rodapé dos vouchers, na etapa de documentos da
          ficha, no login da equipe e nas telas de erro. A mensagem já vai escrita com o assunto (ex.: o código do voucher). Deixe
          vazio para esconder.
        </p>
        <HelpSettingsForm initial={config.helpWhatsapp ? maskPhoneInput(config.helpWhatsapp) : ""} />
      </Panel>
      <Panel title="Local da festa" icon={MapPin}>
        <p className="mb-5 text-sm text-fg-muted">
          Aparece na página inicial, na inscrição e nos vouchers. Tudo é opcional: preencha o que tiver.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <VenueSettingsForm
            initial={{
              venueName: config.venueName ?? "",
              venueAddress: config.venueAddress ?? "",
              venueDescription: config.venueDescription ?? "",
              venueMapsUrl: config.venueMapsUrl ?? "",
            }}
          />
          <VenuePhotoField
            photo={photo ? { url: `/local/foto?v=${photo.updatedAt.getTime()}`, width: photo.width, height: photo.height } : null}
          />
        </div>
      </Panel>
    </div>
  );
}
