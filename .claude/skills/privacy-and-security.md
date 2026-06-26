# Skill — Privacidad y seguridad (INNEGOCIABLE)

Migrado de `README.md`. La privacidad de los pacientes es un **requisito de diseño no negociable**.
Ante cualquier cambio que toque datos, pacientes, búsqueda o ingesta, **carga esta skill primero**.

## Modelo mental

Una familia busca por **nombre o cédula** y solo recibe:
*"hay una coincidencia en el Hospital X — mesa de información: [tel]"*. **Nunca** datos del paciente.

## Reglas duras (no se rompen sin spec + aprobación humana en Gate 1)

1. **Separación física `public` / `sensible`.** Dos schemas de Postgres:
   - `public` — datos no sensibles.
   - `sensible` — teléfonos, direcciones, observaciones clínicas.
   El rol anónimo **no tiene grants** sobre tablas de datos. El schema `sensible` **jamás** es accesible
   desde el cliente. Nunca importes ni consultes `sensible` desde `apps/web` lado cliente.

2. **Búsqueda mediada.** El público **nunca** consulta tablas directamente. Solo existe
   `public.buscar_paciente(termino)` (`SECURITY DEFINER`), que:
   - valida el término,
   - hace matching **por nombre o cédula**,
   - devuelve únicamente `{ hospital_nombre, hospital_telefono_mesa, confianza }`.

3. **Menores y fallecidos.** Si el match es **menor de edad** o **persona fallecida**, el buscador
   **no devuelve nada**: entrega `{ requiere_contacto_humano: true }` para derivar a atención humana.

4. **Anti-enumeración.** Se registra solo el **hash** del término buscado (`busqueda_log`), nunca el
   texto en claro. Rate-limit previsto (TODO en el RPC) + Cloudflare Turnstile (pendiente).

5. **Derecho al olvido.** El dato crudo se preserva en `staging_filas` para trazabilidad; el modelo
   permite baja/anonimización de una persona y sus contactos sensibles.

## Antipatrones prohibidos

- ❌ Devolver nombre/cédula/teléfono del paciente al cliente público.
- ❌ Consultar tablas de pacientes sin pasar por `buscar_paciente`.
- ❌ Conceder grants al rol anónimo sobre `public.*` de datos o cualquier `sensible.*`.
- ❌ Exponer datos de menores o fallecidos por el buscador.
- ❌ Guardar el término de búsqueda en claro.
- ❌ Mover lógica de privacidad del RPC al cliente (debe vivir server-side / DB).

## Decisión abierta (no decidir solo)

¿Mostrar **nombres de pacientes** en el buscador, agrupados por hospital? Revertiría parcialmente la
búsqueda mediada (ADR-001/004). Opción recomendada: "con cuidado" (nombres solo en coincidencia
específica; menores/fallecidos nunca). **Requiere consultar a la residente** + migración 0007 +
actualizar `/confianza` y los ADRs. No implementar sin aprobación humana.

## Checklist de privacidad (Gate 1 y Gate 2)

- [ ] ¿El cambio expone algún dato de `sensible`? → debe ser NO.
- [ ] ¿El público sigue accediendo solo vía `buscar_paciente`?
- [ ] ¿Menores/fallecidos quedan fuera del resultado (marcador humano)?
- [ ] ¿`busqueda_log` guarda solo hash?
- [ ] ¿Algún grant nuevo al rol anónimo? → justificar o quitar.
- [ ] Si toca el contrato del buscador, ¿hay spec + aprobación?
