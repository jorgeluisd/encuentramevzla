# ADR-0001 — Búsqueda mediada (privacidad por diseño)

- Fecha: 2026-06 (retroactivo; política vigente desde el MVP)
- Estado: **Aceptada, parcialmente revertida** por [ADR-0002](./0002-apertura-de-nombres-adultos.md)

## Contexto

EncuéntrameVzla es un proyecto humanitario que ayuda a familias a localizar personas tras un
terremoto. La privacidad de los pacientes es un requisito innegociable: una base abierta de
nombres + hospital permitiría enumeración, perfilado y exposición de personas vulnerables.

## Decisión

La búsqueda pública es **mediada**: el único acceso es el RPC `public.search_patient`
(`SECURITY DEFINER`), que devuelve solo si **hay coincidencia** y **en qué hospital preguntar**
(`hospital_name`, `info_desk_phone`, `confidence`). **Nunca** datos personales. Casos
sensibles (menores, fallecidos) → `{ requires_human_contact: true }`. `search_log` guarda
**solo el hash** del término (anti-enumeración).

## Consecuencias

- El público no consulta tablas directamente; el schema `sensitive` queda aislado.
- Las familias no confirman identidad por el buscador (deben llamar a la mesa).
- Esta fricción motivó la revisión posterior → ver [ADR-0002](./0002-apertura-de-nombres-adultos.md).
