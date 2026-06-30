import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras carga la cola de revisión (pega a la DB; puede tardar).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-4">
            <Skeleton className="h-6 w-32 rounded-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
            <Skeleton className="h-[52px] w-48" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
