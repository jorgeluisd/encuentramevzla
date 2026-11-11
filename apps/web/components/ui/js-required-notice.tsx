import * as React from "react";

export function JsRequiredNotice(): React.ReactElement {
  return (
    <noscript>
      <p className="mt-2 text-sm text-danger">
        Este formulario necesita JavaScript para enviarse. Actívalo en tu navegador y recarga la página.
      </p>
    </noscript>
  );
}
