# Spec 0012 — Búsqueda multi-token (AND por palabra)

Estado: **propuesto** · Capacidad: `patient-search` · Corrige el RPC de 0003 / spec 0005.

## 1. Problema

El RPC `public.search_patient` matchea con semántica **OR** sobre el término completo:
`similarity(normalized_name, termino_completo) > 0.3`. Al concatenar "jorge diaz",
los trigramas de la frase entera se parecen lo suficiente a "julio diaz" o "jorge suarez"
y entran como **falsos positivos**.

Comportamiento esperado:
- **1 token** (solo nombre o solo apellido) → traer todos los registros que lo contengan.
- **N tokens** (nombre + apellido) → **todos** los tokens deben estar presentes en el registro
  (AND), sin importar el orden ("diaz jorge" = "jorge diaz").

## 2. Decisión

Matching **AND por token** con tolerancia a tipeo por token (acordado 2026-06-26):

Un token `t` *coincide* con un registro `p` si:
- `p.normalized_name ILIKE '%' || t || '%'` (presente como substring), **o**
- `word_similarity(t, p.normalized_name) >= 0.6` (fuzzy conservador, tolera "rodrigez"→"rodriguez").

Un registro *coincide* con el término si **todos** sus tokens coinciden (AND).
La **cédula** (cuando el término parece documento) sigue ganando con match exacto.

Se elimina el `similarity(frase_completa) > 0.3`, origen de los falsos positivos.

## 3. Alcance e invariantes

- El cambio se aplica a los **tres** bloques del RPC: fuerza sensible (menores/fallecidos),
  fuerza pública y el SELECT final. Así el gate `requires_human_contact` no se dispara por un
  falso positivo sensible.
- Privacidad intacta (spec 0005 / privacy-and-security): menores/fallecidos nunca exponen nombre;
  `search_log` sigue guardando solo el hash; público solo vía RPC `SECURITY DEFINER`.
- `normalized_name` guarda el nombre completo normalizado en orden original; por eso se exige
  AND por token (orden-independiente), no substring de la frase entera.

## 4. Criterios de aceptación (verificación a nivel RPC)

Sobre los datos reales (319 pacientes):
1. "jorge diaz" **no** devuelve "julio diaz" ni "jorge suarez"; sí devuelve registros con ambos.
2. Solo "diaz" devuelve todos los "* diaz"; solo "jorge" devuelve todos los "jorge *".
3. Un tipeo en un token ("rodrigez") sigue encontrando "rodriguez".
4. Cédula exacta sigue funcionando y dominando.
5. Menores/fallecidos siguen devolviendo `{ requires_human_contact: true }`, no su nombre.

> El matching vive en SQL (no en `@evzla/core`), así que Vitest no lo cubre; la evidencia es
> por llamadas reales al RPC antes/después. Aplicar a prod requiere OK explícito (no hay staging).
