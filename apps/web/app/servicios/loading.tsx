import { ServicesDirectorySkeleton } from "@/components/servicios/services-directory-skeleton";

// Skeleton mientras el server obtiene el listado de servicios (ruta force-dynamic).
export default function Loading(): React.ReactElement {
  return (
    <div className="space-y-10">
      <section className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">Ayuda gratuita tras el sismo</h1>
        <p className="mx-auto max-w-2xl text-text-2">
          Publica y encuentra servicios solidarios de personas que ofrecen su tiempo y conocimiento
          sin costo: inspección de edificios, atención médica, apoyo legal, alimentación y mucho más.
        </p>
      </section>
      <ServicesDirectorySkeleton />
    </div>
  );
}
