"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/components/common/confirm-action-dialog";
import { FormField } from "@/components/forms/form-field";
import { CameraAdd, ExternalLink, Loader, Photo, Save, Trash } from "@/components/icons/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type VenueSettingsData, type VenueSettingsInput, venueSettingsSchema } from "@/domain/schemas";
import { callAction } from "@/lib/call-action";
import { playSound } from "@/lib/sound";
import { shrinkImage, uploadWithProgress } from "@/lib/upload";
import { removeEventPhotoAction, updateVenueSettingsAction } from "@/server/actions/setup";

/** Nome, endereço, descrição e link do Google Maps do local da festa. */
export function VenueSettingsForm({ initial }: { initial: VenueSettingsInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<VenueSettingsInput, unknown, VenueSettingsData>({
    resolver: zodResolver(venueSettingsSchema),
    mode: "onTouched",
    defaultValues: initial,
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit(
    () => {
      startTransition(async () => {
        const values = form.getValues();
        const result = await callAction(updateVenueSettingsAction(values));
        if (!result.ok) {
          toast.error(result.error);
          for (const [path, message] of Object.entries(result.fieldErrors ?? {})) {
            form.setError(path as FieldPath<VenueSettingsInput>, { message });
          }
          return;
        }
        toast.success("Local da festa salvo.");
        form.reset({ ...values, venueMapsUrl: result.data.mapsUrl ?? "" });
        router.refresh();
      });
    },
    () => toast.error("Revise os campos destacados."),
  );

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField id="venue-name" label="Nome do local" optional error={e.venueName?.message}>
          <Input id="venue-name" placeholder="Ex.: Clube dos Servidores" {...form.register("venueName")} />
        </FormField>
        <FormField id="venue-address" label="Endereço" optional error={e.venueAddress?.message}>
          <Input id="venue-address" placeholder="Rua, número, bairro — Teresina" {...form.register("venueAddress")} />
        </FormField>
      </div>
      <FormField id="venue-description" label="Sobre o local" optional error={e.venueDescription?.message}>
        <Textarea
          id="venue-description"
          rows={4}
          placeholder="Estacionamento, acessibilidade, como chegar de ônibus..."
          {...form.register("venueDescription")}
        />
      </FormField>
      <FormField
        id="venue-maps"
        label="Link do Google Maps"
        optional
        description="No Google Maps: Compartilhar → Copiar link. Também aceita o código de “Incorporar um mapa”."
        error={e.venueMapsUrl?.message}
      >
        <Input id="venue-maps" inputMode="url" placeholder="https://maps.app.goo.gl/..." {...form.register("venueMapsUrl")} />
      </FormField>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm">
          <a href="/#venue-title" target="_blank" rel="noopener noreferrer">
            Ver na página inicial <ExternalLink />
          </a>
        </Button>
        <Button type="submit" disabled={pending} data-testid="save-venue">
          {pending ? <Loader className="animate-spin-steps" /> : <Save />} Salvar local
        </Button>
      </div>
    </form>
  );
}

const MAX_SIDE = 1600;
const SEGMENTS = 16;

/** Foto do local: aparece na página inicial, na inscrição e nos vouchers. */
export function VenuePhotoField({ photo }: { photo: { url: string; width: number; height: number } | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const busy = progress !== null;

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    setProgress(0);
    playSound("blip");
    const blob = await shrinkImage(file, MAX_SIDE);
    const localUrl = URL.createObjectURL(blob);
    setPreview(localUrl);
    const data = new FormData();
    data.append("photo", blob, blob === file ? file.name : "local.jpg");
    const result = await uploadWithProgress("/api/local/foto", data, setProgress, {
      fallbackError: "Não foi possível salvar a foto. Tente de novo.",
    });
    if (input.current) input.current.value = "";
    setProgress(null);
    if (!result.ok) {
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      playSound("error");
      toast.error(result.error);
      return;
    }
    playSound("powerup");
    toast.success("Foto do local atualizada.");
    router.refresh();
  }

  const shown = preview ?? photo?.url ?? null;
  const lit = Math.round(((progress ?? 0) / 100) * SEGMENTS);
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-line bg-ink">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob) ou foto já reduzida
          <img src={shown} alt="Foto do local da festa" className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-center text-fg-muted">
            <Photo className="size-10 text-red" />
            <p className="text-sm">Sem foto do local ainda</p>
          </div>
        )}
        {busy ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/75 px-6" role="status" aria-live="polite">
            <p className="pixel text-[0.6rem] text-fg">
              Enviando <span className="tabular">{progress}%</span>
            </p>
            <div className="flex w-full max-w-60 gap-[3px]" aria-hidden>
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span key={i} className={i < lit ? "h-3 flex-1 rounded-[1px] bg-success shadow-[0_0_6px_var(--success)]" : "h-3 flex-1 rounded-[1px] bg-surface-3"} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0])}
        data-testid="venue-photo-input"
        aria-label="Escolher foto do local"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          <CameraAdd /> {photo ? "Trocar foto" : "Enviar foto"}
        </Button>
        {photo ? (
          <ConfirmActionDialog
            trigger={
              <Button type="button" variant="ghost" className="text-danger" disabled={busy}>
                <Trash /> Remover
              </Button>
            }
            title="Remover a foto do local?"
            description="A foto some da página inicial, da inscrição e dos vouchers."
            confirmLabel="Remover foto"
            tone="danger"
            onConfirm={() => removeEventPhotoAction()}
            successMessage="Foto removida."
            onDone={() => {
              setPreview(null);
              router.refresh();
            }}
          />
        ) : null}
      </div>
      <p className="text-xs text-fg-dim">A foto é reduzida automaticamente e os dados de localização do arquivo (GPS) são removidos.</p>
    </div>
  );
}
