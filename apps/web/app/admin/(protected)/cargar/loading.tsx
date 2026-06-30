import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras carga la vista Cargar (cabecera + acciones + lista en vivo).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-[52px] w-28" />
        <Skeleton className="h-[52px] w-28" />
      </div>
      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-5 w-40" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
