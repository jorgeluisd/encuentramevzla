# Skill — Privacidad y seguridad (INNEGOCIABLE)

Migrado de `README.md`. La privacidad de los pacientes es un **requisito de diseño no negociable**.
Ante cualquier cambio que toque datos, pacientes, búsqueda o ingesta, **carga esta skill primero**.

## Modelo mental

Una familia busca por **nombre o cédula** y solo recibe:
*"hay una coincidencia en el Hospital X — mesa de información: [tel]"*. **Nunca** datos del paciente.

## Reglas duras (no se rompen sin spec + aprobación humana en Gate 1)

1. **Separación física `public` / `sensitive`.** Dos schemas de Postgres:
   - `public` — datos no sensibles.
   - `sensitive` — teléfonos, direcciones, observaciones clínicas.
   El rol anónimo **no tiene grants** sobre tablas de datos. El schema `sensitive` **jamás** es accesible
   desde el cliente. Nunca importes ni consultes `sensitive` desde `apps/web` lado cliente.

2. **Búsqueda controlada.** El público **nunca** consulta tablas directamente. Solo existe
   `public.search_patient(term)` (`SECURITY DEFINER`), que:
   - valida el término,
   - hace matching **por nombre o cédula**,
   - para **adultos vivos** devuelve `{ hospital_name, info_desk_phone, patient_name, confidence }`
     (nombres agrupados por hospital).

3. **Menores y fallecidos.** Si el match es **menor de edad** o **persona fallecida**, el buscador
   **nunca** devuelve su nombre: entrega `{ requires_human_contact: true }` para derivar a atención humana.

4. **Anti-enumeración.** Se registra solo el **hash** del término buscado (`search_log`), nunca el
   texto en claro. Rate-limit previsto (TODO en el RPC) + Cloudflare Turnstile (pendiente).

5. **Derecho al olvido.** El dato crudo se preserva en `raw_rows` para trazabilidad; el modelo
   permite baja/anonimización de una persona y sus contactos sensibles.

## Antipatrones prohibidos

- ❌ Devolver nombre/cédula/teléfono del paciente al cliente público.
- ❌ Consultar tablas de pacientes sin pasar por `search_patient`.
- ❌ Conceder grants al rol anónimo sobre `public.*` de datos o cualquier `sensitive.*`.
- ❌ Exponer datos de menores o fallecidos por el buscador.
- ❌ Guardar el término de búsqueda en claro.
- ❌ Mover lógica de privacidad del RPC al cliente (debe vivir server-side / DB).

## Decisión resuelta (nombres en el buscador)

Se decidió **mostrar nombres de pacientes adultos vivos** en el buscador, agrupados por hospital
(opción "abierta"), con **consentimiento explícito de la residente** (dueña del dato). **Menores y
fallecidos nunca** muestran nombre → `requires_human_contact`. Ver `adr/0002-apertura-de-nombres-adultos.md`
y `specs/0005-buscador-nombres-y-dedupe.md`. Cualquier cambio futuro a este contrato vuelve a Gate 1.

## Checklist de privacidad (Gate 1 y Gate 2)

- [ ] ¿El cambio expone algún dato de `sensitive`? → debe ser NO.
- [ ] ¿El público sigue accediendo solo vía `search_patient`?
- [ ] ¿Menores/fallecidos quedan fuera del resultado (marcador humano)?
- [ ] ¿`search_log` guarda solo hash?
- [ ] ¿Algún grant nuevo al rol anónimo? → justificar o quitar.
- [ ] Si toca el contrato del buscador, ¿hay spec + aprobación?
