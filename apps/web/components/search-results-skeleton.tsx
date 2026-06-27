import { Card, CardBody } from "@/components/ui/card";

// Skeleton ligero mientras llega la búsqueda: dos tarjetas "fantasma" que imitan
// el resultado real (institución · nombres · mesa de información).
function Bar({ className }: { className: string }): React.ReactElement {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

export function SearchResultsSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" role="status" aria-label="Buscando coincidencias">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <div className="space-y-2">
              <Bar className="h-3 w-32" />
              <Bar className="h-5 w-48" />
            </div>
            <Bar className="h-4 w-full" />
            <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <Bar className="h-4 w-40" />
              <Bar className="h-9 w-full sm:w-24" />
            </div>
          </CardBody>
        </Card>
      ))}
      <span className="sr-only">Buscando coincidencias…</span>
    </div>
  );
}
