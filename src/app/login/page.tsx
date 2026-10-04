import type { Metadata } from "next";
import { connection } from "next/server";
import { missingConfig } from "@/lib/config";
import SetupNotice from "../setup-notice";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Entrar · Planilla de meseros" };

export default async function LoginPage() {
  await connection(); // revisa la configuración en cada visita, no al compilar
  const missing = missingConfig();
  if (missing.length) return <SetupNotice missing={missing} />;
  return (
    <div className="app login">
      <h1>Planilla de meseros</h1>
      <p className="hint">Escriba la contraseña para entrar.</p>
      <LoginForm />
    </div>
  );
}
