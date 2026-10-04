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
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectorial, no necesita optimización */}
      <img src="/logo.svg" alt="D'charly's Chicharronera" className="login-logo" width={200} height={168} />
      <h1>Planilla de meseros</h1>
      <p className="hint">Escriba su usuario y contraseña.</p>
      <LoginForm />
    </div>
  );
}
