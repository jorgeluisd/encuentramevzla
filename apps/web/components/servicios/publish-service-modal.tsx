"use client";

import { useState } from "react";
import { SubmitServiceForm } from "@/components/servicios/submit-service-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

// Botón que abre el formulario de alta en un modal.
export function PublishServiceModal(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        Publicar un servicio gratuito
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Publicar un servicio gratuito">
        <SubmitServiceForm bare />
      </Modal>
    </>
  );
}
