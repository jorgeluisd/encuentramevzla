"use client";

import { useState } from "react";

interface Point {
  date: string;
  count: number;
}

const W = 720;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

function label(date: string): string {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

/**
 * Serie temporal de búsquedas (una sola serie → sin leyenda). SVG propio con
 * crosshair + tooltip al pasar el cursor y tabla de respaldo (accesibilidad).
 * Solo conteos: search_log guarda solo el hash del término.
 */
export function SearchTrend({ points }: { points: Point[] }): React.ReactElement {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="text-sm text-text-3">Sin búsquedas en el rango.</p>;
  }

  const maxV = Math.max(1, ...points.map((p) => p.count));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const xFor = (i: number): number =>
    PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yFor = (v: number): number => PAD.top + innerH - (v / maxV) * innerH;

  const line = points.map((p, i) => `${xFor(i)},${yFor(p.count)}`).join(" ");
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${xFor(points.length - 1)},${
    PAD.top + innerH
  }`;

  const onMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (x - PAD.left) / innerW;
    const idx = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  };

  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Volumen de búsquedas por período"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* eje base + marca superior */}
        <line
          x1={PAD.left}
          y1={PAD.top + innerH}
          x2={W - PAD.right}
          y2={PAD.top + innerH}
          stroke="var(--color-border)"
        />
        <text x={4} y={PAD.top + 4} fontSize={11} fill="var(--color-text-3)">
          {maxV.toLocaleString("es-VE")}
        </text>
        <text x={4} y={PAD.top + innerH} fontSize={11} fill="var(--color-text-3)">
          0
        </text>

        <polygon points={area} fill="var(--color-primary)" opacity={0.08} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {hover != null && hp ? (
          <>
            <line
              x1={xFor(hover)}
              y1={PAD.top}
              x2={xFor(hover)}
              y2={PAD.top + innerH}
              stroke="var(--color-border)"
            />
            <circle
              cx={xFor(hover)}
              cy={yFor(hp.count)}
              r={4}
              fill="var(--color-primary)"
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          </>
        ) : null}

        {/* etiquetas de extremos en el eje X */}
        <text
          x={PAD.left}
          y={H - 8}
          fontSize={11}
          fill="var(--color-text-3)"
          textAnchor="start"
        >
          {label(points[0]!.date)}
        </text>
        {points.length > 1 ? (
          <text
            x={W - PAD.right}
            y={H - 8}
            fontSize={11}
            fill="var(--color-text-3)"
            textAnchor="end"
          >
            {label(points[points.length - 1]!.date)}
          </text>
        ) : null}
      </svg>

      {hp ? (
        <div className="pointer-events-none absolute left-2 top-2 rounded-[var(--radius-control)] border border-border bg-bg px-2.5 py-1.5 text-xs shadow-[var(--shadow-card)]">
          <span className="text-text-3">{label(hp.date)}</span>{" "}
          <span className="font-semibold tabular-nums text-text">
            {hp.count.toLocaleString("es-VE")}
          </span>{" "}
          <span className="text-text-3">búsquedas</span>
        </div>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-text-3">Ver tabla</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-text-3">
              <tr>
                <th className="py-1 pr-4 font-medium">Período</th>
                <th className="py-1 font-medium">Búsquedas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="py-1 pr-4 text-text-2">{p.date}</td>
                  <td className="py-1 tabular-nums text-text-2">
                    {p.count.toLocaleString("es-VE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
