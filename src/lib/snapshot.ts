import {
  addDays,
  getSundayOfWeek,
  resolveWeek,
  type PlannerStoreData,
} from "./schedule";

/**
 * Automatically snapshots recently completed weeks (`weekEnd < todayIso`) so historical
 * schedules and rosters remain immutable even if employees or teams change later.
 */
export function finalizePastWeeks(
  store: PlannerStoreData,
  todayIso: string,
  weeksBackToEnsure = 4
): boolean {
  const activePlans = store.masterPlans.filter(
    (p) => p.entries.length > 0 || p.specialSlots.length > 0
  );
  if (activePlans.length === 0) return false;

  const earliestEffectiveFrom = activePlans.reduce(
    (min, p) => (p.effectiveFrom < min ? p.effectiveFrom : min),
    activePlans[0].effectiveFrom
  );

  const currentWeekSunday = getSundayOfWeek(todayIso);
  const existingStarts = new Set(store.snapshots.map((s) => s.weekStart));
  let changed = false;

  for (let i = weeksBackToEnsure; i >= 1; i--) {
    const weekStart = addDays(currentWeekSunday, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    if (
      weekEnd < todayIso &&
      weekEnd >= earliestEffectiveFrom &&
      !existingStarts.has(weekStart)
    ) {
      const data = resolveWeek(store, weekStart, weekEnd, 3);
      store.snapshots.push({
        weekStart,
        data,
        finalizedAt: new Date().toISOString(),
      });
      existingStarts.add(weekStart);
      changed = true;
    }
  }

  store.snapshots.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return changed;
}
