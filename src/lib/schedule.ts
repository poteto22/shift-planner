export type ShiftKind = "NORMAL" | "SPECIAL";
export type OverrideMode = "REPLACE" | "ADD" | "OFF";
export type FairnessPeriod = 3 | 6 | 12;

export const SHIFT_COLORS = [
  { key: "am", label: "เหลืองอำพัน", hex: "#f2b33d" },
  { key: "gold", label: "เหลืองทอง", hex: "#facc15" },
  { key: "orange", label: "ส้มแสด", hex: "#fb923c" },
  { key: "sp", label: "แดงสตูดิโอ", hex: "#ff3b30" },
  { key: "rose", label: "แดงกุหลาบ", hex: "#fb7185" },
  { key: "pink", label: "ชมพูโรส", hex: "#f472b6" },
  { key: "fuchsia", label: "ม่วงบานเย็น", hex: "#e879f9" },
  { key: "nt", label: "ม่วงลาเวนเดอร์", hex: "#a093ff" },
  { key: "indigo", label: "น้ำเงินคราม", hex: "#6366f1" },
  { key: "blue", label: "น้ำเงินสด", hex: "#3b82f6" },
  { key: "sky", label: "ฟ้าสว่าง", hex: "#38bdf8" },
  { key: "pm", label: "ฟ้าเทอร์ควอยซ์", hex: "#45c1d6" },
  { key: "teal", label: "เขียวมิ้นต์", hex: "#2dd4bf" },
  { key: "emerald", label: "เขียวมรกต", hex: "#3ecf8e" },
  { key: "lime", label: "เขียวมะนาว", hex: "#a3e635" },
] as const;

export type ShiftColorKey = (typeof SHIFT_COLORS)[number]["key"];

export function getShiftColorMeta(colorKey: string) {
  return (
    SHIFT_COLORS.find((c) => c.key === colorKey) ?? SHIFT_COLORS[0]
  );
}

export interface TeamRecord {
  id: number;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface PositionRecord {
  id: number;
  name: string;
  sortOrder: number;
  isLead: boolean;
  isSpecial: boolean;
}

export interface EmployeeRecord {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  positionId: number;
  teamId: number | null;
  active: boolean;
}

export interface ShiftTypeRecord {
  id: number;
  code: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  kind: ShiftKind;
  color: string;     // "am" | "pm" | "nt" | "sp"
  active: boolean;
}

export interface PlanEntryRecord {
  id: number;
  planId: number;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  teamId: number | null;
  isCam3: boolean;
  employeeId?: number | null;
  shiftTypeId: number;
}

export interface SpecialSlotRecord {
  id: number;
  planId: number;
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  shiftTypeId: number;
}

export interface MasterPlanRecord {
  id: number;
  version: number;
  effectiveFrom: string; // "YYYY-MM-DD"
  note: string;
  entries: PlanEntryRecord[];
  specialSlots: SpecialSlotRecord[];
}

export interface SpecialAssignmentRecord {
  id: number;
  slotId: number;
  workDate: string; // "YYYY-MM-DD"
  teamId: number;
}

export interface OverrideRecord {
  id: number;
  workDate: string; // "YYYY-MM-DD"
  teamId: number | null;
  isCam3: boolean;
  employeeId?: number | null;
  mode: OverrideMode;
  shiftTypeId: number | null;
  customStart: string | null;
  customEnd: string | null;
  reason: string;
}

export interface WeekSnapshotRecord {
  weekStart: string; // "YYYY-MM-DD" (Sunday)
  data: ResolvedWeek;
  finalizedAt: string;
}

export interface PlannerStoreData {
  teams: TeamRecord[];
  positions: PositionRecord[];
  employees: EmployeeRecord[];
  shiftTypes: ShiftTypeRecord[];
  masterPlans: MasterPlanRecord[];
  specialAssignments: SpecialAssignmentRecord[];
  overrides: OverrideRecord[];
  snapshots: WeekSnapshotRecord[];
}

export interface ResolvedShiftBadge {
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  kind: ShiftKind;
  isOvernight: boolean;
  hours: number;
  isOverdrive?: boolean;
  overdriveMode?: OverrideMode;
  overrideId?: number;
  reason?: string;
}

export interface ResolvedSpecialSlot {
  slotId: number;
  dayOfWeek: number;
  workDate: string;
  shift: ResolvedShiftBadge;
  assignedTeamId: number | null;
  assignedTeamName: string | null;
  overlapWarning: boolean;
  multipleSpecialWarning: boolean;
}

export interface ResolvedCell {
  dayOfWeek: number;
  workDate: string;
  planVersion: number;
  baseShift: ResolvedShiftBadge | null;
  wasOffByOverride: boolean;
  overrideReason?: string;
  overrideId?: number;
  addedShifts: ResolvedShiftBadge[];
  specialSlots: ResolvedSpecialSlot[];
  isWorkingRegularOrReplaced: boolean;
}

export interface CellSpanGroup {
  startIndex: number;
  span: number;
  cells: ResolvedCell[];
  sharedBaseShift: ResolvedShiftBadge | null;
}

export function canMergeShiftCells(a: ResolvedCell, b: ResolvedCell): boolean {
  if (a.wasOffByOverride || b.wasOffByOverride) return false;
  if (!a.baseShift || !b.baseShift) return false;
  return (
    a.baseShift.name === b.baseShift.name &&
    a.baseShift.startTime === b.baseShift.startTime &&
    a.baseShift.endTime === b.baseShift.endTime &&
    a.baseShift.color === b.baseShift.color &&
    Boolean(a.baseShift.isOverdrive) === Boolean(b.baseShift.isOverdrive) &&
    (a.baseShift.reason ?? "") === (b.baseShift.reason ?? "")
  );
}

export function groupConsecutiveCells(cells: ResolvedCell[]): CellSpanGroup[] {
  const groups: CellSpanGroup[] = [];
  for (let i = 0; i < cells.length; i++) {
    const current = cells[i];
    const prevGroup = groups[groups.length - 1];
    if (
      prevGroup &&
      canMergeShiftCells(prevGroup.cells[prevGroup.cells.length - 1], current)
    ) {
      prevGroup.span += 1;
      prevGroup.cells.push(current);
    } else {
      groups.push({
        startIndex: i,
        span: 1,
        cells: [current],
        sharedBaseShift: current.wasOffByOverride ? null : current.baseShift,
      });
    }
  }
  return groups;
}

export interface ResolvedTeamRow {
  team: TeamRecord;
  leadName: string;
  members: Array<{
    employee: EmployeeRecord;
    position: PositionRecord;
  }>;
  cells: ResolvedCell[];
  totalWorkDays: number;
  specialCountThisWeek: number;
}

export interface ResolvedCam3Row {
  employee: EmployeeRecord;
  cells: ResolvedCell[];
  totalWorkDays: number;
}

export interface FairnessTeamStat {
  teamId: number;
  teamName: string;
  doneUpToToday: number;
  plannedAfterToday: number;
}

export interface ResolvedWeek {
  weekStart: string;
  weekEnd: string;
  days: Array<{
    dayOfWeek: number;
    date: string;
    labelShort: string;
    dayNum: number;
    planVersion: number;
  }>;
  planVersionsUsed: Array<{
    version: number;
    effectiveFrom: string;
    note: string;
  }>;
  teamRows: ResolvedTeamRow[];
  cam3Rows: ResolvedCam3Row[];
  cam3Row: {
    staffNames: string[];
    members: EmployeeRecord[];
    cells: ResolvedCell[];
    totalWorkDays: number;
  };
  specialSlotsByDay: ResolvedSpecialSlot[][];
  unassignedSpecialCount: number;
  fairness: {
    periodMonths: FairnessPeriod;
    rangeStart: string;
    rangeEnd: string;
    stats: FairnessTeamStat[];
  };
}

const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function subtractMonths(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  d.setUTCMonth(d.getUTCMonth() - months);
  return formatIsoDate(d);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Normalizes any YYYY-MM-DD date to the Sunday that starts its week (dayOfWeek = 0).
 */
export function getSundayOfWeek(iso: string): string {
  const d = parseIsoDate(iso);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - dow);
  return formatIsoDate(d);
}

export function calcShiftHours(startTime: string, endTime: string): {
  hours: number;
  isOvernight: boolean;
} {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const isOvernight = endMin <= startMin;
  const diffMin = isOvernight ? 24 * 60 - startMin + endMin : endMin - startMin;
  return {
    hours: Math.round((diffMin / 60) * 10) / 10,
    isOvernight,
  };
}

export function toShiftBadge(shift: ShiftTypeRecord): ResolvedShiftBadge {
  const { hours, isOvernight } = calcShiftHours(shift.startTime, shift.endTime);
  return {
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    color: shift.color,
    kind: shift.kind,
    isOvernight,
    hours,
  };
}

/**
 * Finds the MasterPlan active on `dateIso` (`effectiveFrom <= dateIso` with latest date/version).
 * Supports Master-plan starting on any day of the week (including mid-week).
 */
export function getPlanForDate(
  plans: MasterPlanRecord[],
  dateIso: string
): MasterPlanRecord | null {
  if (plans.length === 0) return null;
  const sorted = [...plans].sort((a, b) =>
    a.effectiveFrom !== b.effectiveFrom
      ? b.effectiveFrom.localeCompare(a.effectiveFrom)
      : b.version - a.version
  );
  const match = sorted.find((p) => p.effectiveFrom <= dateIso);
  return match ?? sorted[sorted.length - 1];
}

/**
 * Calculates cumulative 6th-day / special shift counts per team over the last 3, 6, or 12 months
 * counting ONLY up to `todayIso` (`rangeStart <= workDate <= todayIso`).
 */
export function getFairnessStats(
  store: PlannerStoreData,
  weekStartIso: string,
  todayIso: string,
  periodMonths: FairnessPeriod
): {
  periodMonths: FairnessPeriod;
  rangeStart: string;
  rangeEnd: string;
  stats: FairnessTeamStat[];
} {
  const year = todayIso.slice(0, 4);
  const isFullYear = periodMonths === 12;
  const rangeStart = isFullYear
    ? `${year}-01-01`
    : subtractMonths(todayIso, periodMonths);
  const rangeEnd = isFullYear ? `${year}-12-31` : todayIso;
  const weekEndIso = addDays(weekStartIso, 6);
  const plannedEndIso = isFullYear ? rangeEnd : weekEndIso;
  const activeTeams = store.teams
    .filter((t) => t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const stats: FairnessTeamStat[] = activeTeams.map((team) => {
    const assignedDone = store.specialAssignments.filter(
      (a) =>
        a.teamId === team.id &&
        a.workDate >= rangeStart &&
        a.workDate <= todayIso &&
        a.workDate <= rangeEnd
    ).length;

    const overrideAddedDone = store.overrides.filter(
      (o) =>
        !o.isCam3 &&
        o.teamId === team.id &&
        o.mode === "ADD" &&
        o.workDate >= rangeStart &&
        o.workDate <= todayIso &&
        o.workDate <= rangeEnd
    ).length;

    const plannedSpecialAfterToday = store.specialAssignments.filter(
      (a) =>
        a.teamId === team.id &&
        a.workDate >= (isFullYear ? rangeStart : weekStartIso) &&
        a.workDate <= plannedEndIso &&
        a.workDate > todayIso
    ).length;

    const plannedOverrideAfterToday = store.overrides.filter(
      (o) =>
        !o.isCam3 &&
        o.teamId === team.id &&
        o.mode === "ADD" &&
        o.workDate >= (isFullYear ? rangeStart : weekStartIso) &&
        o.workDate <= plannedEndIso &&
        o.workDate > todayIso
    ).length;

    return {
      teamId: team.id,
      teamName: team.name,
      doneUpToToday: assignedDone + overrideAddedDone,
      plannedAfterToday: plannedSpecialAfterToday + plannedOverrideAfterToday,
    };
  });

  return {
    periodMonths,
    rangeStart,
    rangeEnd,
    stats,
  };
}

interface ScheduleDayWithPlan {
  dayOfWeek: number;
  date: string;
  labelShort: string;
  dayNum: number;
  planVersion: number;
  plan: MasterPlanRecord | null;
}

export type ResolvedMonth = ResolvedWeek;

function resolveScheduleForDays(
  store: PlannerStoreData,
  days: ScheduleDayWithPlan[],
  rangeStart: string,
  rangeEnd: string,
  todayIso: string,
  periodMonths: FairnessPeriod
): ResolvedWeek {
  const shiftMap = new Map(store.shiftTypes.map((s) => [s.id, s]));
  const posMap = new Map(store.positions.map((p) => [p.id, p]));
  const activeTeams = store.teams
    .filter((t) => t.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const teamMap = new Map(store.teams.map((t) => [t.id, t]));

  const planVersionsMap = new Map<
    number,
    { version: number; effectiveFrom: string; note: string }
  >();
  for (const d of days) {
    if (d.plan && !planVersionsMap.has(d.plan.version)) {
      planVersionsMap.set(d.plan.version, {
        version: d.plan.version,
        effectiveFrom: d.plan.effectiveFrom,
        note: d.plan.note,
      });
    }
  }

  function resolveEntityCell(
    dayIndex: number,
    teamId: number | null,
    isCam3: boolean,
    employeeId?: number
  ): ResolvedCell {
    const d = days[dayIndex];
    const dayOfWeek = d.dayOfWeek;
    const plan = d.plan;
    const hasPerEmployeeCam3 = Boolean(
      isCam3 && plan?.entries.some((e) => e.isCam3 && e.employeeId != null)
    );
    const entry = plan?.entries.find((e) => {
      if (e.dayOfWeek !== dayOfWeek) return false;
      if (!isCam3) return !e.isCam3 && e.teamId === teamId;
      if (!e.isCam3) return false;
      if (employeeId != null && hasPerEmployeeCam3) {
        return e.employeeId === employeeId;
      }
      return e.employeeId == null || e.employeeId === employeeId;
    });
    let baseShift: ResolvedShiftBadge | null = null;
    if (entry) {
      const st = shiftMap.get(entry.shiftTypeId);
      if (st) baseShift = toShiftBadge(st);
    }

    const dayOverrides = store.overrides.filter((o) => {
      if (o.workDate !== d.date) return false;
      if (!isCam3) return !o.isCam3 && o.teamId === teamId;
      if (!o.isCam3) return false;
      return (
        o.employeeId == null ||
        (employeeId != null && o.employeeId === employeeId)
      );
    });

    let wasOffByOverride = false;
    let overrideReason: string | undefined;
    let overrideId: number | undefined;
    const addedShifts: ResolvedShiftBadge[] = [];

    for (const ov of dayOverrides) {
      if (ov.mode === "OFF") {
        baseShift = null;
        wasOffByOverride = true;
        overrideReason = ov.reason;
        overrideId = ov.id;
      } else if (ov.mode === "REPLACE") {
        const st = ov.shiftTypeId ? shiftMap.get(ov.shiftTypeId) : undefined;
        const startTime = ov.customStart || st?.startTime || "08:00";
        const endTime = ov.customEnd || st?.endTime || "17:00";
        const { hours, isOvernight } = calcShiftHours(startTime, endTime);
        baseShift = {
          name: st ? st.name : "ปรับเวลา",
          startTime,
          endTime,
          color: st?.color ?? "pm",
          kind: st?.kind ?? "NORMAL",
          isOvernight,
          hours,
          isOverdrive: true,
          overdriveMode: "REPLACE",
          overrideId: ov.id,
          reason: ov.reason,
        };
        wasOffByOverride = false;
        overrideReason = ov.reason;
        overrideId = ov.id;
      } else if (ov.mode === "ADD") {
        const st = ov.shiftTypeId ? shiftMap.get(ov.shiftTypeId) : undefined;
        const startTime = ov.customStart || st?.startTime || "16:00";
        const endTime = ov.customEnd || st?.endTime || "22:00";
        const { hours, isOvernight } = calcShiftHours(startTime, endTime);
        addedShifts.push({
          name: st ? st.name : "กะเสริม",
          startTime,
          endTime,
          color: st?.color ?? "sp",
          kind: st?.kind ?? "SPECIAL",
          isOvernight,
          hours,
          isOverdrive: true,
          overdriveMode: "ADD",
          overrideId: ov.id,
          reason: ov.reason,
        });
      }
    }

    return {
      dayOfWeek,
      workDate: d.date,
      planVersion: d.planVersion,
      baseShift,
      wasOffByOverride,
      overrideReason,
      overrideId,
      addedShifts,
      specialSlots: [],
      isWorkingRegularOrReplaced: baseShift !== null,
    };
  }

  // First build cells for all teams
  const teamCellsMap = new Map<number, ResolvedCell[]>();
  for (const team of activeTeams) {
    const cells = Array.from({ length: days.length }, (_, dayIndex) =>
      resolveEntityCell(dayIndex, team.id, false)
    );
    teamCellsMap.set(team.id, cells);
  }

  // Resolve special slots for each day from that day's effective Master-plan
  const specialSlotsByDay: ResolvedSpecialSlot[][] = Array.from(
    { length: days.length },
    () => []
  );

  // Count how many special slots each team is assigned in the same week (Sunday-Saturday)
  const teamWeekSpecialCount = new Map<string, number>();
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const d = days[dayIndex];
    const weekKey = getSundayOfWeek(d.date);
    const slotsForDay =
      d.plan?.specialSlots.filter((s) => s.dayOfWeek === d.dayOfWeek) ?? [];
    for (const slot of slotsForDay) {
      const assignment = store.specialAssignments.find(
        (a) => a.slotId === slot.id && a.workDate === d.date
      );
      if (assignment) {
        const teamWeekKey = `${assignment.teamId}_${weekKey}`;
        teamWeekSpecialCount.set(
          teamWeekKey,
          (teamWeekSpecialCount.get(teamWeekKey) ?? 0) + 1
        );
      }
    }
  }

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const d = days[dayIndex];
    const weekKey = getSundayOfWeek(d.date);
    const slotsForDay =
      d.plan?.specialSlots.filter((s) => s.dayOfWeek === d.dayOfWeek) ?? [];
    for (const slot of slotsForDay) {
      const st = shiftMap.get(slot.shiftTypeId);
      if (!st) continue;
      const assignment = store.specialAssignments.find(
        (a) => a.slotId === slot.id && a.workDate === d.date
      );
      const assignedTeam = assignment
        ? teamMap.get(assignment.teamId) ?? null
        : null;
      const teamCells = assignedTeam
        ? teamCellsMap.get(assignedTeam.id)
        : undefined;
      const targetCell = teamCells?.[dayIndex];
      const overlapWarning = Boolean(
        targetCell && targetCell.isWorkingRegularOrReplaced
      );
      const teamWeekKey = assignedTeam ? `${assignedTeam.id}_${weekKey}` : "";
      const multipleSpecialWarning = assignedTeam
        ? (teamWeekSpecialCount.get(teamWeekKey) ?? 0) > 1
        : false;

      const resolvedSlot: ResolvedSpecialSlot = {
        slotId: slot.id,
        dayOfWeek: d.dayOfWeek,
        workDate: d.date,
        shift: toShiftBadge(st),
        assignedTeamId: assignedTeam?.id ?? null,
        assignedTeamName: assignedTeam?.name ?? null,
        overlapWarning,
        multipleSpecialWarning,
      };

      specialSlotsByDay[dayIndex].push(resolvedSlot);
      if (targetCell) {
        targetCell.specialSlots.push(resolvedSlot);
      }
    }
  }

  const teamRows: ResolvedTeamRow[] = activeTeams.map((team) => {
    const cells = teamCellsMap.get(team.id) ?? [];
    const members = store.employees
      .filter((e) => e.active && e.teamId === team.id)
      .map((employee) => ({
        employee,
        position: posMap.get(employee.positionId) ?? {
          id: 0,
          name: "ไม่ระบุ",
          sortOrder: 99,
          isLead: false,
          isSpecial: false,
        },
      }))
      .sort(
        (a, b) =>
          a.position.sortOrder - b.position.sortOrder ||
          a.employee.id - b.employee.id
      );

    const lead = members.find((m) => m.position.isLead);
    const leadName = lead
      ? `${lead.employee.firstName} ${lead.employee.lastName}`
      : "ยังไม่ระบุหัวหน้าทีม";

    let totalWorkDays = 0;
    let specialCountThisWeek = 0;
    for (const c of cells) {
      const countInCell =
        (c.baseShift ? 1 : 0) + c.addedShifts.length + c.specialSlots.length;
      totalWorkDays += countInCell;
      specialCountThisWeek += c.specialSlots.length + c.addedShifts.length;
    }

    return {
      team,
      leadName,
      members,
      cells,
      totalWorkDays,
      specialCountThisWeek,
    };
  });

  const cam3Members = store.employees
    .filter((e) => {
      if (!e.active) return false;
      const pos = posMap.get(e.positionId);
      return Boolean(pos?.isSpecial || e.teamId === null);
    })
    .sort((a, b) => a.id - b.id);

  const cam3Rows: ResolvedCam3Row[] = cam3Members.map((employee) => {
    const cells = Array.from({ length: days.length }, (_, dayIndex) =>
      resolveEntityCell(dayIndex, null, true, employee.id)
    );
    const totalWorkDays = cells.reduce(
      (acc, c) => acc + (c.baseShift ? 1 : 0) + c.addedShifts.length,
      0
    );
    return {
      employee,
      cells,
      totalWorkDays,
    };
  });

  const cam3Cells =
    cam3Rows[0]?.cells ??
    Array.from({ length: days.length }, (_, dayIndex) =>
      resolveEntityCell(dayIndex, null, true)
    );

  const cam3TotalDays = cam3Cells.reduce(
    (acc, c) => acc + (c.baseShift ? 1 : 0) + c.addedShifts.length,
    0
  );

  const unassignedSpecialCount = specialSlotsByDay
    .flat()
    .filter((s) => s.assignedTeamId === null).length;

  const fairness = getFairnessStats(
    store,
    rangeStart,
    todayIso,
    periodMonths
  );

  return {
    weekStart: rangeStart,
    weekEnd: rangeEnd,
    days: days.map(({ plan: _plan, ...rest }) => rest),
    planVersionsUsed: Array.from(planVersionsMap.values()),
    teamRows,
    cam3Rows,
    cam3Row: {
      staffNames: cam3Members.map((m) => `${m.firstName} ${m.lastName}`),
      members: cam3Members,
      cells: cam3Cells,
      totalWorkDays: cam3TotalDays,
    },
    specialSlotsByDay,
    unassignedSpecialCount,
    fairness,
  };
}

export function resolveWeek(
  store: PlannerStoreData,
  inputDateIso: string,
  todayIso: string,
  periodMonths: FairnessPeriod = 3
): ResolvedWeek {
  const weekStart = getSundayOfWeek(inputDateIso);
  const weekEnd = addDays(weekStart, 6);

  const days: ScheduleDayWithPlan[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
    const date = addDays(weekStart, dayOfWeek);
    const plan = getPlanForDate(store.masterPlans, date);
    const dayNum = Number(date.slice(8, 10));
    return {
      dayOfWeek,
      date,
      labelShort: THAI_DAYS_SHORT[dayOfWeek],
      dayNum,
      planVersion: plan?.version ?? 1,
      plan,
    };
  });

  return resolveScheduleForDays(
    store,
    days,
    weekStart,
    weekEnd,
    todayIso,
    periodMonths
  );
}

export function resolveMonth(
  store: PlannerStoreData,
  yearMonthOrDateIso: string,
  todayIso: string,
  periodMonths: FairnessPeriod = 12
): ResolvedWeek {
  const ym = yearMonthOrDateIso.slice(0, 7);
  const [year, month] = ym.split("-").map(Number);
  const numDays = getDaysInMonth(year, month);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${String(numDays).padStart(2, "0")}`;

  const days: ScheduleDayWithPlan[] = Array.from({ length: numDays }, (_, index) => {
    const dayNum = index + 1;
    const date = `${ym}-${String(dayNum).padStart(2, "0")}`;
    const d = parseIsoDate(date);
    const dayOfWeek = d.getUTCDay();
    const plan = getPlanForDate(store.masterPlans, date);
    return {
      dayOfWeek,
      date,
      labelShort: THAI_DAYS_SHORT[dayOfWeek],
      dayNum,
      planVersion: plan?.version ?? 1,
      plan,
    };
  });

  return resolveScheduleForDays(
    store,
    days,
    monthStart,
    monthEnd,
    todayIso,
    periodMonths
  );
}

/**
 * Computes automatic fair team rotation for any unassigned special slots in the week.
 * Priority:
 * 1) Team is OFF on that day
 * 2) Fewest special shifts assigned in this week
 * 3) Fewest cumulative 6th-day shifts in the selected fairness period (up to today + planned)
 * 4) Team sortOrder
 */
export function computeAutoRotateAssignments(
  store: PlannerStoreData,
  weekStartIso: string,
  todayIso: string,
  periodMonths: FairnessPeriod = 3
): Array<{ slotId: number; workDate: string; teamId: number }> {
  const workingStore: PlannerStoreData = {
    ...store,
    specialAssignments: [...store.specialAssignments],
  };
  const result: Array<{ slotId: number; workDate: string; teamId: number }> = [];

  const initialWeek = resolveWeek(
    workingStore,
    weekStartIso,
    todayIso,
    periodMonths
  );
  const unassignedSlots = initialWeek.specialSlotsByDay
    .flat()
    .filter((s) => s.assignedTeamId === null);

  for (const slot of unassignedSlots) {
    const currentResolved = resolveWeek(
      workingStore,
      weekStartIso,
      todayIso,
      periodMonths
    );
    const fairnessMap = new Map(
      currentResolved.fairness.stats.map((s) => [
        s.teamId,
        s.doneUpToToday + s.plannedAfterToday,
      ])
    );

    const candidates = [...currentResolved.teamRows].sort((a, b) => {
      const aWorking = a.cells[slot.dayOfWeek].isWorkingRegularOrReplaced
        ? 1
        : 0;
      const bWorking = b.cells[slot.dayOfWeek].isWorkingRegularOrReplaced
        ? 1
        : 0;
      if (aWorking !== bWorking) return aWorking - bWorking;

      if (a.specialCountThisWeek !== b.specialCountThisWeek) {
        return a.specialCountThisWeek - b.specialCountThisWeek;
      }

      const aFair = fairnessMap.get(a.team.id) ?? 0;
      const bFair = fairnessMap.get(b.team.id) ?? 0;
      if (aFair !== bFair) return aFair - bFair;

      return a.team.sortOrder - b.team.sortOrder;
    });

    const chosen = candidates[0];
    if (!chosen) continue;

    const newAssignment: SpecialAssignmentRecord = {
      id: Date.now() + result.length,
      slotId: slot.slotId,
      workDate: slot.workDate,
      teamId: chosen.team.id,
    };
    workingStore.specialAssignments.push(newAssignment);
    result.push({
      slotId: slot.slotId,
      workDate: slot.workDate,
      teamId: chosen.team.id,
    });
  }

  return result;
}
