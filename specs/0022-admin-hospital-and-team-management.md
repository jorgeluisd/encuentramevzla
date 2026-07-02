# Spec 0022 — Gestión de hospitales, edición de miembros y paginación de personal

Estado: **en implementación** · Rama: `feat/0022-admin-hospitals-and-team` (desde `develop`)
Depende de: 0004 (team members), 0013 (alta hospital/personal), 0015 (flag `hospitals.test`).

## 1. Motivación

El portal `/admin` hoy permite **crear** hospitales y gestionar personal (invitar, cambiar rol,
activar/desactivar), pero faltan tres capacidades operativas:

1. **Personal sin paginación**: `/admin/equipo` renderiza toda la lista de una vez.
2. **Hospitales sin edición**: no hay forma (salvo SQL) de modificar un hospital, activarlo/
   desactivarlo, ni marcarlo como de prueba (`test`, spec 0015). Solo se pueden crear.
3. **Miembros no reasignables de hospital**: `SetTeamMemberAccess` solo cambia rol/estado; no
   se puede mover a un usuario de un hospital a otro.

Además se pide un **buscador genérico** reutilizable y **skeletons** de carga.

## 2. Alcance y decisiones

### 2.1 Paginación + búsqueda del personal
- Nuevo caso de uso `ListTeamMembers({ scopeHospitalId?, q?, page?, pageSize? }) → { members, total }`,
  calcado de `ListReviewQueue`. `DEFAULT_PAGE_SIZE = 20`.
- Port `TeamMemberAdmin.listPaged(hospitalId, { q, limit, offset })`.
- El scoping por rol lo resuelve la página (moderator = todos; hospital_admin = su hospital).
- Búsqueda por **email** (ILIKE), combinada con el scope.

### 2.2 Editar miembro (rol + hospital + estado) — modal
- `SetTeamMemberAccess.changes` suma `hospitalId?`.
- **Reasignar hospital = solo `moderator`.** Un `hospital_admin` no mueve a nadie de hospital
  (si lo intenta → `TeamAdminForbiddenError`), y sigue sin poder elevar a `moderator`.
- Coherencia rol↔hospital: rol resultante `moderator` ⇒ `hospitalId = null`; rol acotado
  (`uploader`/`hospital_admin`) ⇒ `hospitalId` obligatorio (`InvalidTeamInputError` si queda null).
- UI: botón **[Editar]** por fila abre un modal con email (solo lectura), rol, hospital
  (visible solo para moderator) y estado.

### 2.3 Pestaña "Hospitales" (solo moderador)
- Nueva ruta `/admin/hospitales`, gateada por `canModerate` (ítem de nav visible solo a moderator).
- Port `HospitalAdmin` suma `list({ q? }) → Hospital[]` y `update(id, changes)`.
- Casos de uso `ListHospitals` y `UpdateHospital` (ambos **moderator-only**). `CreateHospital` ya existe.
- `Hospital = { id, name, city, infoDeskPhone, active, provisional, test }`.
- UI: tabla (Nombre, Ciudad, Estado, Test, Acciones) + [+ Nuevo hospital] + modal [Editar]
  (nombre, ciudad, teléfono mesa, Activo sí/no, Test sí/no). El form "Crear hospital" se **mueve**
  desde `/admin/equipo` a esta pestaña.

### 2.4 Transversal
- Componentes compartidos: `_components/pagination.tsx`, `_components/search-box.tsx`,
  `_components/modal.tsx` (modal ligero propio, sin nueva dependencia).
- **Skeleton**: `loading.tsx` para `/admin/hospitales`; el de `/admin/equipo` ya existe.
- **Privacidad**: marcar `test=true` o `active=false` solo **restringe** el buscador público
  (`search_patient`); no expone nada del schema `sensitive`.
- **Sin migración de DB**: `active`, `test`, `provisional`, `hospitalId` ya existen.

## 3. Fuera de alcance
- Email de bienvenida al invitar (pendiente aparte).
- Paginación de la tabla de hospitales (son pocos; solo búsqueda).
- Borrado de hospitales (se usa activar/desactivar).

## 4. Testing
- TDD en `@evzla/core`: `ListTeamMembers`, `SetTeamMemberAccess` (hospitalId + coherencia),
  `ListHospitals`/`UpdateHospital` (gating moderator + validación de nombre).
- Verde antes de PR: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
