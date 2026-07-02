import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras carga la vista Hospitales (cabecera + buscador + tabla).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-[52px] w-40" />
      </div>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-[52px] w-64" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
