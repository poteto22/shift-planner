import PlannerApp from "@/components/PlannerApp";
import { isAdminAuthenticated } from "@/lib/auth";
import { getBangkokTodayIso, getStore } from "@/lib/db";
import { resolveWeek, type FairnessPeriod } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; period?: string }>;
}) {
  const params = await searchParams;
  const todayIso = getBangkokTodayIso();
  const weekParam =
    params.week && /^\d{4}-\d{2}-\d{2}$/.test(params.week)
      ? params.week
      : todayIso;

  const periodNum = Number(params.period);
  const periodMonths: FairnessPeriod =
    periodNum === 6 || periodNum === 12 ? periodNum : 3;

  const [store, isAdmin] = await Promise.all([
    getStore(),
    isAdminAuthenticated(),
  ]);

  const resolvedWeek = resolveWeek(store, weekParam, todayIso, periodMonths);

  return (
    <PlannerApp
      store={store}
      resolvedWeek={resolvedWeek}
      todayIso={todayIso}
      isAdmin={isAdmin}
    />
  );
}
