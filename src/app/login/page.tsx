import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Entrar · Planilla de meseros" };

export default function LoginPage() {
  return (
    <div className="app login">
      <h1>Planilla de meseros</h1>
      <p className="hint">Escriba la contraseña para entrar.</p>
      <LoginForm />
    </div>
  );
}
