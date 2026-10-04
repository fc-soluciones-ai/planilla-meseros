import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/auth";
import { missingConfig } from "@/lib/config";
import { loadUsers, loadWeek } from "@/lib/data";
import { ISO_DATE, mondayOf, todayIn } from "@/lib/turnos";
import Planilla from "./planilla";
import SetupNotice from "./setup-notice";

export default async function Page({ searchParams }: PageProps<"/">) {
  await connection(); // revisa la configuración en cada visita, no al compilar
  const missing = missingConfig();
  if (missing.length) return <SetupNotice missing={missing} />;
  const session = await getSession().catch((e) => {
    console.error("getSession", e);
    return null;
  });
  if (!session) redirect("/login");

  const { semana } = await searchParams;
  const today = todayIn(process.env.RESTAURANT_TZ || "America/Costa_Rica");
  const monday = mondayOf(typeof semana === "string" && ISO_DATE.test(semana) ? semana : today);

  let data, users;
  try {
    data = await loadWeek(monday); // primero: si la base es de una versión anterior, aquí se actualiza
    users = await loadUsers();
  } catch (e) {
    console.error("loadWeek", e);
    return <SetupNotice error={e instanceof Error ? e.message : String(e)} />;
  }

  // La clave cambia si cambian las personas o sus días libres: la pantalla se rearma con los días por defecto nuevos
  const key = `${monday}|${data.staff.map((p) => `${p.id}:${p.type}:${p.daysOff.join("")}`).join(",")}`;
  return <Planilla key={key} monday={monday} today={today} {...data} users={users} me={session} />;
}
