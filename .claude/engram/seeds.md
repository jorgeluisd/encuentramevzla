# Engram — Memorias semilla de EncuéntrameVzla

Memorias iniciales basadas en decisiones **reales** ya tomadas en el proyecto. Formato
WHAT/WHY/WHERE/LEARNED. Sirven de base; el `archiver` sigue guardando con `mem_save` durante el trabajo.

## Protocolo de memoria (qué guardar, cuándo, con qué tags)

- **Guardar proactivamente** (sin que lo pidan) tras: decisión de arquitectura/privacidad/workflow,
  bug corregido (con causa raíz), convención nueva, hallazgo no obvio en datos reales, preferencia del
  usuario, feature con enfoque no trivial.
- **No guardar** lo que el repo ya registra (estructura de código, historial git, lo obvio).
- **Tags base:** `encuentramevzla`. Añadir según dominio: `privacidad`, `dedup`, `supabase`,
  `arquitectura`, `frontend`, `bug`, `decision`.
- **Una memoria = un hecho.** Fechas en absoluto. Enlazar memorias relacionadas.
- **Cierre de sesión:** `mem_session_summary` (Goal, Discoveries, Accomplished, Next Steps, Files).

---

## Semilla 1 — Stack: todo Supabase (sin backend propio)

- **WHAT:** No hay backend propio (ni NestJS). Todo es Supabase: Postgres 16, RLS, RPC `SECURITY
  DEFINER`, Edge Functions (Deno), Auth magic-link previsto. El frontend (Next.js 16) habla directo
  con Supabase.
- **WHY:** Proyecto humanitario sin fines de lucro; minimizar superficie y costo operativo, y
  concentrar la mediación de privacidad en la DB.
- **WHERE:** `supabase/migrations/`, `supabase/functions/dedup`, `apps/web/lib/supabase`.
- **LEARNED:** El público solo invoca el RPC mediado con la anon key; la ingesta usa Server Actions con
  conexión directa/service role. El worker pesado de dedup/OCR (fase 2) será Edge Function Deno.

## Semilla 2 — Arquitectura: Onion + Screaming, inglés/español, SDD+TDD

- **WHAT:** Onion (deps hacia adentro: presentation→infrastructure→application→domain) + Screaming
  (capacidades primero: `patient-registry`, `patient-search`). Código en inglés, comentarios cortos en
  español. SDD (spec primero) + TDD (rojo→verde→refactor).
- **WHY:** Mantener el dominio puro y testeable, y que la estructura grite el negocio, no el framework.
- **WHERE:** `specs/0001-architecture-and-conventions.md`; `packages/core/src/patient-registry/...`.
- **LEARNED:** La infraestructura hoy vive en `apps/web/lib/infrastructure` (no en core); `@evzla/core`
  debe quedar PURO (sin I/O). Migración por estrangulamiento, sin romper lo verde.

## Semilla 3 — Privacidad mediada (innegociable)

- **WHAT:** Separación física `public`/`sensible`. El público solo usa `public.buscar_paciente(termino)`
  (`SECURITY DEFINER`), que devuelve solo `{ hospital_nombre, hospital_telefono_mesa, confianza }`.
  Menores/fallecidos → `{ requiere_contacto_humano: true }`. `busqueda_log` guarda solo el hash.
- **WHY:** La privacidad de los pacientes es un requisito de diseño no negociable.
- **WHERE:** `supabase/migrations/0002_rls.sql`, `0003_rpc_buscar_paciente.sql`; `README.md`.
- **LEARNED:** El rol anónimo no tiene grants sobre tablas; `sensible` jamás llega al cliente. Mostrar
  nombres en el buscador es una decisión ABIERTA que requiere a la residente + migración 0007.

## Semilla 4 — Dedup: no confiar en la cédula

- **WHAT:** El matching no usa la cédula como clave única: 50% sin cédula, cédulas basura ("22.89"),
  cédulas iguales con personas distintas, orden nombre/apellido variable, extranjeros.
- **WHY:** Los datos reales (337 pacientes / 5 hospitales) lo desaconsejan.
- **WHERE:** `specs/0002-patient-deduplication.md`; `packages/core/src/patient-registry/domain/`.
- **LEARNED:** Política: cédula válida + nombre ≥0.5 → merge; misma cédula + nombre distinto → conflict
  (revisión humana); sin cédula: ≥0.92 merge, 0.80–0.92 review, resto new. `DocumentId.isValid` exige
  ≥6 dígitos. Similitud = espejo TS de `pg_trgm`/`fuzzystrmatch`.

## Semilla 5 — Bug RPC 0005 (ROW_COUNT vs boolean)

- **WHAT:** En `buscar_paciente`, una variable boolean (`v_hay_coincid`) recibía un `ROW_COUNT` entero,
  fallando con 2+ coincidencias.
- **WHY:** Confundir el conteo de filas con un flag booleano en plpgsql.
- **WHERE:** `supabase/migrations/0005_buscar_paciente_rowcount_fix.sql`.
- **LEARNED:** En plpgsql, separa el conteo (`GET DIAGNOSTICS ... ROW_COUNT`) del flag booleano; probar
  el RPC con 0, 1 y ≥2 coincidencias. Patrón a vigilar en futuros cambios al RPC.

## Semilla 6 — Nombre y dominio: EncuéntrameVzla

- **WHAT:** Nombre del proyecto **EncuéntrameVzla**, dominio **encuentramevzla.com**.
- **WHY:** Decisión del usuario; identidad pública del buscador humanitario.
- **WHERE:** `README.md`; carpeta `EncuentrameVzla/` (repo personal en GitHub).
- **LEARNED:** El scope de paquetes es `@evzla/*` (core, db, config, web), antes `@registro/*` (ya
  eliminado). El cwd `venezuela` está vacío; el proyecto real vive en `../EncuentrameVzla`.
