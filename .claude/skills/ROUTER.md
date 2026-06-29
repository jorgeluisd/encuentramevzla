# ROUTER — Skills Registry de EncuéntrameVzla

Enruta cada tarea a la skill correcta según las palabras clave. Si una tarea cruza varios dominios,
carga las skills implicadas (la de **privacidad manda siempre que se toquen datos**).

## Tabla de detección

| Palabras clave en la tarea | Skill |
|---|---|
| capa, onion, screaming, dominio, port, adapter, caso de uso, use case, naming, estructura, dependency rule, value object | `architecture.md` |
| privacidad, mediada, sensible, dato personal, menor, fallecido, enumeración, hash, `search_log`, `search_patient`, RLS, derecho al olvido | `privacy-and-security.md` |
| migración SQL, RPC, `SECURITY DEFINER`, edge function, deno, postgres, supabase, grant, schema público | `supabase.md` |
| drizzle, schema TS, tabla, columna, cliente db, `drizzle-kit`, migración generada, esquema sensitive/public | `database-drizzle.md` |
| script contra prod, `packages/db/scripts`, conteo, harness, ROLLBACK, aplicar migración, `prepare:false`, pooler 6543, `.env` raíz, verificar RPC en prod | `db-prod-scripts.md` |
| página, route, server action, app router, RSC, componente, react, layout, ingesta UI | `nextjs-frontend.md` |
| tailwind, estilo, clase, shadcn, `cn()`, botón, color, theme, diseño visual | `ui-tailwind.md` |
| test, vitest, TDD, rojo, verde, refactor, cobertura, fake, mock | `testing-vitest.md` |
| commit, mensaje de commit, rama, branch, PR, pull request, historial, git, push, develop | `git-commits.md` |

## Reglas de enrutamiento

1. **Privacidad primero.** Si la tarea toca datos de pacientes, búsqueda, ingesta, `sensitive` o el RPC,
   carga `privacy-and-security.md` ANTES que cualquier otra.
2. **Arquitectura siempre presente.** Cualquier código nuevo respeta `architecture.md` (capas + naming).
3. **TDD por defecto en features.** Toda feature/componente/endpoint/pantalla/refactor activa el flujo de
   `testing-vitest.md` + `orchestrator/agents/strict-tdd.md`.
4. **Stack fijo.** No introduzcas tecnologías fuera del stack (ver `CLAUDE.md §2`) sin un spec que lo justifique.

## Tipos de tarea comunes → skills

| Tipo de tarea | Skills a cargar |
|---|---|
| Nuevo value object / servicio de dominio | architecture · testing-vitest |
| Nuevo caso de uso (application) | architecture · testing-vitest |
| Nuevo adapter (infraestructura) | architecture · database-drizzle / supabase · testing-vitest |
| Cambio en el buscador público | privacy-and-security · supabase · architecture |
| Nueva migración SQL / RPC | supabase · privacy-and-security · database-drizzle |
| Script/SQL one-off o verificación contra prod | db-prod-scripts · privacy-and-security |
| Cambio de schema Drizzle | database-drizzle · supabase · privacy-and-security |
| Nueva página / Server Action | nextjs-frontend · privacy-and-security · architecture |
| Ajuste visual / componente UI | ui-tailwind · nextjs-frontend |
| Pantalla `/admin` con auth | nextjs-frontend · privacy-and-security · supabase |
| Commit / rama / PR / historial git | git-commits |
