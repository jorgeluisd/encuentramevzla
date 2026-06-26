# Spec 0013 — Sello de "última actualización" dinámico

Estado: **propuesto** · Capacidad: `patient-registry` (presentación) · Relacionado: 0006 (UI).

## 1. Motivación

El home muestra un badge fijo "Listas verificadas · actualizado hoy". No refleja cuándo
entró información nueva de verdad. Una familia gana confianza si ve la **hora real** de la
última actualización de las listas.

## 2. Decisión

Mostrar la marca de tiempo de la **última carga de datos**, en **hora de Venezuela**,
de forma **dinámica** (se actualiza sola cuando el equipo sube una lista nueva).

- **Fuente del dato:** `max(created_at)` de `public.patients`. Es robusto sin importar
  cómo entró la data (ingesta por la app o recarga por SQL); siempre hay `created_at`.
  (El `audit_log` registra `ingest_patient_list`, pero puede estar vacío tras una recarga
  por SQL; por eso no se usa como fuente.)
- **Formato:** "Actualizado: 26 jun, 2:30 p. m." (zona `America/Caracas`, locale `es-VE`).
- **Sin datos** (tabla vacía): se muestra solo "Listas verificadas".

## 3. Diseño (onion)

- **domain (puro):** `formatLastUpdate(date: Date | null): string` — formatea con `Intl`
  (built-in, determinista; no es I/O ni lib externa). Devuelve el texto del badge.
- **application:** port `LastUpdateReader { lastUpdatedAt(): Promise<Date | null> }`
  + caso de uso `GetLastUpdate` que delega en el port.
- **infrastructure:** `DrizzleLastUpdateReader` → `select max(created_at) from patients`.
- **presentation:** el home (`apps/web/app/page.tsx`) pasa a render con revalidación
  (`revalidate = 300`), llama al caso de uso y pinta el badge con `formatLastUpdate`.

## 4. Privacidad

La marca de tiempo agregada no expone ningún dato personal. No toca `sensitive`, ni el
RPC `search_patient`, ni `search_log`.

## 5. Criterios de aceptación (TDD del formateador)

1. `formatLastUpdate(null)` → "Listas verificadas".
2. Una fecha conocida (UTC) se formatea en hora de Venezuela (UTC-4) e incluye día y hora.
3. El home muestra el sello con la hora de la última carga; cambia al ingresar datos nuevos.
4. `pnpm typecheck` 4/4 · `pnpm test` verde · `pnpm build` OK.
