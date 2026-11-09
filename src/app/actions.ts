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
  let createdVersion = 1;
  await mutateStore((store) => {
    const nextPlanId =
      store.masterPlans.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const nextVersion =
      store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) + 1;
    createdVersion = nextVersion;

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
  });
  revalidatePath("/");
  return { version: createdVersion };
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
