# ADR-0005 — Catálogo canónico de hospitales con alias

Fecha: 2026-06-30 · Estado: **aceptado** · Detalle: spec 0020 §4.

## Contexto

`HospitalRepository.resolveByName` crea un hospital por cada variante textual del nombre. Es
case-insensitive (`lower() = lower()`) pero **no** maneja alias, abreviaturas ni acentos/puntuación:
"CAMPO DE GOLF CARIBE", "Campo de Golf", "H. Vargas" y "Hospital Vargas de Caracas" quedan como
hospitales distintos. Esto fragmenta las admisiones y ensucia la deduplicación (un mismo paciente
aparece "en hospitales distintos" que en realidad son el mismo).

## Decisión

Introducir un **catálogo canónico** de hospitales con tabla de **alias**:

- `public.hospital_aliases (alias_normalized text unique, hospital_id uuid)`.
- Normalización fuerte en el dominio (`normalizeHospitalName`): NFD, sin acentos, minúsculas, quita
  prefijos genéricos (`hospital|hosp|h|clinica|centro|ambulatorio|cdi`), colapsa espacios.
- `resolveByName`: **exacto (normalizado) → alias → fuzzy** (`trigramSimilarity` ≥ 0.6 contra el
  catálogo). Match alto → canónico. Dudoso → **hospital provisional** para revisión del moderador; no
  se crean variantes en silencio.
- Seed inicial con la lista oficial de hospitales/refugios.

## Consecuencias

- Las variantes de un mismo hospital convergen a un `hospital_id` canónico; las admisiones dejan de
  fragmentarse.
- Requiere una migración: crear `hospital_aliases`, seed del catálogo, y un backfill que mapee los
  hospitales existentes en prod a canónicos y reasigne `admissions` (ver ADR-0007).
- El fuzzy puede equivocarse: por eso el caso dudoso va a **revisión**, no a fusión automática de
  hospitales.

## Reversibilidad

El catálogo es aditivo. Revertir es dejar de consultar `hospital_aliases` y volver a `resolveByName`
por igualdad. Los mapeos de backfill quedan auditados.
