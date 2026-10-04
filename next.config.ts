import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // el archivo de ventas de una semana pesa ~50 KB; margen para meses completos
    serverActions: { bodySizeLimit: "4mb" },
  },
  // exceljs se carga tal cual en el servidor
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
