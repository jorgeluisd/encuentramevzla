# EncuéntrameVzla — Arquitectura, flujos y glosario

Documento de referencia (no técnico-pesado) para entender **cómo funciona todo el sistema**:
qué piezas hay, cómo se comunican, qué es público y qué no, y un glosario de cada término.

> Regla de oro del proyecto: **privacidad mediada**. Una familia busca por nombre o cédula y
> solo recibe *"hay una coincidencia en el Hospital X — mesa de información: [tel]"*. Nunca datos
> personales del paciente.

---

## 1. ¿Tenemos una API? ¿Es pública? ¿Cómo nos comunicamos?

**No tenemos una API REST propia** tipo `/api/buscar`. Todo el servidor es la app Next.js, que corre
en **AWS Lambda** (empaquetada con OpenNext) detrás de **CloudFront**. Desde el 9 de octubre de 2026
todo vive en AWS (`sa-east-1`); ver [ADR-0010](../adr/0010-migracion-supabase-vercel-a-aws.md).

- La base es **RDS PostgreSQL 18** (base `encuentramevzla`, privada). El navegador **nunca** habla con ella.
- La **única "puerta" pública a los datos** es **una función** de la base: el **RPC** `search_patient`
  (más `list_solidarity_services` para el directorio de servicios). No hay acceso directo a tablas.
- El navegador del público habla con una **Server Action** (código de servidor de Next.js en Lambda), y esa
  Server Action llama al RPC con el rol de base **`evzla_public`**, que **solo** puede ejecutar esos RPC.

Hay **dos caminos de comunicación** muy distintos según quién use el sistema:

| | **Público (familias)** | **Equipo (admin / ingesta)** |
|---|---|---|
| Entra por | La home `/` | `/admin/*` (requiere login) |
| Se autentica | No (anónimo) | Sí (código de un solo uso por correo, **Amazon Cognito** EMAIL_OTP) |
| Cómo llega a los datos | Server Action → **RPC `search_patient`** con el rol `evzla_public` | Server Actions / páginas → **Drizzle** con el rol `evzla_admin` |
| Qué puede ver | Solo el resultado mediado (hospital + teléfono de la mesa + nombre) | Lo que su rol de equipo permita (cola de revisión, auditoría, etc.) |
| Puede tocar tablas | **No** (el rol `evzla_public` no tiene grants sobre tablas) | Sí, desde el servidor |

En resumen: **la "API pública" es una sola función de base de datos, mediada y blindada**, y se
accede a ella a través de nuestro propio código de servidor.

---

## 2. Vista general del sistema

```mermaid
flowchart TB
    subgraph internet["🌍 Internet"]
        familia["👩 Familia<br/>(navegador, anónimo)"]
        equipo["🧑‍💼 Equipo<br/>(navegador, con login)"]
    end

    subgraph cf["☁️ Cloudflare"]
        dns["DNS de encuentramevzla.com"]
        turnstile["Turnstile<br/>(verificación humana)"]
    end

    subgraph aws["🟧 AWS sa-east-1"]
        cdn["CloudFront<br/>(+ header x-origin-verify)"]
        lambda["Lambda — Next.js vía OpenNext<br/>(home, Server Actions, /admin, proxy.ts)"]
        cognito["Cognito<br/>(EMAIL_OTP)"]
        s3["S3<br/>(subidas de Excel)"]
        secrets["Secrets Manager<br/>(evzla/db/*, evzla/app)"]
        sched["EventBridge Scheduler<br/>→ Lambda de purga"]
        subgraph rds["RDS PostgreSQL 18 (blockealo-prod-db)"]
            rpc["RPC search_patient<br/>(SECURITY DEFINER, mediado)"]
            pg[("🐘 base encuentramevzla<br/>schema public + sensitive")]
        end
    end

    familia -->|"resuelve dominio"| dns
    familia -->|"resuelve reto"| turnstile
    familia --> cdn
    equipo --> cdn
    cdn --> lambda
    lambda -->|"valida token"| turnstile
    lambda -->|"rol evzla_public"| rpc
    rpc --> pg
    lambda -->|"rol evzla_admin (Drizzle)"| pg
    lambda -->|"login / refresh"| cognito
    lambda -->|"URL prefirmada / lectura"| s3
    lambda -->|"credenciales"| secrets
    sched -->|"rol evzla_job: purge_search_log()"| pg

    classDef pub fill:#fee2e2,stroke:#b91c1c;
    classDef srv fill:#dbeafe,stroke:#1d4ed8;
    classDef db fill:#dcfce7,stroke:#15803d;
    class familia,equipo pub;
    class cdn,lambda,cognito,s3,secrets,sched srv;
    class rpc,pg db;
```

**Cómo leerlo:** rojo = público/no confiable, azul = nuestra infraestructura AWS, verde = base de datos.
El público (rojo) **nunca** toca el verde directamente: siempre pasa por el azul.

---

## 3. Flujo detallado: búsqueda pública (con anti-abuso)

Este es el camino completo cuando una familia busca a alguien.

```mermaid
sequenceDiagram
    autonumber
    participant U as 👩 Navegador (familia)
    participant T as ☁️ Turnstile (Cloudflare)
    participant A as λ Server Action (Lambda)
    participant R as 🟢 RPC search_patient (RDS)
    participant DB as 🐘 Postgres

    U->>U: Llena Nombre / Apellido / Cédula
    U->>T: El widget genera un token de humanidad
    T-->>U: token (un solo uso, ~minutos)
    U->>A: Envía formulario (datos + token) [POST]

    Note over A: 1) Lee la IP (x-forwarded-for)<br/>2) Calcula client_hash = sha256(ip + sal)
    A->>T: ¿Es válido este token? (siteverify + clave secreta)
    T-->>A: sí / no
    alt token inválido
        A-->>U: "No pudimos verificar la solicitud"
    else token válido
        A->>R: search_patient(term, client_hash) [rol evzla_public, TLS]
        Note over R: Rate-limit: ¿este client_hash<br/>hizo +300 búsquedas en 10 min?
        alt excede el límite
            R->>DB: registra hash + 'rate_limited'
            R-->>A: { rate_limited: true }
            A-->>U: "Demasiadas búsquedas, espera un momento"
        else dentro del límite
            R->>DB: matching por nombre/cédula (solo schema public)
            R->>DB: registra hash del término + resultado
            R-->>A: hospital(es) + mesa de información
            A-->>U: Resultados (o "todavía no encontramos…")
        end
    end
```

**Puntos clave de privacidad en este flujo:**
- La **IP nunca se guarda en claro**: se convierte en un *hash* irreversible antes de tocar nada.
- En `search_log` solo se guarda el **hash del término** buscado (nunca el texto) y el tipo de
  resultado. No se puede reconstruir qué se buscó.
- El RPC solo lee del schema `public`; el schema `sensitive` (teléfonos, direcciones, notas
  clínicas) **no es accesible** por este camino.

---

## 4. Qué decide el RPC por dentro

```mermaid
flowchart TD
    start(["Llega search_patient(term, client_hash)"]) --> norm["Normaliza el término<br/>(minúsculas, sin tildes, hash SHA-256)"]
    norm --> rl{"¿client_hash con +300<br/>búsquedas en 10 min?"}
    rl -->|Sí| limited["Registra 'rate_limited'<br/>→ devuelve { rate_limited: true }"]
    rl -->|No| valid{"¿término ≥ 4 caracteres?"}
    valid -->|No| invalid["Registra 'invalid_term'<br/>→ devuelve { invalid_term: true }"]
    valid -->|Sí| match["Busca coincidencias por token<br/>(AND por palabra · nombre o cédula)<br/>solo en schema public"]
    match --> log["Registra hash + 'matches' / 'no_results'"]
    log --> out["Devuelve hospital + nombre + mesa de información<br/>(agrupado por hospital)"]

    classDef stop fill:#fee2e2,stroke:#b91c1c;
    class limited,invalid stop;
```

> El **matching vive en SQL**, por eso se verifica con un *harness* de Node con transacción +
> ROLLBACK contra la base real (los tests normales de JavaScript no alcanzan el SQL).

---

## 5. Flujo: ingesta de listas (equipo / admin)

Cómo el equipo sube las listas de hospitales. Este camino **sí** escribe en la base, con el rol
`evzla_admin` y autorización por rol de equipo.

```mermaid
sequenceDiagram
    autonumber
    participant M as 🧑‍💼 Moderador (navegador)
    participant C as 🟧 Cognito
    participant N as λ Next.js (Lambda)
    participant S3 as 🟧 S3 (subidas)
    participant DB as 🐘 Postgres (Drizzle, rol evzla_admin)

    M->>N: Pide acceso con su correo [Server Action]
    N->>C: InitiateAuth (USER_AUTH, EMAIL_OTP)
    C-->>M: Código de un solo uso por correo
    M->>N: Envía el código
    N->>C: RespondToAuthChallenge → id token + refresh token (cookies httpOnly)
    N->>DB: Verifica membresía + rol (team_members)
    M->>N: Pide URL de subida [Server Action]
    N-->>M: URL prefirmada de S3 (tamaño y tipo firmados)
    M->>S3: Sube el .xlsx directo (PUT)
    M->>N: Procesar el objeto subido [Server Action]
    N->>S3: Lee el objeto (y lo borra al terminar)
    N->>N: Parsea (SheetJS), deduplica y arma el grafo en memoria (IDs propios)
    N->>DB: Persiste en LOTE dentro de UNA transacción (public + sensitive)
    Note over N,DB: Atómico por archivo: si algo falla, rollback total → reprocesable
    N->>N: revalidatePath('/') → regenera la home estática
    N-->>M: Resumen (insertados / duplicados / a revisar)
```

> **Robustez (spec 0017).** La ingesta corre en dos fases: (1) todo el dedup en memoria
> generando los IDs con `newId()`, y (2) persistencia **bulk** (un INSERT multi-fila por tabla)
> dentro de una **transacción** vía el port `IngestionUnitOfWork`. Esto elimina el N+1 de
> escritura (de minutos a segundos, evitando el timeout serverless) y da atomicidad por archivo.

---

## 6. Arquitectura del código (Onion + Screaming)

El código se organiza en **capas concéntricas**: las de afuera dependen de las de adentro, nunca al
revés. El **dominio no conoce a nadie**.

```mermaid
flowchart TD
    subgraph P["🖥️ Presentación — apps/web (Next.js)"]
        direction TB
        ui["Páginas, componentes, Server Actions"]
    end
    subgraph I["🔌 Infraestructura — adapters"]
        direction TB
        ad["TurnstileVerifier · DrizzlePatientSearchGateway · Drizzle repos · Cognito · S3 · SheetJS"]
    end
    subgraph A["⚙️ Aplicación — casos de uso + ports"]
        direction TB
        uc["SearchPatients · VerifyHumanChallenge · IngestPatientList …"]
    end
    subgraph D["💎 Dominio — puro, sin I/O"]
        direction TB
        dom["Value objects · reglas de matching/dedup"]
    end

    P --> I --> A --> D

    note["La dependencia apunta SIEMPRE hacia adentro →<br/>el dominio (💎) no importa nada de las otras capas"]
```

- **Dominio** (`@evzla/core`): reglas puras (cómo se normaliza un nombre, cómo se compara). Sin
  internet, sin base de datos.
- **Aplicación**: los *casos de uso* (ej. `SearchPatients`) y los *ports* (interfaces que dicen
  "necesito algo que verifique humanos", sin saber que es Turnstile).
- **Infraestructura**: los *adapters* que cumplen esos ports usando tecnología real (Turnstile,
  Drizzle, Cognito, S3, SheetJS).
- **Presentación**: Next.js (lo que el usuario ve) + el *composition root* que enchufa todo.

> Ventaja práctica: el día de mañana se puede cambiar Turnstile por otro proveedor tocando **solo**
> un adapter, sin tocar la lógica del buscador.

---

## 7. Fronteras de datos y privacidad

```mermaid
flowchart LR
    subgraph pub["schema public (no sensible)"]
        hospitals["hospitals<br/>(nombre, tel. mesa info)"]
        patients["patients<br/>(nombre normalizado, estado)"]
        admissions["admissions<br/>(ingresos)"]
        searchlog["search_log<br/>(SOLO hashes)"]
    end
    subgraph sens["schema sensitive (PII / clínico) 🔒"]
        contacts["contacts<br/>(teléfono, dirección)"]
        notes["clinical_notes<br/>(notas clínicas)"]
    end

    anon["👩 Público (rol evzla_public)"] -->|"solo EXECUTE del RPC"| rpc2["search_patient"]
    rpc2 -->|"lee"| pub
    rpc2 -.->|"❌ NUNCA"| sens
    server["λ Servidor (Drizzle, rol evzla_admin)"] -->|"lee/escribe"| pub
    server -->|"lee/escribe"| sens

    classDef forbidden fill:#fee2e2,stroke:#b91c1c;
    class sens forbidden;
```

- El rol **`evzla_public`** **no tiene permisos** sobre ninguna tabla; lo único que puede hacer es
  **ejecutar los RPC mediados**. Aunque un bug dejara pasar SQL por ese camino, no sirve para sacar datos.
- El schema **`sensitive`** solo es accesible desde el **servidor** con el rol `evzla_admin`. Jamás se
  expone al navegador.
- `evzla_job` solo puede ejecutar `purge_search_log()` (borra `search_log` de más de 90 días).

---

## 8. Modelo de datos (tablas y campos)

La base es **RDS PostgreSQL 18** (base `encuentramevzla` en la instancia `blockealo-prod-db`), partida en **dos schemas** por diseño de privacidad:
`public` (mostrable / no sensible) y `sensitive` (PII y clínico, aislado). El esquema lo define
Drizzle en `packages/db/src/schema/` y se materializa con las migraciones SQL de
`supabase/migrations/` (nombre heredado del proveedor anterior), aplicadas con el rol `evzla_owner`.

### 8.1 Relaciones (diagrama entidad-relación)

```mermaid
erDiagram
    HOSPITALS  ||--o{ ADMISSIONS : "recibe ingresos"
    PATIENTS   ||--o{ ADMISSIONS : "tiene ingresos"
    HOSPITALS  ||--o{ RAW_ROWS   : "origen del Excel"
    HOSPITALS  ||--o{ TEAM_MEMBERS : "asigna (opcional)"
    PATIENTS   ||--o{ CONTACTS   : "PII (sensitive)"
    ADMISSIONS ||--o{ CLINICAL_NOTES : "clínico (sensitive)"

    HOSPITALS { uuid id PK }
    PATIENTS { uuid id PK }
    ADMISSIONS { uuid id PK }
    RAW_ROWS { uuid id PK }
    TEAM_MEMBERS { uuid id PK }
    SEARCH_LOG { uuid id PK }
    AUDIT_LOG { uuid id PK }
    CONTACTS { uuid id PK }
    CLINICAL_NOTES { uuid id PK }
```

> **Detalle clave:** un paciente **no** lleva el hospital "pegado". La relación vive en
> `admissions` (ingresos), y un paciente puede tener **varios** → así se modelan **traslados**
> sin perder el histórico. Las tablas de `sensitive` referencian a `public` por **FK lógica**
> (la integridad se refuerza en SQL, no con una FK física entre schemas).

### 8.2 Tipos enumerados

| Enum | Valores | Significado |
|---|---|---|
| `person_status` | `admitted` · `transferred` · `discharged` · `located` · `deceased` | Estado del paciente/ingreso: en el hospital · trasladado · dado de alta · **localizado** (la familia ya lo encontró, cierra el círculo) · fallecido (desde ADR-0003 también muestra ubicación). |
| `team_role` | `uploader` · `moderator` | Rol en `/admin`: subir listas · subir + revisar/fusionar + ver auditoría. |

### 8.3 Schema `public` (datos mostrables / no sensibles)

**`hospitals`** — instituciones hospitalarias.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `name` | text · **NOT NULL** | Nombre del hospital (lo único de ubicación que ve el público). |
| `info_desk_phone` | text · null | **Único teléfono revelable**: la mesa de información. |
| `city` | text · null | Ciudad. |
| `active` | boolean · default `true` | Si está activo; el buscador solo considera hospitales activos. |

**`patients`** — la persona buscada.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `normalized_name` | text · **NOT NULL** | Nombre normalizado (minúsculas, sin tildes) para el matching. |
| `name_tokens` | text[] · null | Palabras del nombre, para comparación token-set (dedup/matching). |
| `age` | integer · null | Edad (no se muestra al público). |
| `doc_type` | text · null | Tipo de documento (cédula, pasaporte…). |
| `normalized_doc_number` | text · null | Cédula/documento normalizado, para búsqueda exacta. |
| `status` | person_status · default `admitted` | Estado de la persona. |
| `is_minor` | boolean · default `false` | Si es menor de edad. |
| `created_at` | timestamptz · default now | Fecha de alta del registro. |

**`admissions`** — ingreso de un paciente en un hospital (la relación N↔N en el tiempo).

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `patient_id` | uuid · **NOT NULL** · FK→patients | Qué paciente. |
| `hospital_id` | uuid · **NOT NULL** · FK→hospitals | En qué hospital. |
| `admitted_at` | timestamptz · null | Cuándo ingresó. |
| `status` | person_status · default `admitted` | Estado de **este** ingreso (permite traslados). |
| `has_public_notes` | boolean · default `false` | Si hay notas mostrables (no clínicas). |
| `created_at` | timestamptz · default now | Alta del registro. |

**`raw_rows`** — copia CRUDA de cada fila del Excel subido (trazabilidad + idempotencia).

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `file_id` | uuid · **NOT NULL** | Agrupa las filas de una misma carga. |
| `content_hash` | text · **NOT NULL · UNIQUE** | Huella de la fila: evita reprocesar la misma dos veces (idempotencia). |
| `raw_row` | jsonb · **NOT NULL** | La fila original tal cual vino del Excel. |
| `hospital_id` | uuid · null · FK→hospitals | Hospital de origen. |
| `uploaded_by` | uuid · null | Quién la subió. |
| `created_at` | timestamptz · default now | Cuándo se subió. |

**`team_members`** — allow-list del portal `/admin` (quién puede entrar y con qué rol).

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `email` | text · **NOT NULL · UNIQUE** | Correo (minúsculas); se une con el claim `email` del id token de Cognito. |
| `role` | team_role · **NOT NULL** | `uploader` o `moderator`. |
| `hospital_id` | uuid · null · FK→hospitals | Hospital asignado (null = moderador global). |
| `active` | boolean · default `true` | Si la membresía está activa. |
| `created_at` | timestamptz · default now | Alta. |

**`audit_log`** — bitácora **append-only** de toda mutación (no se actualiza ni borra).

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `actor_id` | uuid · null | Quién hizo la acción. |
| `action` | text · **NOT NULL** | Qué hizo (ej. `ingest_patient_list`, `merge_patients`). |
| `entity` | text · **NOT NULL** | Sobre qué entidad. |
| `entity_id` | uuid · null | Id de la entidad afectada. |
| `payload` | jsonb · null | Detalle/contexto de la acción. |
| `created_at` | timestamptz · default now | Cuándo. |

**`search_log`** — anti-enumeración. Guarda **solo hashes**, jamás texto en claro.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `term_hash` | text · **NOT NULL** | SHA-256 del término buscado (no reversible). |
| `result_type` | text · **NOT NULL** | `invalid_term` · `matches` · `no_results` · `rate_limited`. |
| `client_hash` | text · null | SHA-256 de la IP (+sal), para el rate-limit. *(Añadido en migr. 0007.)* |
| `created_at` | timestamptz · default now | Cuándo. |

> ⚠️ **Drift conocido a sincronizar:** la columna `client_hash` existe en la BD (migración 0007)
> pero todavía **no** está declarada en el schema Drizzle (`packages/db/src/schema/public.ts`).
> No rompe nada (esa columna la escribe el RPC en SQL, no Drizzle), pero conviene añadirla para
> que el esquema TypeScript refleje la realidad.

### 8.4 Schema `sensitive` (PII / clínico — AISLADO 🔒)

El rol anónimo **no tiene ningún grant** aquí. Solo el servidor (Drizzle, conexión directa) lo
toca. El RPC `search_patient` **jamás** lee de este schema.

**`sensitive.contacts`** — datos de contacto/PII del paciente.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `patient_id` | uuid · **NOT NULL** · FK lógica→public.patients | A qué paciente. |
| `phone` | text · null | Teléfono personal **(nunca al público)**. |
| `address` | text · null | Dirección **(nunca al público)**. |

**`sensitive.clinical_notes`** — notas clínicas del ingreso.

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | uuid (PK) | Identificador. |
| `admission_id` | uuid · **NOT NULL** · FK lógica→public.admissions | A qué ingreso. |
| `note` | text · null | Nota clínica **(nunca al público)**. |
| `arrived_with` | text · null | Con qué/quién llegó **(nunca al público)**. |

### 8.5 Por qué esta arquitectura de datos

- **Separación física `public`/`sensitive`**: aunque alguien comprometa la clave anónima, no
  alcanza la PII (está en otro schema sin grants).
- **`patients` ↔ `admissions` separados**: una persona puede ser trasladada; cada ingreso es una
  fila → histórico completo sin sobrescribir.
- **`raw_rows` con `content_hash` único**: subir el mismo Excel dos veces no duplica datos.
- **`audit_log` append-only**: todo cambio queda trazado para revisión humana.
- **`search_log` solo hashes**: se puede medir uso/abuso (volumen, `rate_limited`) sin saber **qué**
  ni **quién** buscó.

---

## 9. Glosario de términos

### Frontend y servidor

| Término | Qué es (en cristiano) |
|---|---|
| **Next.js** | El framework con el que está hecha la web (páginas, navegación, y también código de servidor). |
| **AWS Lambda + OpenNext** | Donde corre la web: OpenNext empaqueta Next.js para que corra en funciones Lambda (`build:aws`). |
| **CloudFront** | La CDN de AWS delante de la Lambda y de los archivos estáticos. Le agrega a cada pedido el header `x-origin-verify` para que nadie llame a la Lambda por fuera. |
| **App Router** | La forma moderna de Next.js de organizar páginas por carpetas. |
| **Server Component (RSC)** | Componente que se ejecuta **en el servidor** y manda HTML ya listo. No corre en el navegador. |
| **Client Component** | Componente que corre **en el navegador** (necesita interactividad: clicks, estados…). |
| **Server Action** ⭐ | Una **función de servidor** que el formulario llama directamente. Recibe los datos, hace cosas seguras (verificar Turnstile, leer la IP, llamar a la base) y devuelve el resultado. El navegador no ve esa lógica. **Es por donde pasa ahora la búsqueda.** |
| **Estática / `force-static` / ISR** | La home se genera una vez y se sirve desde la CDN (rapidísimo, sin gastar servidor). Se regenera sola cuando se sube una lista nueva (`revalidatePath('/')`). |
| **CDN** | Red de servidores repartidos por el mundo que sirven contenido estático muy rápido y cerca del usuario. |

### Base de datos

| Término | Qué es |
|---|---|
| **RDS PostgreSQL** | La base de datos administrada por AWS (donde viven hospitales, pacientes, ingresos…). Es privada: solo la alcanzan nuestras Lambdas y, para operar, un túnel SSM. |
| **RPC** ⭐ | *Remote Procedure Call*. Aquí significa **llamar a una función guardada dentro de la base de datos** (`search_patient`) como si fuera un endpoint. Es la única puerta pública a los datos. |
| **`search_patient`** | Nuestra función RPC: recibe el término, aplica rate-limit, busca de forma mediada y devuelve solo hospital + teléfono. |
| **Roles `evzla_*`** ⭐ | Usuarios de base con permisos mínimos: `evzla_public` (solo ejecuta los RPC públicos), `evzla_admin` (la app de `/admin`), `evzla_job` (solo la purga) y `evzla_owner` (migraciones). |
| **SECURITY DEFINER** ⭐ | Hace que la función se ejecute con los **permisos de su dueño**, no los de quien la llama. Así el público (sin permisos) puede ejecutar la función, y la función —por dentro— sí puede leer las tablas necesarias, de forma controlada. |
| **Secrets Manager** | Donde viven las credenciales de cada rol (`evzla/db/*`) y las claves de la app (`evzla/app`). Nunca en el repo. |
| **EventBridge Scheduler** | El "cron" de AWS: todos los días a las 03:00 UTC dispara la Lambda que purga `search_log`. |
| **Drizzle** | El ORM (traductor entre TypeScript y SQL) con el que el servidor habla directo con Postgres. |
| **schema `public` / `sensitive`** | Dos "cajones" separados de la base: `public` = datos mostrables; `sensitive` = PII y datos clínicos, aislados. |
| **`search_log`** | Bitácora anti-abuso: guarda **solo hashes** (del término y de la IP) + el tipo de resultado. Nunca texto en claro. |

### Anti-abuso

| Término | Qué es |
|---|---|
| **Cloudflare Turnstile** ⭐ | El reemplazo moderno y privado del CAPTCHA. Un widget que comprueba **de forma casi siempre invisible** que detrás hay una persona y un navegador real, no un script. |
| **Token (de Turnstile)** | Una cadena de un solo uso que el widget genera cuando cree que eres humano. Viaja con el formulario y el servidor la valida. |
| **siteverify** | El endpoint de Cloudflare al que nuestro servidor le pregunta "¿este token es válido?" usando la clave secreta. |
| **Modo Gestionado** | El modo de Turnstile que elegimos: Cloudflare decide el reto según el riesgo (invisible para la mayoría, desafío visible solo a sospechosos). |
| **Rate-limit (límite de frecuencia)** ⭐ | Tope de cuántas búsquedas puede hacer una misma fuente en una ventana de tiempo. El nuestro: **300 búsquedas / 10 minutos por IP**. |
| **Ventana deslizante** | El conteo mira "los últimos 10 minutos" en todo momento (no se reinicia a una hora fija); las búsquedas viejas van caducando y liberan cupo. |
| **Enumeración** ⭐ | El abuso que prevenimos: un script que prueba miles de nombres/cédulas en automático para descargarse toda la base. |
| **Hash / SHA-256** ⭐ | Una "huella digital" irreversible de un dato. Del hash no se puede volver al original. Lo usamos para term y para la IP. |
| **Sal (salt)** | Una cadena secreta que se mezcla con la IP antes de hashearla, para que el hash no se pueda adivinar por fuerza bruta. |
| **NAT / IP compartida** | Varias personas tras el mismo WiFi salen a internet con **una sola IP pública**. Por eso el límite por IP se puso generoso (300): para no bloquear a familias que comparten red. |
| **x-forwarded-for** | La cabecera HTTP donde CloudFront nos dice la IP real del visitante. |

### Autenticación y dominio

| Término | Qué es |
|---|---|
| **Cognito / EMAIL_OTP** | Login sin contraseña: el equipo recibe un **código de un solo uso** en su correo (enviado por SES) y lo escribe en `/admin/login`. |
| **team_members** | La tabla con los correos del equipo y su rol (quién puede subir listas, revisar, etc.). |
| **DNS / Cloudflare** | El DNS de `encuentramevzla.com` lo gestiona **Cloudflare**, que apunta a CloudFront. |

---

## 10. Reglas innegociables (recordatorio)

1. El schema **`sensitive` jamás** llega al cliente.
2. El público **solo** accede vía el RPC `search_patient`, con el rol `evzla_public` (sin grants sobre tablas).
3. `search_log` guarda **solo hashes**, nunca el término en claro.
4. Anti-abuso: **Turnstile** (humanidad) + **rate-limit 300/10min** (frecuencia).
5. Los logs (CloudWatch) no llevan PII: errores como `nombre:código`.
6. Nada de `npm` (siempre `pnpm`); código en inglés, comentarios cortos en español.

> Nota: existe una excepción documentada (ADR-0003) — el buscador hoy **sí** muestra la ubicación de
> menores y fallecidos, por decisión humana explícita del dueño del dato.
