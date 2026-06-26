# 0004 — Concepto UI/UX (pantallas y flujos)

Estado: en progreso · Fuente: prototipo de UI/UX `docs/design/concept-mvp1.html` (referencia local, gitignored).
Destila el concepto a documentación versionada. **Tokens** en `specs/0003-design-system.md`. Mobile-first.

> Tomamos el **concepto** del prototipo, pero adaptado a lo que conviene al proyecto: privacidad mediada
> (ver `specs/0001`/`README` y `.claude/skills/privacy-and-security.md`) y stack real (Next 16 + Supabase).
> Lo que en el prototipo es estático aquí se mapea a casos de uso reales.

## Dos áreas

| Área | Quién | Entrada |
|---|---|---|
| **Público** | Familias / ciudadanía | Sin login. Buscador mediado. |
| **Privado** | Personal de hospitales y voluntariado verificado | Login magic-link. Ingesta de listas. |

Elementos comunes de marca: logo + wordmark `encuentrameVZLA`, franja tricolor de Venezuela en el header.

---

## A. PÚBLICO

### Estructura persistente
- **Nav**: logo + wordmark; enlaces `Inicio · Cómo funciona · Hospitales · Soy voluntario`.
  En móvil debe simplificarse/colapsar (el prototipo es desktop; ver mobile-first en 0003).
- **Aviso de emergencia (sticky)**: *"Portal exclusivamente informativo. Para emergencias contacte de
  inmediato al 171 · *1 · 112 · 911"*. Siempre visible.

### A1. Buscador (estado inicial)
- Badge de confianza: *"Listas verificadas · actualizado hoy"*.
- Título: **"Encuentra a tu familiar"**. Subtítulo: *"Busca a una persona ingresada en un hospital tras
  el sismo. Es privado y seguro."*
- **Card de búsqueda**: campos **Nombre**, **Apellido**, **Cédula (opcional)** + botón **BUSCAR**.
  - Móvil: campos apilados full-width; desde `md`: en fila.
  - Reaseguro: *"Solo verás el hospital y un teléfono de ayuda. Nada de datos médicos."*
- **3 tarjetas de "cómo funciona"**: *Listas unidas · Datos cuidados · Teléfono de ayuda* (1 col móvil → 3 col `md`).
- **CTA Cruz Roja**: *"¿No encuentras a tu familiar? La Cruz Roja también te ayuda a buscar."* + teléfono.

> Mapea a: caso de uso `SearchPatients` → RPC `public.buscar_paciente(termino)`. La búsqueda es por
> **nombre o cédula**; el término se valida (mín. 4 chars) y se registra solo su **hash**.

### A2. Coincidencia (hay match)
- Encabezado *"Resultados para {nombre buscado}"* + botón **← Nueva búsqueda**.
- Badge verde *"1 coincidencia confirmada"*.
- **Card de resultado**: rótulo *"Institución hospitalaria"* + **nombre del hospital** + *"Verificado por el
  equipo del hospital · hace 2 h"*.
- Nota de privacidad: *"No mostramos diagnóstico, edad ni dirección. La mesa de información del hospital
  te dirá qué hacer."*
- **Teléfono de mesa de información** + botón **Llamar** (rojo, `tel:`).
- Pie: *"Las noticias delicadas siempre las da una persona, nunca la app."*

> Mapea al contrato del RPC: devuelve **solo** `{ hospital_nombre, hospital_telefono_mesa, confianza }`.
> ⚠️ **NO mostrar nombres/datos del paciente.** Mostrar nombres de pacientes es una **decisión abierta**
> (requiere a la residente + migración) — ver `README` y `privacy-and-security.md`. El concepto NO los muestra.
> Menores/fallecidos → no devuelven datos: derivan a **contacto humano** (estado a contemplar en la UI).

### A3. Sin resultados (deriva a Cruz Roja)
- Mensaje de **esperanza**: *"Aún no tenemos información en el sistema… que no aparezca no significa una
  mala noticia; solo que su nombre aún no ha sido ingresado. No pierda la esperanza y vuelva a consultar."*
- **CTA Cruz Roja** + teléfono.

> Este estado cubre tanto "sin coincidencia" como el marcador `{ requiere_contacto_humano: true }`
> (menores/fallecidos), siempre derivando a una persona, nunca dando la noticia la app.

---

## B. PRIVADO (portal del equipo)

### Estructura
- **Nav privado**: logo + *"Portal del equipo"*; chip de usuario + **Salir** (cuando hay sesión).

### B1. Login seguro (magic-link)
- Título *"Acceso del equipo"* · *"Personal de hospitales y voluntariado verificado"*.
- **Acceso sin contraseña**: enlace mágico al **correo institucional**; *caduca en 15 minutos*.
- Estado **enviado**: *"Revisa tu correo… Enviamos un enlace de acceso."* + *"Usar otro correo"*.
- Nota: *"Acceso restringido. Cada lista cargada pasa por deduplicación y validación humana."*

> Mapea a: **Supabase Auth magic-link** (previsto) + roles. Ver `.claude/skills/supabase.md`.

### B2. Dashboard / Ingesta de listas
- Título *"Portal de carga de listas"* + contexto del hospital/sesión.
- **Dropzone**: arrastrar archivo; formatos **.xlsx · .csv**, máx. **10 MB**; botón *"Seleccionar archivo"*.
- Nota: *"Cada lista pasa por deduplicación y validación humana antes de publicarse en el buscador."*
- **Tabla "Cargas recientes"**: columnas `Archivo · Subido por · Registros · Fecha · Estado`.
  - Badges de estado: **Publicada** (success) · **En revisión** / **N duplicados** (warning) ·
    **Formato inválido** (danger).
  - Móvil: la tabla hace **scroll horizontal** (no romper layout).

> Mapea a: Server Action de ingesta → caso de uso `IngestPatientList` (parser SheetJS + repos Drizzle).
> El concepto añade **.csv** además de **.xlsx** (hoy el parser es xlsx) → pendiente a evaluar.
> Los estados de carga reflejan la cola de **revisión humana** (7 casos dudosos pendientes en el proyecto).

---

## Notas de adaptación (concepto → proyecto)

- ✅ El concepto **respeta la privacidad mediada**: solo hospital + teléfono, sin datos médicos, la
  persona da las malas noticias. Alineado con la constitución del proyecto.
- ⚠️ **Nombres de pacientes**: el concepto NO los muestra → mantener así hasta resolver la decisión abierta.
- ⚠️ **CSV en ingesta**: el concepto lo ofrece; el parser actual es solo `.xlsx`. Evaluar antes de prometerlo en UI.
- ⚠️ **Menores/fallecidos**: añadir explícitamente el estado "contacto humano" en la UI pública.
- 🎨 **Tokens**: usar Inter + paleta oficial de `specs/0003`, no Poppins/navy del prototipo.
- 📱 **Mobile-first**: el prototipo está pensado en desktop; al construir, partir del layout de celular (0003 §6).

## Pendiente (no se diseña aún)

Wireframes/responsive por pantalla, estados de carga/errores del buscador, vacío de menores/fallecidos,
componentes shadcn/ui concretos, y el spec de implementación de cada pantalla (vendrá por el pipeline SDD).
