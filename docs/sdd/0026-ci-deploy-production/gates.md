# Gates — 0026-ci-deploy-production

GATE 1 · 2026-10-22 · Jorge Diaz · APROBADO · token: "acepto" · ADRs firmados: [] (ADR-0011 sigue PROPUESTO: el humano no lo firmó explícitamente; T-13 NO lo pasa a ACEPTADO sin firma) · observaciones: alcance sin bootstrap propio, con build/deploy separados; riesgo residual cfn-exec AdministratorAccess en cuenta compartida aceptado con sus controles; cuenta AWS propia queda como mitigación futura.

ADR · 2026-10-22 · Jorge Diaz · ADR-0011 FIRMADO (token: "firmado") · T-13 lo pasa a ACEPTADO.

CORRECCIONES 2 · 2026-10-24 · Jorge Diaz · APROBADO · token: "acepto" · alcance: T-18 (parser del tar) y T-19 (contención de rutas de open-next.output.json) dentro de 0026; PR de dependencias aparte por body-parser; N-3, N-4 y bajas al backlog. No es el GATE 2.

CORRECCIONES 3 · 2026-10-24 · Jorge Diaz · APROBADO · token: "ok" · alcance: T-20 (registros pax, NUL, size en miembros que no son archivo, claves sin prototipo); N-3 y N-4 al backlog; body-parser espera la madurez de 72 h (2026-10-25T11:39Z). No es el GATE 2.
