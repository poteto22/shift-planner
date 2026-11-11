import PlannerApp from "@/components/PlannerApp";
import { isAdminAuthenticated } from "@/lib/auth";
import { getBangkokTodayIso, getStore } from "@/lib/db";
import { resolveMonth, type FairnessPeriod } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; week?: string; period?: string }>;
}) {
  const params = await searchParams;
  const todayIso = getBangkokTodayIso();
  const monthParam =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : (params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week)
          ? params.week.slice(0, 7)
          : todayIso.slice(0, 7));

  const periodNum = Number(params.period);
  const periodMonths: FairnessPeriod =
    periodNum === 6 || periodNum === 12 ? periodNum : 12;

  const [store, isAdmin] = await Promise.all([
    getStore(),
    isAdminAuthenticated(),
  ]);

  const resolvedMonth = resolveMonth(store, monthParam, todayIso, periodMonths);

  return (
    <PlannerApp
      store={store}
      resolvedWeek={resolvedMonth}
      todayIso={todayIso}
      isAdmin={isAdmin}
    />
  );
}
