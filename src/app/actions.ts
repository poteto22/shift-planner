"use server";

import { revalidatePath } from "next/cache";
import {
  checkAdminCredentials,
  clearAdminSessionCookie,
  isAdminAuthenticated,
  setAdminSessionCookie,
} from "@/lib/auth";
import { getBangkokTodayIso, mutateStore } from "@/lib/db";
import {
  addDays,
  computeAutoRotateAssignments,
  getSundayOfWeek,
  resolveMonth,
  type FairnessPeriod,
  type OverrideMode,
  type ShiftKind,
} from "@/lib/schedule";

async function requireAdmin() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    throw new Error("เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถแก้ไขข้อมูลได้");
  }
}

export async function loginAdminAction(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  if (!checkAdminCredentials(username.trim(), password)) {
    return { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  }
  await setAdminSessionCookie();
  revalidatePath("/");
  return { ok: true };
}

export async function logoutAdminAction(): Promise<void> {
  await clearAdminSessionCookie();
  revalidatePath("/");
}

export async function assignSpecialSlotAction(
  slotId: number,
  workDate: string,
  teamId: number | null
): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    store.specialAssignments = store.specialAssignments.filter(
      (a) => !(a.slotId === slotId && a.workDate === workDate)
    );
    if (teamId !== null) {
      const nextId =
        store.specialAssignments.reduce((m, a) => Math.max(m, a.id), 0) + 1;
      store.specialAssignments.push({
        id: nextId,
        slotId,
        workDate,
        teamId,
      });
    }
  });
  revalidatePath("/");
}

export async function clearWeekSpecialAssignmentsAction(
  weekStartIso: string
): Promise<void> {
  await requireAdmin();
  const weekStart = getSundayOfWeek(weekStartIso);
  const weekEnd = addDays(weekStart, 6);
  await mutateStore((store) => {
    store.specialAssignments = store.specialAssignments.filter(
      (a) => !(a.workDate >= weekStart && a.workDate <= weekEnd)
    );
  });
  revalidatePath("/");
}

export async function clearMonthSpecialAssignmentsAction(
  monthStr: string
): Promise<void> {
  await requireAdmin();
  const ym = monthStr.slice(0, 7);
  await mutateStore((store) => {
    store.specialAssignments = store.specialAssignments.filter(
      (a) => !a.workDate.startsWith(ym)
    );
  });
  revalidatePath("/");
}

export async function autoRotateMonthAction(
  monthStr: string,
  periodMonths: FairnessPeriod
): Promise<void> {
  await requireAdmin();
  const todayIso = getBangkokTodayIso();
  const ym = monthStr.slice(0, 7);
  await mutateStore((store) => {
    const resolved = resolveMonth(store, ym, todayIso, periodMonths);
    const unassignedSlots = resolved.specialSlotsByDay
      .flat()
      .filter((s) => s.assignedTeamId === null);
    unassignedSlots.sort((a, b) => a.workDate.localeCompare(b.workDate));

    for (const slot of unassignedSlots) {
      const currentResolved = resolveMonth(store, ym, todayIso, periodMonths);
      const fairnessMap = new Map(
        currentResolved.fairness.stats.map((s) => [
          s.teamId,
          s.doneUpToToday + s.plannedAfterToday,
        ])
      );
      const weekOfSlot = getSundayOfWeek(slot.workDate);

      const candidates = [...currentResolved.teamRows].sort((a, b) => {
        const aCell = a.cells.find((c) => c.workDate === slot.workDate);
        const bCell = b.cells.find((c) => c.workDate === slot.workDate);
        const aWorking = aCell?.isWorkingRegularOrReplaced ? 1 : 0;
        const bWorking = bCell?.isWorkingRegularOrReplaced ? 1 : 0;
        if (aWorking !== bWorking) return aWorking - bWorking;

        const aWeekCount = store.specialAssignments.filter(
          (sa) =>
            sa.teamId === a.team.id && getSundayOfWeek(sa.workDate) === weekOfSlot
        ).length;
        const bWeekCount = store.specialAssignments.filter(
          (sa) =>
            sa.teamId === b.team.id && getSundayOfWeek(sa.workDate) === weekOfSlot
        ).length;
        if (aWeekCount !== bWeekCount) return aWeekCount - bWeekCount;

        const aFair = fairnessMap.get(a.team.id) ?? 0;
        const bFair = fairnessMap.get(b.team.id) ?? 0;
        if (aFair !== bFair) return aFair - bFair;

        return a.team.sortOrder - b.team.sortOrder;
      });

      const chosen = candidates[0];
      if (!chosen) continue;

      const nextId =
        store.specialAssignments.length > 0
          ? Math.max(...store.specialAssignments.map((x) => x.id)) + 1
          : 1;
      store.specialAssignments.push({
        id: nextId,
        slotId: slot.slotId,
        workDate: slot.workDate,
        teamId: chosen.team.id,
      });
    }
  });
  revalidatePath("/");
}

export async function autoRotateWeekAction(
  weekStartIso: string,
  periodMonths: FairnessPeriod
): Promise<void> {
  await requireAdmin();
  const todayIso = getBangkokTodayIso();
  await mutateStore((store) => {
    const suggestions = computeAutoRotateAssignments(
      store,
      weekStartIso,
      todayIso,
      periodMonths
    );
    let nextId =
      store.specialAssignments.reduce((m, a) => Math.max(m, a.id), 0) + 1;
    for (const s of suggestions) {
      store.specialAssignments = store.specialAssignments.filter(
        (a) => !(a.slotId === s.slotId && a.workDate === s.workDate)
      );
      store.specialAssignments.push({
        id: nextId++,
        slotId: s.slotId,
        workDate: s.workDate,
        teamId: s.teamId,
      });
    }
  });
  revalidatePath("/");
}

export async function saveMasterPlanAction(input: {
  planId?: number;
  effectiveFrom: string;
  note: string;
  entries: Array<{
    dayOfWeek: number;
    teamId: number | null;
    isCam3: boolean;
    employeeId?: number | null;
    shiftTypeId: number;
  }>;
  specialSlots: Array<{
    dayOfWeek: number;
    shiftTypeId: number;
  }>;
}): Promise<{ version: number }> {
  await requireAdmin();
  let resultVersion = 1;
  const todayIso = getBangkokTodayIso();
  await mutateStore((store) => {
    if (input.planId) {
      const existing = store.masterPlans.find((p) => p.id === input.planId);
      if (!existing) {
        throw new Error("ไม่พบแผน Master-plan ที่ต้องการแก้ไข");
      }
      if (existing.effectiveFrom <= todayIso) {
        throw new Error(
          "สามารถแก้ไขได้เฉพาะแผน Master-plan ที่ยังไม่เริ่มต้นใช้งานเท่านั้น (วันเริ่มใช้ต้องอยู่ในอนาคต)"
        );
      }
      if (input.effectiveFrom <= todayIso) {
        throw new Error("วันเริ่มใช้ของแผนที่แก้ไขต้องอยู่ในอนาคต (มากกว่าวันนี้)");
      }

      existing.effectiveFrom = input.effectiveFrom;
      existing.note = input.note.trim() || `แผน Master-plan v${existing.version}`;

      let nextEntryId =
        store.masterPlans
          .flatMap((p) => p.entries)
          .reduce((m, e) => Math.max(m, e.id), 0) + 1;
      let nextSlotId =
        store.masterPlans
          .flatMap((p) => p.specialSlots)
          .reduce((m, s) => Math.max(m, s.id), 0) + 1;

      existing.entries = input.entries.map((e) => ({
        id: nextEntryId++,
        planId: existing.id,
        dayOfWeek: e.dayOfWeek,
        teamId: e.teamId,
        isCam3: e.isCam3,
        employeeId: e.employeeId ?? null,
        shiftTypeId: e.shiftTypeId,
      }));

      existing.specialSlots = input.specialSlots.map((s) => ({
        id: nextSlotId++,
        planId: existing.id,
        dayOfWeek: s.dayOfWeek,
        shiftTypeId: s.shiftTypeId,
      }));

      const validSlotIds = new Set(existing.specialSlots.map((s) => s.id));
      store.specialAssignments = store.specialAssignments.filter(
        (a) => a.workDate < existing.effectiveFrom || validSlotIds.has(a.slotId)
      );

      resultVersion = existing.version;
    } else {
      const nextPlanId =
        store.masterPlans.reduce((m, p) => Math.max(m, p.id), 0) + 1;
      const nextVersion =
        store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) + 1;
      resultVersion = nextVersion;

      let nextEntryId =
        store.masterPlans
          .flatMap((p) => p.entries)
          .reduce((m, e) => Math.max(m, e.id), 0) + 1;
      let nextSlotId =
        store.masterPlans
          .flatMap((p) => p.specialSlots)
          .reduce((m, s) => Math.max(m, s.id), 0) + 1;

      store.masterPlans.push({
        id: nextPlanId,
        version: nextVersion,
        effectiveFrom: input.effectiveFrom,
        note: input.note.trim() || `แผน Master-plan v${nextVersion}`,
        entries: input.entries.map((e) => ({
          id: nextEntryId++,
          planId: nextPlanId,
          dayOfWeek: e.dayOfWeek,
          teamId: e.teamId,
          isCam3: e.isCam3,
          employeeId: e.employeeId ?? null,
          shiftTypeId: e.shiftTypeId,
        })),
        specialSlots: input.specialSlots.map((s) => ({
          id: nextSlotId++,
          planId: nextPlanId,
          dayOfWeek: s.dayOfWeek,
          shiftTypeId: s.shiftTypeId,
        })),
      });
    }
  });
  revalidatePath("/");
  return { version: resultVersion };
}

export async function deleteMasterPlanAction(planId: number): Promise<void> {
  await requireAdmin();
  const todayIso = getBangkokTodayIso();
  await mutateStore((store) => {
    const existing = store.masterPlans.find((p) => p.id === planId);
    if (!existing) return;
    if (existing.effectiveFrom <= todayIso) {
      throw new Error(
        "สามารถลบได้เฉพาะแผน Master-plan ที่ยังไม่เริ่มต้นใช้งานเท่านั้น"
      );
    }
    if (store.masterPlans.length <= 1) {
      throw new Error("ต้องมีแผน Master-plan อย่างน้อย 1 แผนในระบบ");
    }
    const slotIds = new Set(existing.specialSlots.map((s) => s.id));
    store.specialAssignments = store.specialAssignments.filter(
      (a) => !slotIds.has(a.slotId)
    );
    store.masterPlans = store.masterPlans.filter((p) => p.id !== planId);
  });
  revalidatePath("/");
}

export async function saveOverrideAction(input: {
  workDate: string;
  target: string; // "CAM3", "CAM3_<empId>", or teamId string
  mode: OverrideMode;
  shiftTypeId: number | null;
  customStart: string | null;
  customEnd: string | null;
  reason: string;
}): Promise<void> {
  await requireAdmin();
  const isCam3 = input.target === "CAM3" || input.target.startsWith("CAM3_");
  const employeeId = input.target.startsWith("CAM3_")
    ? Number(input.target.replace("CAM3_", ""))
    : null;
  const teamId = isCam3 ? null : Number(input.target);
  await mutateStore((store) => {
    // If mode is REPLACE or OFF, remove existing REPLACE/OFF on the same date & target
    if (input.mode === "REPLACE" || input.mode === "OFF") {
      store.overrides = store.overrides.filter(
        (o) =>
          !(
            o.workDate === input.workDate &&
            (isCam3
              ? o.isCam3 && (o.employeeId ?? null) === employeeId
              : !o.isCam3 && o.teamId === teamId) &&
            (o.mode === "REPLACE" || o.mode === "OFF")
          )
      );
    }
    const nextId =
      store.overrides.reduce((m, o) => Math.max(m, o.id), 0) + 1;
    store.overrides.push({
      id: nextId,
      workDate: input.workDate,
      teamId,
      isCam3,
      employeeId,
      mode: input.mode,
      shiftTypeId: input.shiftTypeId,
      customStart: input.customStart || null,
      customEnd: input.customEnd || null,
      reason: input.reason.trim() || "ปรับตารางเฉพาะกิจ",
    });
  });
  revalidatePath("/");
}

export async function deleteOverrideAction(id: number): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    store.overrides = store.overrides.filter((o) => o.id !== id);
  });
  revalidatePath("/");
}

export async function saveShiftTypeAction(input: {
  id?: number;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  kind: ShiftKind;
  color: string;
}): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    if (input.id) {
      const existing = store.shiftTypes.find((s) => s.id === input.id);
      if (existing) {
        existing.code = input.code.trim().toUpperCase();
        existing.name = input.name.trim();
        existing.startTime = input.startTime;
        existing.endTime = input.endTime;
        existing.kind = input.kind;
        existing.color = input.color;
      }
    } else {
      const nextId =
        store.shiftTypes.reduce((m, s) => Math.max(m, s.id), 0) + 1;
      store.shiftTypes.push({
        id: nextId,
        code: input.code.trim().toUpperCase() || `SH_${nextId}`,
        name: input.name.trim(),
        startTime: input.startTime,
        endTime: input.endTime,
        kind: input.kind,
        color: input.color,
        active: true,
      });
    }
  });
  revalidatePath("/");
}

export async function removeShiftTypeAction(shiftTypeId: number): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    const usedInPlans = store.masterPlans.some(
      (p) =>
        p.entries.some((e) => e.shiftTypeId === shiftTypeId) ||
        p.specialSlots.some((s) => s.shiftTypeId === shiftTypeId)
    );
    const usedInOverrides = store.overrides.some(
      (o) => o.shiftTypeId === shiftTypeId
    );
    if (usedInPlans || usedInOverrides) {
      const existing = store.shiftTypes.find((s) => s.id === shiftTypeId);
      if (existing) existing.active = false;
    } else {
      store.shiftTypes = store.shiftTypes.filter((s) => s.id !== shiftTypeId);
    }
  });
  revalidatePath("/");
}

export async function addTeamAction(name: string): Promise<void> {
  await requireAdmin();
  const trimmed = name.trim().toUpperCase();
  if (!trimmed) return;
  await mutateStore((store) => {
    const existing = store.teams.find(
      (t) => t.name.toUpperCase() === trimmed
    );
    if (existing) {
      existing.active = true;
      return;
    }
    const nextId = store.teams.reduce((m, t) => Math.max(m, t.id), 0) + 1;
    const nextSort =
      store.teams.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1;
    store.teams.push({
      id: nextId,
      name: trimmed,
      sortOrder: nextSort,
      active: true,
    });
  });
  revalidatePath("/");
}

export async function toggleTeamActiveAction(teamId: number): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    const t = store.teams.find((x) => x.id === teamId);
    if (t) t.active = !t.active;
  });
  revalidatePath("/");
}

export async function moveTeamOrderAction(
  teamId: number,
  direction: -1 | 1
): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    const sorted = [...store.teams].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id
    );
    const idx = sorted.findIndex((t) => t.id === teamId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const tmp = sorted[idx].sortOrder;
    sorted[idx].sortOrder = sorted[swapIdx].sortOrder;
    sorted[swapIdx].sortOrder = tmp;
  });
  revalidatePath("/");
}

export async function saveEmployeeAction(input: {
  id?: number;
  firstName: string;
  lastName: string;
  phone: string;
  positionId: number;
  teamId: number | null;
}): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    const pos = store.positions.find((p) => p.id === input.positionId);
    const resolvedTeamId = pos?.isSpecial ? null : input.teamId;
    if (input.id) {
      const emp = store.employees.find((e) => e.id === input.id);
      if (emp) {
        emp.firstName = input.firstName.trim();
        emp.lastName = input.lastName.trim();
        emp.phone = input.phone.trim();
        emp.positionId = input.positionId;
        emp.teamId = resolvedTeamId;
      }
    } else {
      const nextId =
        store.employees.reduce((m, e) => Math.max(m, e.id), 0) + 1;
      store.employees.push({
        id: nextId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone.trim(),
        positionId: input.positionId,
        teamId: resolvedTeamId,
        active: true,
      });
    }
  });
  revalidatePath("/");
}

export async function removeEmployeeAction(employeeId: number): Promise<void> {
  await requireAdmin();
  await mutateStore((store) => {
    const emp = store.employees.find((e) => e.id === employeeId);
    if (emp) emp.active = false;
  });
  revalidatePath("/");
}
