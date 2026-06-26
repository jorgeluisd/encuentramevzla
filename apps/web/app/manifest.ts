import type { MetadataRoute } from "next";

// Web App Manifest: instalabilidad básica + theme-color de marca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EncuéntrameVzla",
    short_name: "EncuéntrameVzla",
    description:
      "Busca a una persona ingresada en un hospital de Venezuela tras el sismo, con privacidad mediada.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1565c0",
    lang: "es-VE",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
