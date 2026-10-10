## Qué cambia

<!-- Describe brevemente el cambio y el porqué. Enlaza el spec si aplica (specs/NNNN-*.md). -->

Closes #

## Tipo de cambio

- [ ] 🐛 Fix
- [ ] ✨ Feature
- [ ] ♻️ Refactor (sin cambio de comportamiento)
- [ ] 📝 Docs / spec
- [ ] 🔧 Infra / tooling

## 🔒 Privacidad (innegociable)

> Ante la duda: ¿esto puede filtrar un dato sensible? Si no es un "no" rotundo, detente.

- [ ] No expone el schema `sensitive` (teléfonos, direcciones, observaciones clínicas) al cliente.
- [ ] El público consulta solo vía los RPC mediados (`search_patient`, `list_solidarity_services`) con el rol `evzla_public`; no se agregan grants sobre tablas.
- [ ] Menores y fallecidos: el buscador devuelve solo la ubicación mediada, igual que al resto (ADR-0003); nada del schema `sensitive`.
- [ ] No loggea el término de búsqueda en claro (en `search_log` solo va el hash).
- [ ] No hay secretos/credenciales en el código ni en el historial.

## ✅ Verde antes de mergear

- [ ] `pnpm typecheck` (objetivo 4/4 paquetes)
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] No rompe tests existentes ("no romper lo verde").

## Arquitectura

- [ ] Respeta la regla de dependencia onion (`domain` no importa hacia afuera).
- [ ] `@evzla/core` sigue puro (sin I/O ni libs externas).

## Notas para el reviewer

<!-- Riesgos, decisiones de diseño, pasos manuales (migraciones, env vars, despliegue). -->
