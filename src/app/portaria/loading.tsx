import { CassetteLoader } from "@/components/retro/cassette";
import { Skeleton } from "@/components/ui/skeleton";

export default function GateLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-40 rounded-2xl" />
      <CassetteLoader />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}
