import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras cargan las métricas (cabecera + filtros + tarjetas de sección).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-[42px] w-80" />
      {[0, 1, 2].map((s) => (
        <Card key={s}>
          <CardBody className="space-y-4">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
