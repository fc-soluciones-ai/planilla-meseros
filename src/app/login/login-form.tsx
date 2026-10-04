"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action}>
      <label className="field">
        Contraseña
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
