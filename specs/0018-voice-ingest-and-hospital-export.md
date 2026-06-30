# Spec 0018 — Carga por voz + descarga de Excel por hospital (captura acotada)

Estado: **propuesto** (pendiente Gate 1) · Capacidad: `patient-registry`
Relacionado: spec 0007 (auth y roles), spec 0008 (ingesta + dedup), spec 0017 (ingesta robusta),
spec 0005 (buscador/dedupe), skill `privacy-and-security.md`.
Origen: los hospitales están **saturados** y mandar el Excel a mano se volvió un cuello de botella. El
dueño quiere que, desde el hospital, el personal **cargue pacientes por voz** (no solo por formulario) y
pueda **descargar su Excel** (lo ya cargado + lo que va dictando, como copia de respaldo). Hoy no existe
ni captura por voz/manual, ni descarga, ni scoping real por hospital.

## 1. Motivación

El único canal de carga hoy es **subir un `.xlsx`** (`subirExcelAction` → `IngestPatientList`). En una
emergencia con hospitales saturados eso es lento y dependiente de que alguien arme el Excel. Tres carencias:

1. **Sin captura ágil.** No hay forma de cargar un paciente suelto por **voz** ni por **formulario** desde
   el hospital; todo pasa por preparar y subir un archivo.
2. **Sin scoping por hospital.** `team_members.hospitalId` existe pero **no filtra nada**: cualquier
   miembro puede cargar/ver datos de cualquier hospital. Para abrir el portal a personal de hospital hace
   falta acotar "cada hospital solo el suyo".
3. **Sin descarga.** El hospital no puede obtener su propia copia (existentes + lo nuevo) en Excel.

La data que entra por voz/manual es de la **misma naturaleza** que la del Excel (nombre, cédula, edad,
estado, contacto, notas). La novedad de privacidad es que la **voz obliga a un servicio externo de STT**
(hoy el sistema no manda nada sensible a terceros) → decisión de Gate 1.

## 2. Alcance

**Secuencia:** **Fase 1a = P0–P5 online** (entregable a producción). **Fase 1b = offline/PWA** (§7).
**Fase 2 = bot de Telegram** (§7). No se despliega hasta P0–P5 verdes.

- **P0 — Scoping por hospital + roles + login.** Enforcar el scope server-side; ampliar roles con
  `hospital_admin`; sesión larga para reducir fricción de login.
- **P1 — Descarga de Excel por hospital** (incl. `sensitive`, acotado, idempotente al re-subir).
- **P2 — Carga por voz** (STT → extracción → formulario editable → confirmación humana).
- **P3 — Formulario manual + vista de captura continua + editar** (no borrar) lo propio.
- **P4 — Pantalla de admin** (alta de hospitales y personal por email/magic-link).
- **P5 — Cola de revisión acotada** por hospital (la resuelve el `hospital_admin`).

**Fuera de alcance (ver §7):** efecto del **estado en el buscador** (que `localizado`/`de alta` salga del
resultado, que `trasladado` actualice de hospital) — toca el **contrato del buscador** (privacidad) y va en
**mini-spec aparte con su propio Gate 1**. Aquí el estado se **captura y edita**, pero no cambia el
resultado público. También fuera: offline/PWA (Fase 1b), Telegram (Fase 2), self-host de STT.

## 3. Decisiones (Gate 1 — pendientes de aprobación del dueño)

> Acordadas en sesión de diseño 2026-06-29; se listan para aprobación formal de Gate 1.

- **D0 — Hosting:** **Vercel Pro + Supabase Pro** (sin tope de 60s de Hobby). `maxDuration` defensivo
  (~120s) + `runtime = "nodejs"` en los segmentos nuevos.
- **D1 — Canal por fases:** Fase 1 = **portal web** (sin bot). Fase 2 = **bot de Telegram** (no WhatsApp:
  gratis, sin verificación de negocio, notas de voz nativas; será solo otro **adapter de presentación**
  sobre los mismos ports/casos de uso). **Sin backend NestJS** — el core ya es agnóstico de framework.
- **D2 — Proveedor STT: DECIDIDO (Opción A, APIs gestionadas)** (2026-06-29, tras deep-dive de costes,
  ver Apéndice A). **STT** = OpenAI `gpt-4o-transcribe` (~$0.006/min; alternativa Deepgram Nova-3
  ~$0.0043/min) — español es Tier-1 (3–6% WER). **Extracción** = **Claude Haiku 4.5** (Anthropic SDK,
  salida estructurada). Coste ~**$0.005/dictado** (~$5 por 1.000), cero servidores, cabe en Vercel Pro.
  Motivo: a la escala del proyecto las APIs son más baratas Y sin ops; el self-host (EC2) solo se amortiza
  por encima de ~12.000 dictados/mes. Requisito de Gate 1: **DPA/no-train** con el proveedor + **aviso al
  personal**. El STT sigue tras el port `SpeechTranscriber` → si en el futuro se exige cero-terceros, se
  cambia **un adapter** a self-host (B/C) sin reescribir.
- **D3 — Login:** se mantiene **magic-link + allowlist `team_members`** (identidad y auditoría por
  persona). Se añade **sesión larga / dispositivo de confianza (30–90 días)** para que el personal no
  re-pida el link. **Nada de credencial compartida** por hospital.
- **D4 — Scoping "cada hospital solo el suyo":** `IngestPatientList` recibe `forcedHospitalId`. Miembro
  scoped (`hospitalId = X`) → se **ignora la columna de hospital** del Excel/voz/manual y todo va a X
  (server-side, no manipulable desde el cliente); el resumen reporta si el archivo mencionaba otros.
  Owner/moderador (`hospitalId = null`) → multi-hospital como hoy.
- **D5 — Roles:** se extiende el enum `team_role` con **`hospital_admin`** (scoped). `uploader`:
  carga/edita/descarga lo suyo, **no** resuelve revisión. `hospital_admin`: lo del uploader **+ resolver
  la cola de revisión de su hospital + invitar/gestionar a su propio personal**. `moderator`: global.
  `owner` = moderador global.
- **D6 — Descarga:** incluye **sensibles** pero **solo de sus pacientes** (scoped, server-side vía
  `service_role`). La **fuente de verdad es la DB** (voz/manual ingestan directo); el `.xlsx` es **copia de
  respaldo**. Re-subir un Excel editado a mano debe ser **idempotente** (§4.2).
- **D7 — Voz:** **un paciente por grabación**; transcribe → extrae → **formulario editable → confirmar**
  (humano en el loop, nunca auto). **El audio se descarta tras transcribir** (no se persiste). Aviso visible
  de procesamiento externo. **Notas clínicas sí** se capturan por voz y manual.
- **D8 — Estado:** **selector explícito** (ingresado/trasladado/de alta/fallecido) + **toggle "¿falleció?"**.
  `looksDeceased` sobre la nota queda como **red secundaria**. (El efecto en el buscador, fuera de alcance.)
- **D9 — Validez:** un paciente es válido con **nombre _o_ cédula** (al menos uno).
- **D10 — Captura unificada:** la subida de Excel actual se integra en una vista **"Cargar"**
  (Dictar/Manual/Subir Excel juntos) con **lista en vivo**; `/admin/ingesta` se pliega ahí.
- **D11 — Editar (no borrar):** el hospital edita **todos los campos de lo suyo** (incl. nombre/cédula);
  borrar lo hace moderador/owner. Editar recalcula value objects y queda auditado.
- **D12 — Duplicados:** la carga 1-a-1 **no frena**; si dedup sospecha, va a la **cola de revisión**.
- **D13 — Alta de hospitales/personal:** **pantalla de admin** (P4), reemplaza el alta manual en DB.

## 4. Diseño por capas (Onion)

### 4.1 Aplicación / Dominio (`@evzla/core`, puro)

- **Refactor `IngestPatientList`**: extraer el núcleo *dedup + persistencia* a un método
  `ingestParsed(rows, { forcedHospitalId? })` que recibe un `ParsedPatientList` ya construido. El camino
  Excel (`parse(bytes) → ingestParsed`) y los nuevos (voz/manual) lo comparten → heredan dedup, merge,
  conflictos, menores/fallecidos, audit e idempotencia **sin duplicar lógica**. Para la fila dictada se
  arma un `raw_row` sintético (transcript + campos) para conservar `fingerprint`/trazabilidad.
- **Ports nuevos** (interfaces, testeables con fakes):
  - `SpeechTranscriber.transcribe(audio: Uint8Array, opts): Promise<{ text }>` — STT.
  - `PatientRowExtractor.extract(transcript): Promise<ParsedPatientRow[]>` — produce el **mismo tipo** que
    el parser de Excel (la UI usa el primer/único registro; 1-a-1).
  - `HospitalPatientExportReader.loadForHospital(hospitalId): ExportRow[]` — público + sensible, scoped.
- **Casos de uso nuevos:** `ExportHospitalPatients` (lectura → filas canónicas, sin generar `.xlsx`),
  `EditPatient` (recalcula `PersonName`/`DocumentId`/`is_minor`/`status`; re-evalúa `looksDeceased` si
  cambia la nota; scoped; auditado), `CreateHospital`, `InviteTeamMember`, `SetTeamMemberAccess` (reciben
  el `actor` para validar scope).
- **Validez (D9):** regla `nombre || cédula` en el dominio (value objects) para que valga igual en los tres
  caminos.
- **Helpers de permisos:** `canManageHospitalTeam(role)`, `canResolveReview(member, caseHospitalId)`,
  además de los `canUpload`/`canModerate` existentes.

### 4.2 Infraestructura (`apps/web/lib/infrastructure`, adapters)

- `DrizzleHospitalPatientExportReader`: JOIN `patients`×`admissions`×`hospitals` +
  `sensitive.contacts`/`sensitive.clinical_notes`, **filtrado por `hospitalId`**, vía `service_role`.
- `SheetjsWorkbookWriter`: `ExportRow[]` → `Uint8Array` (.xlsx) — inverso del parser; **mismo header** que
  la ingesta (sin columnas de control), para round-trip limpio.
- `OpenAiSpeechTranscriber` (adapter de `gpt-4o-transcribe`; ver D2) y `ClaudePatientRowExtractor`
  (Anthropic SDK, salida estructurada vía tool/JSON schema). **Aquí, y solo aquí, viven los SDK externos**
  (ESLint onion: el core queda puro). Env: `OPENAI_API_KEY` (STT) + `ANTHROPIC_API_KEY` (extracción).
- **Idempotencia del round-trip (D6):** (1) filas idénticas → `content_hash` (`raw_rows`) coincide → se
  saltan; (2) filas editadas → fingerprint distinto pero `decideMatch` reconcilia por **cédula** (o nombre)
  → merge/update, no duplica. **Hueco documentado:** editar nombre **y** cédula a la vez puede crear un
  paciente nuevo → se resuelve en la cola de revisión. (Mitigación opcional, no en este spec: columna-clave
  estable en el export.)

### 4.3 Presentación (`apps/web`)

- **Vista "Cargar"** (`app/admin/(protected)/cargar`): captura **continua**. Cabecera con hospital **fijo**
  (scoped) o **selector** (admin) + contador; botones **Dictar / Manual / Subir Excel**; **lista en vivo**
  de lo cargado por su hospital; **"Descargar mi Excel"**; **"✏️ Editar"** por fila. Panel de confirmación
  **compartido** por dictado, manual y edición (campos + **selector de estado + toggle ¿falleció?**).
- **Server actions** (re-verifican sesión/rol/scope; defensa en profundidad):
  `dictarPacienteAction` (STT+extracción, **sin guardar**), `confirmarDictadoAction`/
  `cargarPacienteManualAction` (→ `ingestParsed` con `forcedHospitalId`), `editarPacienteAction`,
  `descargarExcelAction` (buffer con `Content-Disposition: attachment`, auditada), acciones de P4/P5.
  `subirExcelAction` (existente) pasa a recibir `forcedHospitalId` cuando el miembro es scoped.
- **P4 admin** (`app/admin/(protected)/equipo`): global gestiona hospitales + todo el personal;
  `hospital_admin` gestiona **solo** el personal de su hospital (no crea moderadores globales).
- **P5 revisión:** acotar `listReviewQueue`/`resolveReview` por `hospitalId` del actor (`canResolveReview`).
- **Login (D3):** sesión larga en Supabase Auth (refresh token + cookie persistente; ya hay refresh en
  `middleware.ts`).
- `maxDuration`/`runtime` en los segmentos nuevos; `ANTHROPIC_API_KEY` + clave STT en env.

### 4.4 Datos (`packages/db` + migración)

- Migración `supabase/migrations/00NN_team_role_hospital_admin.sql`: añadir `hospital_admin` al enum
  `team_role`; reflejar en `packages/db/src/schema/public.ts`. Sin otros cambios de esquema (los datos de
  voz/manual reusan `patients`/`admissions`/`sensitive`/`raw_rows`).

## 5. Privacidad (innegociable — checklist Gate 1)

- **Separación `public`/`sensitive` intacta.** La descarga lee `sensitive` **solo server-side** vía
  `service_role`, **acotada al hospital**; jamás se importa `sensitive` en cliente.
- **Buscador público sin cambios.** Esta feature **no toca** `search_patient`. La política vigente del
  buscador es la de **ADR-0003 / spec 0015** (migración `0006_search_patient_show_all`): toda coincidencia
  —**incluidos menores y fallecidos**— devuelve hospital + nombre + mesa de información, porque tras el
  sismo las familias necesitan saber **en qué hospital** está la persona. Lo que se mantiene protegido: el
  buscador **jamás** devuelve datos del esquema `sensitive` (teléfono/dirección/notas del paciente), solo el
  `info_desk_phone` del hospital; y el nombre se muestra **limpio de marcadores** ("menor"/"fallecido", PRs
  #53/#58). 0018 solo **captura** `is_minor` y el estado/`¿falleció?`; **no** cambia lo que ve el buscador.
  (El efecto del *estado* en el buscador —localizado/de alta salen, trasladado actualiza— es otro mini-spec.)
- **Voz a terceros:** el STT ve PII → adapter con **cláusula no-train**, **procesador documentado**, **aviso
  visible** al personal. **Audio descartado** tras transcribir (no se persiste blob).
- **Scoping:** un miembro de hospital A no lee/descarga/edita/resuelve nada de B (validado server-side).
- **Audit:** descargas, ediciones, altas y resoluciones quedan en `audit_log`.
- Checklist: ¿expone `sensitive` al cliente? NO · ¿grants nuevos a `anon`? NO · ¿buscador intacto? SÍ.

## 6. Plan TDD / verificación

- **Core (Vitest, test primero):**
  - `IngestPatientList.ingestParsed`: tests existentes verdes (paridad de `IngestionSummary`) + caso "una
    fila dictada" que pasa por dedup/merge/menor/fallecido; `forcedHospitalId` fuerza el hospital.
  - `ExportHospitalPatients`: mapeo a filas canónicas + **scoping** (no fuga de otros hospitales).
  - `EditPatient`: recálculo de value objects; cambio de nota re-evalúa `looksDeceased`; scoped + audit.
  - `PatientRowExtractor` (fake): mapeo transcript→`ParsedPatientRow` (cédula/edad/estado/notas).
  - Validez `nombre || cédula`; permisos (`canResolveReview`, `canManageHospitalTeam`).
- **Infra:** adapters Drizzle (export scoped), `SheetjsWorkbookWriter` (header == ingesta).
- **E2E manual:** descargar Excel scoped y re-subirlo editado (no duplica) · dictar un paciente y confirmar
  · menor/fallecido no expone nombre · audio no persiste · admin invita y el invitado queda acotado ·
  `hospital_admin` resuelve solo su cola.
- `pnpm typecheck` 4/4 · `pnpm test` verde · `pnpm build` OK.

## 7. Fuera de alcance

- **Efecto del estado en el buscador** (localizado/de alta salen; trasladado actualiza) → **mini-spec con
  Gate 1 propio** (toca el contrato del buscador).
- **Offline / PWA (Fase 1b):** cola local (IndexedDB) + sync idempotente (`clientGeneratedId`). Manual
  funciona offline; voz encola el audio y **difiere la confirmación** al recuperar red. Es el componente
  más pesado; se hace tras P0–P5.
- **Bot de Telegram (Fase 2):** webhook `/api/telegram/webhook` + identidad `telegram_id → hospital`
  (código de enrolamiento); reutiliza ports de voz + `ingestParsed`. Solo documentado.
- **Self-host de STT** (EC2/Whisper) y **columna-clave** para round-trip bulletproof: opciones de Gate 1,
  no implementadas aquí.

## Apéndice A — Comparativa de infra/coste del STT (insumo de Gate 1)

> El LLM **no** transcribe audio. Son 2 jobs: **STT** (audio→texto) + **extracción** (texto→campos, Claude
> Haiku 4.5, ~fracción de centavo/nota). La decisión es **solo dónde corre el STT**.

| | A. APIs gestionadas | B. Self-host (EC2) | C. Híbrido |
|---|---|---|---|
| STT | Whisper API ~$0.006/min · Deepgram ~$0.004/min | `faster-whisper` en EC2 | Whisper en EC2 |
| Infra extra | **Ninguna** (cabe en Vercel Pro) | Servidor 24/7 + mantenimiento | EC2 + API |
| EC2 | — | CPU `c6i.xlarge` ~$122/mo o `t3.large` ~$60/mo; GPU `g4dn.xlarge` ~$380/mo (large-v3 RT). Spot −~70% | igual |
| Coste/nota 30s | **~$0.005** (≈$5/1.000) | coste fijo del server | ~$0.003 + server |
| Terceros con PII | OpenAI/Deepgram (audio) + Anthropic (texto); no-train por defecto en API de pago | **nadie** el audio; texto a Claude | audio NO; texto a Claude |
| Ops | Trivial | Alta | Media |

**Decisión (2026-06-29): A.** Coste trivial (~$5/1.000 dictados), cero servidores, cabe en Vercel Pro;
self-host no se amortiza hasta ~12k dictados/mes. STT=`gpt-4o-transcribe`, extracción=Claude Haiku 4.5,
con DPA/no-train + aviso al personal. EC2 (B/C) queda como evolución si se exige cero-terceros.

Números verificados (jun-2026): OpenAI `gpt-4o-transcribe` $0.006/min · `gpt-4o-mini-transcribe`
$0.003/min · Deepgram Nova-3 batch $0.0043/min · Claude Haiku 4.5 $1/$5 por 1M tok · EC2 on-demand
`t3.large` $0.083/hr (~$60/mes), `c6i.xlarge` ~$122/mes, `g4dn.xlarge` $0.526/hr (~$380/mes, spot ~$115).
