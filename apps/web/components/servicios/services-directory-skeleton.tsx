import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Skeleton del directorio: filtros + una rejilla de tarjetas "fantasma" que imitan
// la tarjeta real (categoría · título · descripción · teléfono).
export function ServicesDirectorySkeleton({ cards = 6 }: { cards?: number }): React.ReactElement {
  return (
    <div className="space-y-5" role="status" aria-label="Cargando servicios">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Skeleton className="h-[52px] w-full" />
        <Skeleton className="h-[52px] w-full sm:w-56" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <Card key={i}>
            <CardBody className="flex h-full flex-col gap-3">
              <Skeleton className="h-6 w-32 rounded-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="mt-1 h-4 w-40" />
            </CardBody>
          </Card>
        ))}
      </div>
      <span className="sr-only">Cargando servicios…</span>
    </div>
  );
}
