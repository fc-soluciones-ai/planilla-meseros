"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY = "pm-install-hidden";

/**
 * Botón para instalar la app en el celular.
 * Android/Chrome: abre el aviso de instalación del sistema.
 * iPhone/Safari: explica los dos toques (Compartir → Agregar a inicio), porque Safari no tiene botón propio.
 */
export default function InstallButton() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let hidden = false;
    try { hidden = localStorage.getItem(KEY) === "1"; } catch { /* sin almacenamiento */ }
    if (installed || hidden) return;

    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ua = navigator.userAgent;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- solo se sabe en el navegador
    setIos(/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function hide() {
    try { localStorage.setItem(KEY, "1"); } catch { /* sin almacenamiento */ }
    setEvent(null); setIos(false); setHelp(false);
  }

  if (!event && !ios) return null;

  return (
    <div className="install">
      {help ? (
        <p>En Safari toque <b>Compartir</b> <span aria-hidden="true">(el cuadro con la flecha ↑)</span> y luego <b>Agregar a inicio</b>.</p>
      ) : (
        <p>Instale la app en este celular para abrirla como cualquier otra.</p>
      )}
      <div className="install-actions">
        {!help && (
          <button className="chip on" onClick={async () => {
            if (event) {
              await event.prompt();
              const { outcome } = await event.userChoice;
              if (outcome === "accepted") hide(); else setEvent(null);
            } else {
              setHelp(true);
            }
          }}>Instalar app</button>
        )}
        <button className="link" onClick={hide}>{help ? "Entendido" : "Ahora no"}</button>
      </div>
    </div>
  );
}
