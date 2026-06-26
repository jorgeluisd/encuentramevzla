// Presentación: sello de "última actualización" en hora de Venezuela.
// Usa Intl (built-in, determinista: misma fecha + misma zona => misma salida); no es I/O.
const CARACAS = new Intl.DateTimeFormat("es-VE", {
  timeZone: "America/Caracas",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatLastUpdate(date: Date | null): string {
  if (!date) return "Listas verificadas";
  return `Actualizado: ${CARACAS.format(date)}`;
}
