import type { MetadataRoute } from "next";

// Permite instalar la app en el celular ("Agregar a pantalla de inicio")
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Planilla de meseros",
    short_name: "Planilla",
    description: "Días y horas de entrada de los meseros para repartir las propinas.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1f5a46",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
