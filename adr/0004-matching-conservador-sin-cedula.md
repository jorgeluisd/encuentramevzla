# ADR-0004 — Matching conservador: el nombre nunca decide solo

Fecha: 2026-06-30 · Estado: **aceptado** · Extiende: spec 0002, spec 0009/0010 · Detalle: spec 0020.

## Contexto

El motor actual (`decideMatch`, `patient-matching.ts`) fusiona automáticamente dos registros con
nombre ≥ 0.92 en el **mismo hospital** aunque **no** haya cédula. Con datos reales (322+ pacientes,
~50% sin cédula, nombres muy comunes) esto produce **falsos positivos**: 4 "Juan Pérez" distintos en
el mismo hospital se colapsan en uno solo. La edad **no** basta para desambiguar (en Venezuela muchos
menores no tienen cédula; homónimos pueden compartir edad). El Excel real no trae fecha de nacimiento
ni sexo; las únicas señales fuertes son **cédula** y **teléfono**.

Simétricamente, la misma persona en dos hospitales sin cédula se **duplica** — pero fusionarla solo
por nombre repetiría el error de colapsar homónimos.

## Decisión

El **nombre por sí solo no decide** ni una fusión ni una separación. Solo una **señal fuerte**
confirma "misma persona":

1. **Misma cédula válida** (nombre ≥ 0.50) → fusión automática.
2. **Mismo teléfono** (nombre ≥ 0.85) → fusión automática (incluye traslados entre hospitales).

Sin señal fuerte:
- Nombre alto + **mismo** hospital → **cola de revisión humana** (0009), no fusión.
- Nombre alto + **distinto** hospital → **se mantienen separados** (homónimos), sin marcar la cola.
- La **edad** solo desempata/prioriza y puede reforzar "personas distintas"; **nunca** fusiona.

Política **conservadora**: ante la duda, humano. Preferimos un duplicado temporal revisable antes que
colapsar dos personas.

## Consecuencias

- Cambia el "caso 6" del árbol: mismo nombre + mismo hospital sin cédula/teléfono pasa de `merge` a
  `review`. Aumenta el volumen de la cola (aceptado: es el precio de no colapsar personas).
- Se agrega el value object `NormalizedPhone` y el teléfono entra como señal (comparado server-side;
  ver ADR de privacidad y spec 0020 §8 — no se expone `phone_hash` en `public`).
- Se reusan la cola (0009) y la ejecución de fusión (0010) sin cambios estructurales.
- Los homónimos cross-hospital conviven como registros separados; el buscador ya informa ubicación por
  coincidencia (ADR-0003), así que una familia recibe todas las mesas relevantes.

## Reversibilidad

Volver al comportamiento anterior es restaurar el "caso 6" a `merge` y quitar la señal de teléfono. La
traza de cada decisión queda en `audit_log` (`dedup_*`).
