import ExcelJS from "exceljs";

/** Una cuenta con propina del reporte "Cuentas con propina" del sistema del restaurante. */
export type VentaRow = {
  folio: number;
  waiter: string;
  billed_at: string; // "AAAA-MM-DD HH:MM:SS", hora local del restaurante
  amount: number;
  tip_cash: number;
  tip_vouchers: number;
  tip_other: number;
  tip_card: number;
  commission: number;
  commission_tax: number;
  tip_total: number;
};

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

// Las celdas pueden venir como fórmula, texto enriquecido o hipervínculo.
function value(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return v.result;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
  }
  return v;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "")) || 0);

/** Excel guarda la hora "de pared" sin zona; exceljs la entrega como fecha UTC con esos mismos números. */
const wallClock = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

const COLUMNS = {
  waiter: "MESERO", date: "FECHA", folio: "FOLIO", amount: "IMPORTE_CUENTA",
  tip_cash: "PROPINA_EFECTIVO", tip_vouchers: "PROPINA_VALES", tip_other: "IMPORTE_OTROS",
  tip_card: "IMPORTE_TARJETA", commission: "COMISION", commission_tax: "IMPUESTOS_COMISION",
  tip_total: "PROPINA_TOTAL",
} as const;
// El nombre del mesero no se usa para repartir (el reparto es por total del día); solo se guarda de referencia.
const REQUIRED: (keyof typeof COLUMNS)[] = ["date", "folio", "tip_total"];

/**
 * Lee el archivo tal como lo exporta el sistema: encabezados en la fila que dice FECHA … PROPINA_TOTAL,
 * luego un bloque por mesero (fila con el nombre y debajo sus cuentas). Ubica las columnas por nombre.
 */
export async function parseVentas(data: ArrayBuffer): Promise<{ rows: VentaRow[]; restaurant: string | null }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new Error("No se pudo leer el archivo. Ábralo en Excel, guárdelo como .xlsx y vuelva a subirlo.");
  }

  for (const ws of wb.worksheets) {
    let col: Partial<Record<keyof typeof COLUMNS, number>> | null = null;
    let waiter = "";
    let restaurant: string | null = null;
    const rows: VentaRow[] = [];

    ws.eachRow((row) => {
      const cells = (row.values as ExcelJS.CellValue[]).map(value);
      if (!col) {
        const names = cells.map(norm);
        // Antes de los encabezados viene el título; la primera línea de texto sin números es el restaurante
        const first = String(cells[1] ?? "").trim();
        if (!restaurant && first && !/\d/.test(first) && norm(first) !== "CUENTAS CON PROPINA" && first.length <= 80) restaurant = first;
        if (names.includes("FECHA") && names.includes("PROPINA_TOTAL")) {
          col = {};
          for (const [k, name] of Object.entries(COLUMNS)) {
            const i = names.indexOf(name);
            if (i > 0) col[k as keyof typeof COLUMNS] = i;
          }
        }
        return;
      }
      const c = col;
      const get = (k: keyof typeof COLUMNS) => (c[k] ? cells[c[k]!] : undefined);
      const name = String(get("waiter") ?? "").trim();
      if (name) waiter = name;
      const date = get("date");
      const folio = num(get("folio"));
      if (!(date instanceof Date) || !folio) return; // fila de nombre del mesero u otra
      rows.push({
        folio,
        waiter,
        billed_at: wallClock(date),
        amount: num(get("amount")),
        tip_cash: num(get("tip_cash")),
        tip_vouchers: num(get("tip_vouchers")),
        tip_other: num(get("tip_other")),
        tip_card: num(get("tip_card")),
        commission: num(get("commission")),
        commission_tax: num(get("commission_tax")),
        tip_total: num(get("tip_total")),
      });
    });

    if (col) {
      const missing = REQUIRED.filter((k) => !col![k]).map((k) => COLUMNS[k]);
      if (missing.length) throw new Error(`Al archivo le faltan columnas: ${missing.join(", ")}.`);
      if (!rows.length) throw new Error("El archivo no trae cuentas.");
      return { rows, restaurant };
    }
  }
  throw new Error("Este no parece el reporte de cuentas con propina: no encontré las columnas FECHA y PROPINA_TOTAL.");
}
