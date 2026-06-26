/**
 * `/confianza` — "Tus datos se tratan de forma segura".
 * Explica separación de datos, búsqueda mediada y derecho al olvido.
 */
export default function ConfianzaPage(): React.ReactElement {
  return (
    <article className="space-y-6 py-6">
      <h1 className="text-2xl font-bold">Tus datos se tratan de forma segura</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Separación de datos</h2>
        <p className="text-gray-700">
          La información sensible (teléfonos, direcciones, observaciones clínicas) vive en
          un almacén aislado, separado físicamente de los datos no sensibles. El buscador
          público no tiene acceso a ese almacén bajo ninguna circunstancia.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cómo funciona la búsqueda</h2>
        <p className="text-gray-700">
          Cuando buscas un nombre o una cédula, no consultas una base de datos abierta. Una
          función controlada decide qué se puede revelar. Para personas adultas te muestra el
          nombre coincidente y en qué hospital preguntar, agrupado por hospital. Nunca se
          exponen otros datos (teléfono, dirección u observaciones de la persona).
        </p>
        <p className="text-gray-700">
          En casos sensibles —menores de edad o personas fallecidas— el buscador no muestra
          el nombre y deriva a atención humana, para acompañar a la familia con cuidado.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Anti-abuso</h2>
        <p className="text-gray-700">
          Para evitar que alguien recorra nombres al azar, registramos solo una huella
          (hash) de cada término buscado, nunca el texto, y limitamos la frecuencia de
          búsquedas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Derecho al olvido</h2>
        <p className="text-gray-700">
          Cualquier persona o su familia puede solicitar la eliminación o anonimización de
          sus datos. El sistema está diseñado para permitir esa baja de forma trazable.
        </p>
      </section>
    </article>
  );
}
