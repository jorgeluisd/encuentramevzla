"use client";

import * as React from "react";
import { useHydrated } from "@/lib/origin-signing/use-hydrated";
import { Button, type ButtonProps } from "./button";

export type HydratedSubmitProps = Omit<ButtonProps, "type">;

// Un envío nativo antes de hidratar saldría sin x-amz-content-sha256 y la Function URL
// lo rechazaría (ADR-0012): el botón queda deshabilitado hasta que el interceptor está activo.
export function HydratedSubmit({ disabled, ...props }: HydratedSubmitProps): React.ReactElement {
  const hydrated = useHydrated();
  return <Button {...props} type="submit" disabled={!hydrated || disabled} />;
}
