# ADR-0007 — Remediación de duplicados en prod: escalonada por confianza y reversible

Fecha: 2026-06-30 · Estado: **aceptado** · Detalle: spec 0020 §6.

## Contexto

Prod contiene duplicados anteriores al motor de dedup actual (confirmado por consulta read-only sobre
el apellido `diaz`, 2026-06-30): misma cédula duplicada, mismo nombre + mismo hospital duplicado
(casos que el motor *sí* fusionaría → entraron por seed/carga temprana), y mismo nombre en distinto
hospital (homónimos vs traslados). El spec 0020 arregla la ingesta de-ahora-en-más, pero **no** limpia
lo ya cargado. Un merge masivo automático por nombre repetiría el riesgo de colapsar homónimos.

## Decisión

Remediar de forma **escalonada por confianza**, **reversible** y **ensayada en dump** antes de tocar
prod. Reusa `MergePatients` (0010):

1. **Auditoría read-only** que clasifica los duplicados (fuertes / mismo hospital+teléfono / mismo
   hospital solo nombre / cross-hospital solo nombre / variantes de hospital).
2. **Unificar hospitales primero** (catálogo/alias, ADR-0005): reasignar `admissions`, limpiar
   huérfanos.
3. **Merge por confianza:**
   - **Automático seguro:** SOLO misma cédula válida.
   - **Automático medio (opcional, auditado):** mismo hospital + mismo teléfono + nombre alto. **No
     por edad.**
   - **A la cola (humano):** mismo nombre + mismo hospital sin señal fuerte.
   - **Separados:** mismo nombre + distinto hospital sin señal fuerte (homónimos).
4. **Reversibilidad:** cada fusión registra `old_id → surviving_id` en `audit_log` (`patients_merged`);
   la data cruda persiste en `raw_rows`.

**Ninguna operación real sobre prod sin OK explícito de Jorge**, y solo después del ensayo en dump.

## Consecuencias

- La limpieza es incremental y auditable; los casos ambiguos pasan por humano en `/admin/review`.
- El auto-merge por edad queda **descartado** (respeta el caso `diaz camila`: menores sin cédula
  pueden compartir hospital y edad sin ser la misma persona).
- Requiere un dump de prod y un entorno de ensayo (ya montado localmente, ver memoria de sesión).

## Reversibilidad

Cada merge es deshacible manualmente con el mapeo `old_id → surviving_id` del audit y el dato crudo de
`raw_rows`. La unificación de hospitales guarda el mapeo de variantes → canónico.
