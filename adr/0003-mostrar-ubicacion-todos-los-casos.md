# ADR-0003 — El buscador informa la ubicación en todos los casos (incluidos menores y fallecidos)

Fecha: 2026-06-26 · Estado: **aceptado** · Supera parcialmente: ADR-0002, spec 0005.

## Contexto

Tras el sismo, el buscador devolvía `{ requires_human_contact: true }` para **menores y
fallecidos**: no revelaba su ubicación y derivaba a atención humana (regla "innegociable" en
`privacy-and-security.md`). En operación real, las familias **necesitan saber en qué hospital
está la persona** y el mensaje genérico dejaba un vacío de información en plena emergencia.

## Decisión

La dueña del dato decide, de forma **explícita e informada** (advertida del impacto en menores
y fallecidos), que el buscador **muestre la ubicación (hospital + mesa de información) en TODOS
los casos**, retirando el gate `requires_human_contact`.

## Consecuencias

- Se retira el filtro `is_minor = false AND status <> 'deceased'` del RPC `search_patient`
  (migración 0006). Toda coincidencia devuelve `hospital_name, info_desk_phone, patient_name`.
- Se elimina el resultado `human-contact` del contrato (`MediatedSearchResult`), su mapeo en el
  gateway y el bloque de UI en `/buscar`.
- **Tradeoff aceptado:** la ubicación de menores y fallecidos pasa a ser consultable por
  búsqueda pública por nombre/cédula. Mitigaciones que siguen vigentes: matching AND por token
  (no enumeración por similitud laxa), `search_log` solo guarda hash, y queda pendiente el
  rate-limit + Turnstile (anti-abuso) antes del crecimiento de tráfico.
- Se mantiene la separación `public`/`sensitive`: el RPC sigue sin exponer teléfonos,
  direcciones ni observaciones clínicas.

## Reversibilidad

Restaurar el gate es volver a aplicar la lógica de 0005 (sensible vs público) en el RPC.
