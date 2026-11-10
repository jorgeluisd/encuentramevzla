"use client";

import { useActionState, useState } from "react";
import { HydratedSubmit } from "@/components/ui/hydrated-submit";
import { echoLength, receiveUpload } from "./actions";

const S3_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

export default function ContentHashFixture() {
  const [stringResult, setStringResult] = useState("");
  const [concurrentResult, setConcurrentResult] = useState("");
  const [putResult, setPutResult] = useState("");
  const [upload, uploadAction] = useActionState(receiveUpload, null);

  return (
    <main>
      <form
        id="string-form"
        action={async () => setStringResult(String(await echoLength("Persona Prueba V-00000000")))}
      >
        <HydratedSubmit id="string-submit">Texto</HydratedSubmit>
      </form>
      <output id="string-result">{stringResult}</output>

      <form id="upload-form" action={uploadAction}>
        <input id="upload-name" name="name" defaultValue="Ñandú Pérez 🌎" />
        <input id="upload-file" name="file" type="file" />
        <HydratedSubmit id="upload-submit">Subir</HydratedSubmit>
      </form>
      <output id="upload-result">{upload ? `${upload.name}|${upload.size}` : ""}</output>

      <form
        id="put-form"
        action={async () => {
          const target = new URL(window.location.href).searchParams.get("s3") ?? "";
          const response = await fetch(`${target}/bucket/object.png`, {
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            body: S3_BYTES,
          });
          setPutResult(String(response.status));
        }}
      >
        <HydratedSubmit id="put-submit">PUT</HydratedSubmit>
      </form>
      <output id="put-result">{putResult}</output>

      <form
        id="concurrent-form"
        action={async () => {
          const results = await Promise.all([
            echoLength("Persona Prueba A"),
            echoLength("Persona Prueba B con un nombre bastante más largo"),
          ]);
          setConcurrentResult(results.join(","));
        }}
      >
        <HydratedSubmit id="concurrent-submit">Concurrentes</HydratedSubmit>
      </form>
      <output id="concurrent-result">{concurrentResult}</output>
    </main>
  );
}
