import Link from "next/link";

/**
 * `/` — Buscador público.
 * STUB: el formulario hace GET a /buscar?termino=...; la lógica del RPC vive allí.
 */
export default function HomePage(): React.ReactElement {
  return (
    <section className="space-y-6 py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">¿Buscas a un familiar ingresado?</h1>
        <p className="text-gray-600">
          Escribe el nombre y apellido, o la cédula. Por privacidad, solo te diremos si
          hay una coincidencia y en qué hospital preguntar; nunca mostramos datos de la
          persona.
        </p>
      </div>

      <form action="/buscar" method="get" className="flex gap-2">
        <input
          type="text"
          name="termino"
          required
          minLength={4}
          placeholder="Nombre y apellido o cédula (mín. 4 caracteres)"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800"
        >
          Buscar
        </button>
      </form>

      <aside className="rounded-md border border-red-200 bg-red-50 p-4 text-sm">
        <p className="font-semibold text-red-800">
          Esto NO es un servicio oficial de rescate.
        </p>
        <p className="text-red-700">
          Ante una emergencia, llama a las líneas oficiales:{" "}
          <strong>171</strong> · <strong>*1</strong> · <strong>112</strong> ·{" "}
          <strong>911</strong>.
        </p>
      </aside>

      <p className="text-sm text-gray-500">
        ¿Cómo protegemos los datos?{" "}
        <Link href="/confianza" className="text-teal-700 underline">
          Lee nuestra política de privacidad
        </Link>
        .
      </p>
    </section>
  );
}
