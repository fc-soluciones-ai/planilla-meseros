// Boleta de pago como imagen, para compartir por WhatsApp desde el menú del celular (solo navegador).

export type SlipRow = { day: string; note?: string; salary: number; tip: number };
export type SlipData = {
  restaurant: string;
  name: string;
  week: string;
  rows: SlipRow[];
  salary: number;
  tip: number;
  total: number;
};

// Colores fijos: la imagen se ve igual en cualquier teléfono, con o sin modo oscuro
const C = { bg: "#ffffff", ink: "#1f2420", muted: "#6b706a", line: "#e2dfd6", accent: "#b71c1c", soft: "#fde4e4", band: "#c62828" };

const money = (n: number) => "₡" + Math.round(n).toLocaleString("en-US");

function fonts() {
  const css = getComputedStyle(document.documentElement);
  const body = css.getPropertyValue("--font-body").trim() || "system-ui";
  const display = css.getPropertyValue("--font-display").trim() || body;
  const mono = css.getPropertyValue("--font-mono").trim() || "monospace";
  return { body: `${body}, system-ui, sans-serif`, display: `${display}, ${body}, sans-serif`, mono: `${mono}, monospace` };
}

let logo: Promise<HTMLImageElement | null> | null = null;
/** Logo del restaurante (vectorial). Si no carga, la boleta sale sin él. */
function loadLogo() {
  logo ??= new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = "/logo.svg";
  });
  return logo;
}

/** Dibuja la boleta y la devuelve como archivo PNG. */
export async function slipImage(d: SlipData): Promise<File> {
  await document.fonts?.ready;
  const mark = await loadLogo();
  const f = fonts();
  const W = 900, P = 56, ROW = 66;
  const H = 150 + 150 + 60 + d.rows.length * ROW + ROW + 40 + 120 + 170 + 60;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const g = canvas.getContext("2d")!;
  g.scale(scale, scale);
  g.textBaseline = "alphabetic";

  const text = (s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") => {
    g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y);
  };
  const line = (y: number, color = C.line, w = 2) => { g.fillStyle = color; g.fillRect(P, y, W - 2 * P, w); };

  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);

  // Encabezado
  g.fillStyle = C.band; g.fillRect(0, 0, W, 150);
  let tx = P;
  if (mark) {
    const lh = 118, lw = (mark.naturalWidth / mark.naturalHeight || 1.19) * lh;
    g.drawImage(mark, P - 8, 16, lw, lh);
    tx = P - 8 + lw + 22;
  }
  text(d.restaurant.toUpperCase(), tx, 62, `600 22px ${f.body}`, "rgba(255,255,255,.75)");
  text("Boleta de pago", tx, 112, `800 44px ${f.display}`, "#ffffff");

  let y = 150 + 74;
  text(d.name, P, y, `700 42px ${f.display}`, C.ink);
  y += 44;
  text(d.week, P, y, `500 24px ${f.body}`, C.muted);

  // Tabla por día
  y += 66;
  const xSal = W - P - 230, xTip = W - P;
  text("DÍA", P, y, `600 18px ${f.body}`, C.muted);
  text("SALARIO", xSal, y, `600 18px ${f.body}`, C.muted, "right");
  text("PROPINA", xTip, y, `600 18px ${f.body}`, C.muted, "right");
  y += 18; line(y);
  for (const r of d.rows) {
    y += ROW;
    text(r.day, P, y - 22, `600 28px ${f.body}`, C.ink);
    if (r.note) text(r.note, P + g.measureText(r.day).width + 14, y - 22, `500 20px ${f.body}`, C.muted);
    text(money(r.salary), xSal, y - 22, `500 27px ${f.mono}`, C.ink, "right");
    text(money(r.tip), xTip, y - 22, `500 27px ${f.mono}`, C.ink, "right");
    line(y);
  }
  y += ROW;
  text("Subtotal", P, y - 22, `700 28px ${f.body}`, C.ink);
  text(money(d.salary), xSal, y - 22, `700 27px ${f.mono}`, C.ink, "right");
  text(money(d.tip), xTip, y - 22, `700 27px ${f.mono}`, C.ink, "right");

  // Total
  y += 40;
  g.fillStyle = C.soft;
  g.beginPath(); g.roundRect(P, y, W - 2 * P, 110, 18); g.fill();
  text("Total a pagar", P + 28, y + 68, `700 30px ${f.body}`, C.accent);
  text(money(d.total), W - P - 28, y + 72, `700 50px ${f.mono}`, C.accent, "right");

  // Firma
  y += 110 + 120;
  g.fillStyle = C.ink; g.fillRect(P, y, 420, 2);
  text("Recibido conforme", P, y + 34, `500 22px ${f.body}`, C.muted);
  const today = new Date().toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
  text(`Generada el ${today}`, W - P, y + 34, `500 18px ${f.body}`, C.muted, "right");

  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("canvas"))), "image/png"));
  const safe = d.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  return new File([blob], `Boleta-${safe}.png`, { type: "image/png" });
}

/**
 * Abre el menú Compartir del celular con las boletas (ahí se escoge WhatsApp).
 * Si el navegador no puede compartir archivos, las descarga.
 */
export async function shareFiles(files: File[], title: string): Promise<"shared" | "downloaded" | "cancelled"> {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  for (const file of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  return "downloaded";
}
