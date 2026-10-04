import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { missingConfig } from "@/lib/config";
import { loadWeek } from "@/lib/data";
import { ISO_DATE, mondayOf, todayIn } from "@/lib/turnos";
import Planilla from "./planilla";
import SetupNotice from "./setup-notice";

export default async function Page({ searchParams }: PageProps<"/">) {
  await connection(); // revisa la configuración en cada visita, no al compilar
  const missing = missingConfig();
  if (missing.length) return <SetupNotice missing={missing} />;
  if (!(await isLoggedIn())) redirect("/login");

  const { semana } = await searchParams;
  const today = todayIn(process.env.RESTAURANT_TZ || "America/Costa_Rica");
  const monday = mondayOf(typeof semana === "string" && ISO_DATE.test(semana) ? semana : today);

  let data;
  try {
    data = await loadWeek(monday);
  } catch (e) {
    console.error("loadWeek", e);
    return <SetupNotice error={e instanceof Error ? e.message : String(e)} />;
  }

  return <Planilla key={monday} monday={monday} today={today} {...data} />;
}
