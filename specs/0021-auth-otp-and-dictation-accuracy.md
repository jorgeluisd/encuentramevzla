# 0021 — Acceso por código OTP + precisión del dictado por voz

Estado: **propuesto** (pendiente GATE 1) · Rama: `feat/0021-auth-otp-and-dictation` (desde `develop`).
Capas: presentation (`/admin/login`, `/admin/cargar`) · infrastructure (STT adapter) · application/domain
(port de transcripción). **Privacidad:** no toca datos del buscador; el audio del dictado se descarta tras
transcribir (D7). El código OTP no lleva datos de pacientes.

> Reusa lo ya construido: **0007** (auth magic-link + guard allow-list `team_members`), **0018-voice**
> (dictado STT + extracción), **0020** (borrador editable, humano en el loop). NO reinventa el guard ni el
> flujo de ingesta: cambia el **método de verificación de auth** y **endurece la captura/contexto del STT**.

Este incremento junta dos arreglos de fiabilidad pedidos por el dueño. Son independientes pero se
implementan y despliegan juntos. **PWA offline queda explícitamente fuera** (spec propio; ver §5).

---

## 1. Problema

### 1.1 Magic link falla en celulares
El flujo actual (`0007`) usa **magic link con PKCE**: `signInWithOtp` guarda un *code verifier* en una
**cookie del navegador que lo pidió**; `/auth/callback` hace `exchangeCodeForSession(code)` y necesita esa
cookie. Falla cuando **el enlace se abre en otro navegador/WebView** (app de correo, WhatsApp, in-app
browser), cuando un **escáner/preview** consume el enlace de un solo uso, o cuando la **Redirect URL** no
está en la allow-list. Síntoma: "envié el enlace y no entra".

### 1.2 Precisión del dictado varía por dispositivo
La transcripción es **server-side y la misma para todos** (`gpt-4o-transcribe`, `openai-speech-transcriber.ts`).
La variación entre celulares NO es del modelo: es del **audio que se captura**. Hoy la captura
(`cargar-client.tsx`) graba a **32 kbps** y usa `getUserMedia({ audio: true })` **sin constraints**, así que
cada SO/navegador aplica su propio AGC/supresión de ruido; la app instalada captura distinto que el
navegador. A 32 kbps las **consonantes fricativas** (jh/s/f) se aplastan → "jhoseiddy sifontes" cae a
"disifontes/cifontes". Además no se pasa **contexto** al modelo para sesgar nombres propios.

---

## 2. Parte A — Acceso por código OTP (cross-device)

### 2.1 Cambio de fondo
Añadir verificación por **código de 6 dígitos** (`verifyOtp`) además del enlace. El código se valida
**server-side contra email + token**, sin depender de la cookie del navegador de origen → **se puede teclear
en un navegador distinto al que recibió el correo**. Resuelve 1.1 de raíz.

### 2.2 UI (`apps/web/app/admin/login/page.tsx`)
Login de **dos pasos** en la misma pantalla:
1. **Pedir acceso:** input email → `signInWithOtp({ email, options: { emailRedirectTo } })` (igual que hoy).
   Estado `sent`.
2. **Verificar código:** en estado `sent`, mostrar input de 6 dígitos (`inputMode="numeric"`,
   `autoComplete="one-time-code"`, `maxLength=6`) + botón "Entrar". Al enviar:
   `supabase.auth.verifyOtp({ email, token, type: "email" })`. Éxito → `router.push("/admin/ingesta")`.
   Error → aviso "Código inválido o vencido. Pide uno nuevo." Mantener "Usar otro correo" y un
   "Reenviar código".
- El enlace sigue funcionando (respaldo mismo-navegador); `/auth/callback` **no cambia**.
- El **guard** de `/admin/(protected)/layout.tsx` (allow-list `team_members`) **no cambia**: sigue decidiendo
  quién entra de verdad. OTP solo prueba el email.

### 2.3 Configuración Supabase (no-código, panel — parte ya hecha)
- **SMTP:** ✅ ya configurado por el dueño (Resend).
- **Template "Magic Link":** incluir `{{ .Token }}` (código) manteniendo `{{ .ConfirmationURL }}` (enlace de
  respaldo). HTML en **Apéndice A**.
- **Redirect URLs / Site URL:** confirmar `https://encuentramevzla.com`, `https://www.encuentramevzla.com`
  y `…/auth/callback` en la allow-list (causa 1.1 restante).

### 2.4 Privacidad/seguridad
Sin contraseñas. OTP de un solo uso, caduca 15 min. El correo no lleva datos de pacientes. El rate-limit de
auth de Supabase aplica; no se loguea el código.

---

## 3. Parte B — Precisión del dictado

Tres palancas independientes, de mayor a menor costo/beneficio. Se pueden mergear por separado.

### 3.1 (A) Subir el bitrate de grabación
`apps/web/app/admin/(protected)/cargar/cargar-client.tsx` — `audioBitsPerSecond: 32_000` → **64_000**
(evaluar 96_000). Clips cortos → sube poco el peso; recupera las consonantes. Cambio de una línea.

### 3.2 (B) Prompt de contexto al STT
Pasar un `prompt` a `gpt-4o-transcribe` para sesgar hacia vocabulario esperado (apellidos venezolanos,
jerga hospitalaria). Cambios:
- `@evzla/core`: extender `TranscribeOptions` con `prompt?: string` (port puro).
- `packages/core`: constante `DICTATION_STT_PROMPT` (string genérico de vocabulario; **sin datos reales de
  pacientes**) que el use case `TranscribePatientDictation` pasa por defecto.
- `apps/web/.../openai-speech-transcriber.ts`: reenviar `opts.prompt` a `transcriptions.create({ prompt })`.

### 3.3 (C) Constraints de `getUserMedia`
`cargar-client.tsx` — `getUserMedia({ audio: { channelCount: 1, echoCancellation: true,
noiseSuppression: false, autoGainControl: true } })`. Homogeneiza dispositivos; **desactivar
noiseSuppression suele ayudar en nombres propios**. Requiere prueba A/B en al menos 2 celulares antes de
fijar el valor final (documentar resultado).

---

## 4. Criterios de aceptación

**Parte A**
- [ ] Puedo pedir el código en el navegador X, recibir el correo en el celular, y **entrar tecleando el
      código en X**.
- [ ] El enlace sigue funcionando como respaldo en el mismo navegador.
- [ ] El guard `team_members` sigue bloqueando a quien no está en la allow-list.
- [ ] Código vencido/erróneo → mensaje claro y opción de reenviar.

**Parte B**
- [ ] "jhoseiddy sifontes" mejora respecto de la línea base en el dispositivo de prueba (transcript más
      cercano; el borrador es editable igual).
- [ ] El `prompt` no contiene datos reales de pacientes.
- [ ] `pnpm typecheck && pnpm test && pnpm build` verdes.

---

## 5. Fuera de alcance
- **PWA offline (Service Worker + IndexedDB + sync)** — spec propio con Gate 1 y análisis de privacidad
  (datos cacheados en dispositivo). Hoy la PWA es solo *instalable* (`manifest.ts`, sin SW).
- Cambiar de proveedor STT o self-host de Whisper (spec 0018 §7).
- Deshabilitar del todo el magic link (se mantiene como respaldo).

---

## 11. Plan de tareas

Orden: **domain/application (port) → infrastructure → presentation**. PRs pequeños a `develop`.

### Parte A — Auth OTP (presentation + config)

```
[T1] Login de dos pasos con verifyOtp (código 6 dígitos)
  Capa: presentation · Archivos: apps/web/app/admin/login/page.tsx
  Criterios: §2.2 (estado sent → input código → verifyOtp type "email" → push /admin/ingesta)
  Strict TDD: OFF (UI) · Verificación: manual cross-device
  Privacidad: no expone datos; código single-use

[T2] Config Supabase (no-código, dueño)
  Template "Magic Link" con {{ .Token }} (+ {{ .ConfirmationURL }}); Redirect URLs completas.
  Criterios: §2.3 · Apéndice A (HTML) · SMTP ya hecho
```

### Parte B — Dictado (domain → infra → presentation)

```
[T3] Extender TranscribeOptions.prompt + constante DICTATION_STT_PROMPT
  Capa: domain/application (port puro) · Capacidad: patient-registry
  Archivos: packages/core/.../ports/speech-transcriber.ts (+ constante), use case dictado
  Criterios: §3.2 · Strict TDD: ON (el use case pasa el prompt por defecto)
  Privacidad: prompt genérico, sin datos de pacientes

[T4] OpenAiSpeechTranscriber reenvía prompt
  Capa: infrastructure · Archivos: apps/web/.../openai-speech-transcriber.ts (+ .test.ts)
  Criterios: §3.2 · Strict TDD: ON (fake OpenAI; assert prompt forwardeado)

[T5] Subir bitrate + constraints de getUserMedia
  Capa: presentation · Archivos: apps/web/.../cargar/cargar-client.tsx
  Criterios: §3.1 (64–96 kbps), §3.3 (constraints) · Verificación: A/B manual 2 dispositivos
  Strict TDD: OFF (captura de audio del navegador)
```

---

## Verificación
- `pnpm typecheck && pnpm test && pnpm build` verdes antes de cada merge.
- **Auth:** prueba cross-device (pedir en desktop, código al celular, entrar en desktop) + prueba de link de
  respaldo + prueba de allow-list (email fuera de `team_members` → acceso denegado).
- **Dictado:** grabar "jhoseiddy sifontes" en ≥2 dispositivos (incluida la app instalada) antes/después;
  registrar el transcript para fijar bitrate y decidir `noiseSuppression`.

---

## Apéndice A — HTML del template "Magic Link" (código OTP + enlace de respaldo)

Ver el HTML entregado en la conversación (código `{{ .Token }}` grande + enlace `{{ .ConfirmationURL }}`
secundario, marca `#1565c0`, aviso de caducidad 15 min).
