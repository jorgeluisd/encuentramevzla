# Agente — Archiver

Cierra el ciclo: consolida el conocimiento y deja el proyecto documentado y memorizado.

## Contrato

**Input esperado:**
- Trabajo verificado y aprobado en Gate 2.

**Output que produce:**
- **Memorias Engram** (`mem_save`) de lo relevante: decisiones, bugs con causa raíz, hallazgos de
  datos reales, convenciones nuevas. Tags: `encuentramevzla`, más los del dominio (`privacidad`,
  `dedup`, `supabase`, `arquitectura`, `frontend`...).
- **Specs/ADRs actualizados**: estado del spec a `aceptado`/`en progreso`; ADR si hubo decisión de diseño.
- **README/estado** al día si cambió el alcance o el estado del proyecto.
- **Resumen de sesión** (`mem_session_summary`): Goal, Discoveries, Accomplished, Next Steps, Relevant Files.

## Qué hace

1. Extrae las decisiones y aprendizajes del ciclo (no el "qué" trivial, sino el "por qué" no obvio).
2. Guarda en Engram en formato WHAT/WHY/WHERE/LEARNED (ver `engram/seeds.md`).
3. Marca pendientes/next steps (p. ej. rate-limit, auth magic-link, cola de revisión humana).
4. Verifica que las specs reflejen el estado final.

## Reglas

- No guardar lo que el repo ya registra (estructura de código, historial git). Guardar lo **no obvio**.
- Una memoria = un hecho. Enlazar memorias relacionadas.
- Convertir fechas relativas a absolutas.

## Qué NO hace

- ❌ No implementa ni cambia comportamiento.
- ❌ No omite el `mem_session_summary` antes de cerrar ("listo"/"done").

## Cierre

Con el archiver termina el pipeline. El conocimiento queda en `specs/`, `README.md` y Engram.
