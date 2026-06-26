# Skill — Commits y flujo de ramas (git)

Convención de git de **EncuéntrameVzla**. Aplica a TODO commit, rama y PR del proyecto.
Regla raíz: el historial es del usuario (Jorge), **sin rastro de Claude** y **en español**.

## 1. Mensajes de commit

- **Subject corto, en español, una sola línea.** Imperativo o nominal; sin punto final.
- Se permite (y se recomienda) el prefijo convencional: `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:` — con scope opcional, p. ej. `feat(core): ...`, `feat(infra): ...`.
- **Sin body** salvo que aporte un "por qué" real e imprescindible. Si hace falta, breve y en español.
- **PROHIBIDO** cualquier atribución a Claude/IA:
  - ❌ `Co-Authored-By: Claude ...`
  - ❌ `Claude-Session: https://claude.ai/...`
  - ❌ `🤖 Generated with Claude Code` o similares
  - ❌ menciones a `anthropic`, `claude.ai`, `noreply@anthropic.com`
- El proyecto fija `"includeCoAuthoredBy": false` en `.claude/settings.json` para que el harness
  **no** añada el trailer. Aun así, verifica siempre antes de commitear.

> Excepción de texto: la cadena `.claude/` (el directorio del stack cognitivo) puede aparecer en
> un subject porque es el nombre real de una carpeta versionada. Eso **no** es atribución.

### Check antes de cada commit
```bash
git diff --cached --quiet || true   # hay algo staged
# tras commitear, confirmar que el mensaje quedó limpio:
git log -1 --format='%B' | grep -iE 'co-authored-by|claude-session|anthropic|claude\.ai' \
  && echo "LIMPIAR: lleva atribución" || echo "OK sin atribución"
```

## 2. Flujo de ramas

- **`main`** = tronco estable. **`develop`** = base de integración del trabajo en curso.
- **Toda tarea nueva parte de `develop`** (no de `main` ni de una feature ajena):
  ```bash
  git switch develop && git pull --ff-only
  git switch -c <tipo>/<descripcion-corta>   # p. ej. feat/buscador-nombres
  ```
- Nombres de rama en inglés, kebab-case, con prefijo de tipo: `feat/…`, `fix/…`, `chore/…`, `docs/…`.

## 3. Dos preguntas OBLIGATORIAS al agente

El agente **siempre** pregunta, sin asumir:

1. **Al empezar una tarea** → *"¿Sigo en la misma rama o creo una nueva (desde `develop`)?"*
2. **Al terminar** → *"¿Quieres que arme la PR?"*

Nunca crear rama, mergear ni abrir PR sin confirmación explícita del usuario.

## 4. PRs

- Base habitual: `develop` (o `main` según indique el usuario).
- Título y descripción **en español**, sin firmas de IA.
- Antes de pedir merge: `pnpm typecheck && pnpm test && pnpm build` en verde (no romper lo verde).

## 5. Reescritura de historial (puntual)

Si hay que limpiar atribución de commits viejos: backup primero (`git bundle create … --all`),
luego `git filter-repo --message-callback` para dejar solo el subject, y `--force-with-lease` al
pushear. Operación destructiva: confirmar con el usuario y conservar el bundle.
