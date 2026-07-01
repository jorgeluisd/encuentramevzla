import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras carga "Filas de otro hospital" (pega a la DB: filas abiertas + hospitales).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-7 w-48 rounded-full" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Skeleton className="h-[52px] w-full sm:w-64" />
              <Skeleton className="h-[52px] w-full sm:w-40" />
              <Skeleton className="h-[52px] w-full sm:w-32" />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
