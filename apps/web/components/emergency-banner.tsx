import { telHref } from "@evzla/core";
import Link from "next/link";

/**
 * Aviso de emergencia sticky (specs/0004 A · 0003 §6.7). Siempre visible.
 * Portal informativo: ante emergencia, líneas oficiales 171 · *1 · 112 · 911.
 */
const LINES = ["171", "*1", "112", "911"] as const;

export function EmergencyBanner(): React.ReactElement {
  return (
    <div className="sticky top-0 z-50 bg-danger text-white">
      <p className="mx-auto max-w-[1120px] px-[22px] py-2 text-center text-sm">
        <span className="font-semibold">Portal informativo.</span> Ante una
        emergencia, llama:{" "}
        {LINES.map((line, i) => (
          <span key={line}>
            {i > 0 && <span className="text-white/50"> · </span>}
            <a href={telHref(line)} className="font-semibold underline">
              {line}
            </a>
          </span>
        ))}
        <span className="text-white/50"> · </span>
        <Link href="/emergencias" className="font-semibold underline">
          ver todos
        </Link>
      </p>
    </div>
  );
}
