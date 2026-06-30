import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Fallback mientras carga el audit log (lectura de la DB; puede tardar).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Card>
        <CardBody className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
