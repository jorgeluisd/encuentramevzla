import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras carga la vista Equipo (alta hospital + invitar + tabla de personal).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-[52px]" />
              <Skeleton className="h-[52px]" />
              <Skeleton className="h-[52px]" />
            </div>
          </CardBody>
        </Card>
      ))}
      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
