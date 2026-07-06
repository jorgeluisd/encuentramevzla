import Image from "next/image";
import { formatLastUpdate } from "@evzla/core";
import { getLastUpdateUseCase } from "@/lib/composition";
import { HomeTabs } from "@/components/home/home-tabs";

// Home 100% estático (CDN): se regenera SOLO cuando se sube una lista
// (revalidatePath("/") en la acción de ingesta). Cero invocations en uso normal;
// el sello "última actualización" queda exacto justo cuando cambian los datos.
// La pestaña de servicios carga su listado del lado del cliente (no rompe lo estático).
export const dynamic = "force-static";

// Lee la última actualización tolerando que la BD no esté disponible (p. ej. en build):
// si falla, el badge cae a su texto base en vez de romper el render.
async function lastUpdate(): Promise<Date | null> {
  try {
    return await getLastUpdateUseCase().execute();
  } catch {
    return null;
  }
}

/**
 * `/` — Portada con control segmentado: "Buscar familiar" (por defecto) y "Servicios".
 * La búsqueda usa el RPC mediado `public.search_patient` (privacidad mediada); los
 * servicios solidarios se listan por el RPC público `list_solidarity_services`.
 */
export default async function HomePage(): Promise<React.ReactElement> {
  const lastUpdateAt = await lastUpdate();

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <Image
          src="/brand/logo-encuentramevzla.svg"
          alt="EncuéntrameVzla"
          width={280}
          height={158}
          priority
          className="h-auto w-44 sm:w-56"
        />
      </div>

      <HomeTabs lastUpdateLabel={formatLastUpdate(lastUpdateAt)} />
    </div>
  );
}
