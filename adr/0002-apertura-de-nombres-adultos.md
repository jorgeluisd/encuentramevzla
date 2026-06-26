# ADR-0002 — Apertura de nombres de adultos en el buscador

- Fecha: 2026-06-25
- Estado: **Aceptada** · Revierte parcialmente [ADR-0001](./0001-busqueda-mediada.md)
- Spec: [`specs/0005-buscador-nombres-y-dedupe.md`](../specs/0005-buscador-nombres-y-dedupe.md)

## Contexto

Bajo la búsqueda mediada ([ADR-0001](./0001-busqueda-mediada.md)) las familias no podían
confirmar identidad sin llamar a cada mesa de información, lo que retrasaba el cierre del círculo.
La **residente, dueña del dato, consintió explícitamente** exponer nombres en internet.

## Decisión

Mostrar **NOMBRES de pacientes** en el buscador, **agrupados por hospital**, en **toda
coincidencia** (incluso parcial) — opción "abierta".

### Límite innegociable (no se cruza)
- **Menores de edad y fallecidos NUNCA** devuelven nombre → siguen como
  `{ requiere_contacto_humano: true }`. La apertura aplica **solo a adultos vivos**.
- Único acceso público = RPC `buscar_paciente` (`SECURITY DEFINER`); sin grants al rol anónimo.
- `busqueda_log` sigue guardando **solo el hash**; el schema `sensible` no se expone.

### Nombre visible
Se capitaliza el `nombre_normalizado` en presentación (title-case, sin tildes). No se añade
columna ni se hace backfill (trade-off de simplicidad sobre fidelidad tipográfica).

## Consecuencias

- Mejora directa para las familias: reconocen el nombre sin llamar.
- Mayor superficie de exposición de adultos vivos → se acota con el límite de arriba, el dedupe
  por hospital y el `LIMIT 10`.
- Requiere migración `0007` (RPC), extender el puerto `MediatedMatch` con `patientName`,
  actualizar `/buscar` y reescribir la copy de `/confianza`.
