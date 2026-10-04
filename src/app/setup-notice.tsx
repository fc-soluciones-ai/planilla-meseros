const HELP: Record<string, string> = {
  APP_PASSWORD: "la contraseña para entrar. Vercel → Settings → Environment Variables.",
  DATABASE_URL: "la base de datos. Vercel → Storage → Create Database → Neon, y conéctela al proyecto.",
};

/** Pantalla que explica qué falta configurar, en lugar de un error genérico. */
export default function SetupNotice({ missing, error }: { missing?: string[]; error?: string }) {
  return (
    <div className="app login">
      <h1>Planilla de meseros</h1>
      {missing && missing.length > 0 ? (
        <>
          <p className="hint">Falta configurar la app en Vercel:</p>
          <div className="rule">
            {missing.map((m) => (
              <p key={m}><b>{m}</b>: {HELP[m]}</p>
            ))}
            <p>Después vaya a Deployments → ⋯ → <b>Redeploy</b>.</p>
          </div>
        </>
      ) : (
        <>
          <p className="hint">No se pudo leer la base de datos.</p>
          <div className="rule">
            <p>{error}</p>
            <p>Revise en Vercel → Storage que la base Neon esté conectada a este proyecto y haga Redeploy.</p>
          </div>
        </>
      )}
    </div>
  );
}
