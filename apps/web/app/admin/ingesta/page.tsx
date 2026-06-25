import { subirExcelAction } from "@/lib/actions/ingesta";

/**
 * `/admin/ingesta` — Placeholder PROTEGIDO para subir el Excel de pacientes.
 *
 * STUB de protección: en producción esta ruta exige sesión + rol admin (middleware /
 * verificación server-side). Aquí solo dejamos la estructura y un formulario que invoca
 * la Server Action de ingesta (que por ahora solo parsea, no guarda).
 */
export default function AdminIngestaPage(): React.ReactElement {
  return (
    <section className="space-y-6 py-6">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Área restringida (placeholder). En producción requiere autenticación de
        administrador.
      </div>

      <h1 className="text-xl font-bold">Ingesta de Excel hospitalario</h1>
      <p className="text-gray-600">
        Sube el archivo .xlsx provisto por el hospital. Las filas se preservan tal cual
        (dato crudo) y se procesan después con deduplicación.
      </p>

      <form action={subirExcelAction} className="space-y-3">
        <input
          type="file"
          name="archivo"
          accept=".xlsx,.xls"
          required
          className="block w-full text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800"
        >
          Subir y parsear
        </button>
      </form>
    </section>
  );
}
