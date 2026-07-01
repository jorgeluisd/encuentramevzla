# ADR-0006 — Carga "scoped": filas de otro hospital no se atribuyen en silencio

Fecha: 2026-06-30 · Estado: **aceptado** · Detalle: spec 0020 §5.

## Contexto

Cuando un miembro con hospital asignado sube un Excel (carga "scoped", `forcedHospitalId`), la ingesta
**ignora la columna de hospital** del archivo y atribuye **todas** las filas a su hospital. Solo se
cuenta cuántos otros hospitales mencionaba el archivo (`otherHospitalsMentioned`, dato agregado). Si el
archivo contiene pacientes de **otra** institución, quedan registrados como propios, sin traza por
fila y sin posibilidad de corregirlo.

## Decisión

En carga scoped, una fila cuyo `hospitalName` (tras `normalizeHospitalName` + alias, ver ADR-0005)
**no** resuelva al hospital forzado **no se ingesta como propia**:

- Se **segrega** a una bandeja "filas de otro hospital".
- Se **audita por fila** (`ingest_foreign_hospital_row`, con el nombre ajeno y el fingerprint) y se
  **notifica** al uploader y al moderador.
- Un **moderador** puede **reasignar** esas filas al hospital correcto o descartarlas.

Nunca se atribuye data ajena en silencio.

## Consecuencias

- El uploader honesto que copió mal una fila ve el aviso y puede corregir; el archivo con mezcla de
  hospitales no contamina el hospital propio.
- Requiere UI/flujo mínimo para la bandeja y la reasignación (moderador). Si no hay filas ajenas, el
  flujo es idéntico al actual.
- La comparación depende del catálogo de hospitales (ADR-0005): sin normalización fuerte habría falsos
  "ajenos" por variantes de nombre.

## Reversibilidad

Volver al comportamiento anterior es atribuir todas las filas al hospital forzado y solo contar los
otros. La bandeja y sus audits quedan como historial.
