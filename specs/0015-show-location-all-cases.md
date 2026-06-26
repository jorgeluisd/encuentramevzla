# Spec 0015 — Mostrar ubicación en todos los casos (retiro del gate humano)

Estado: **aceptado** (decisión humana, Gate 1) · Capacidad: `patient-search` · Ver ADR-0003.
Supera: spec 0005 §menores/fallecidos · privacy-and-security regla 3.

## 1. Motivación

Las familias necesitan saber **en qué hospital** está la persona tras el sismo. El mensaje
`requires_human_contact` (para menores/fallecidos) no daba ubicación y bloqueaba esa ayuda.
La dueña del dato decide, advertida del impacto, mostrar la ubicación en **todos** los casos.

## 2. Cambio

- **RPC (migración 0006):** se retira el gate `requires_human_contact` y el filtro
  `is_minor = false AND status <> 'deceased'`. Toda coincidencia (matching AND por token de 0005)
  devuelve `{ hospital_name, info_desk_phone, patient_name, confidence }`.
- **Contrato:** se elimina `{ kind: "human-contact" }` de `MediatedSearchResult`, su mapeo en
  `SupabasePatientSearchGateway` y el bloque de UI en `/buscar`.

## 3. Privacidad (qué se mantiene)

- Separación `public`/`sensitive` intacta: no se exponen teléfonos, direcciones ni notas clínicas.
- Público solo accede vía `search_patient` (`SECURITY DEFINER`).
- `search_log` sigue guardando solo el hash del término.
- Matching AND por token (no enumeración por similitud laxa).
- **Pendiente recomendado antes de escalar tráfico:** rate-limit del RPC + Cloudflare Turnstile.

## 4. Verificación

- Harness rollback contra la BD real (pacientes sintéticos): menor, fallecido y adulto
  aparecen con su hospital; ya no se emite `requires_human_contact`. GREEN.
- `pnpm typecheck` 4/4 · `pnpm build` OK.

## 5. Nota

Cambio de un contrato marcado "innegociable": se registra como decisión humana explícita
(ADR-0003) con su tradeoff. Reversible reaplicando la lógica de 0005.
