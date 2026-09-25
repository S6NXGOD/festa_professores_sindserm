import { CassetteLoader } from "@/components/retro/cassette";
import { Skeleton } from "@/components/ui/skeleton";

export default function PanelLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <CassetteLoader className="py-4" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
