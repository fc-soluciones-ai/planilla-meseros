import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { loadWeek } from "@/lib/data";
import { ISO_DATE, mondayOf, todayIn } from "@/lib/turnos";
import Planilla from "./planilla";

export default async function Page({ searchParams }: PageProps<"/">) {
  if (!(await isLoggedIn())) redirect("/login");

  const { semana } = await searchParams;
  const today = todayIn(process.env.RESTAURANT_TZ || "America/Costa_Rica");
  const monday = mondayOf(typeof semana === "string" && ISO_DATE.test(semana) ? semana : today);
  const data = await loadWeek(monday);

  return <Planilla key={monday} monday={monday} today={today} {...data} />;
}
