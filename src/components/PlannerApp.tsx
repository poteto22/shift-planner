"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  calcShiftHours,
  getShiftColorMeta,
  groupConsecutiveCells,
  SHIFT_COLORS,
  type FairnessPeriod,
  type OverrideMode,
  type PlannerStoreData,
  type ResolvedShiftBadge,
  type ResolvedWeek,
  type ShiftKind,
} from "@/lib/schedule";
import {
  addTeamAction,
  assignSpecialSlotAction,
  autoRotateWeekAction,
  clearWeekSpecialAssignmentsAction,
  deleteOverrideAction,
  loginAdminAction,
  logoutAdminAction,
  moveTeamOrderAction,
  removeEmployeeAction,
  saveEmployeeAction,
  saveMasterPlanAction,
  saveOverrideAction,
  saveShiftTypeAction,
  toggleTeamActiveAction,
} from "@/app/actions";

const THAI_MONTHS_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const THAI_DAYS_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function formatThaiDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${THAI_MONTHS_SHORT[(m || 1) - 1]} ${y}`;
}

function formatThaiWeekRange(weekStart: string, weekEnd: string): string {
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  if (sy === ey && sm === em) {
    return `อา. ${sd} – ส. ${ed} ${THAI_MONTHS_SHORT[sm - 1]} ${sy}`;
  }
  return `อา. ${sd} ${THAI_MONTHS_SHORT[sm - 1]} – ส. ${ed} ${THAI_MONTHS_SHORT[em - 1]} ${ey}`;
}

function ShiftChip({
  shift,
  extraClass = "",
  spanDays = 1,
}: {
  shift: ResolvedShiftBadge | null;
  extraClass?: string;
  spanDays?: number;
}) {
  if (!shift) {
    return <span className="dim text-xs">— หยุด</span>;
  }
  const colorClass = `c-${shift.color}`;
  const odClass = shift.isOverdrive ? "od-badge" : "";
  const hex = getShiftColorMeta(shift.color).hex;
  return (
    <span
      className={`chip ${colorClass} ${odClass} ${extraClass}`}
      style={{
        borderLeftColor: hex,
        background: `linear-gradient(90deg, ${hex}2e 0%, ${hex}16 100%)`,
        borderTop: `1px solid ${hex}45`,
        borderRight: `1px solid ${hex}45`,
        borderBottom: `1px solid ${hex}45`,
      }}
      title={shift.reason ? `Overdrive: ${shift.reason}` : undefined}
    >
      <span className="flex items-center justify-between gap-2 flex-wrap">
        <span>
          <b className="font-semibold">{shift.name}</b>{" "}
          <span className="mono text-xs">
            {shift.startTime}–{shift.endTime}
          </span>
        </span>
        {spanDays > 1 && (
          <span
            className="mono text-[11px] px-1.5 py-0.5 rounded font-medium"
            style={{
              background: `${hex}33`,
              color: "var(--ink)",
            }}
          >
            {spanDays} วันติดกัน
          </span>
        )}
      </span>
      {shift.reason && (
        <span className="block text-xs dim truncate">{shift.reason}</span>
      )}
    </span>
  );
}

interface PlannerAppProps {
  store: PlannerStoreData;
  resolvedWeek: ResolvedWeek;
  todayIso: string;
  isAdmin: boolean;
}

type TabKey = "dash" | "master" | "od" | "shifts" | "people" | "history";

export default function PlannerApp({
  store,
  resolvedWeek,
  todayIso,
  isAdmin,
}: PlannerAppProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<TabKey>("dash");
  const [clockText, setClockText] = useState<string>("");

  // Roster sidebar state ("CAM3" or teamId number)
  const [selectedRosterKey, setSelectedRosterKey] = useState<number | "CAM3">(
    resolvedWeek.teamRows[0]?.team.id ?? "CAM3"
  );

  // Picked special slot for drag & drop / click-to-assign
  const [pickedSlot, setPickedSlot] = useState<{
    slotId: number;
    dayOfWeek: number;
    workDate: string;
  } | null>(null);
  const [dragHoverKey, setDragHoverKey] = useState<string | null>(null);

  // Admin Login Modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUser, setLoginUser] = useState("admin");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  const cam3Employees = store.employees
    .filter((e) => {
      if (!e.active) return false;
      const pos = store.positions.find((p) => p.id === e.positionId);
      return Boolean(pos?.isSpecial || e.teamId === null);
    })
    .sort((a, b) => a.id - b.id);

  function buildMpGridFromPlan(plan: typeof store.masterPlans[number] | undefined) {
    const init: Record<string, number> = {};
    if (!plan) return init;
    for (const e of plan.entries) {
      if (e.isCam3) {
        if (e.employeeId != null) {
          init[`CAM3_${e.employeeId}-${e.dayOfWeek}`] = e.shiftTypeId;
        } else {
          for (const emp of cam3Employees) {
            init[`CAM3_${emp.id}-${e.dayOfWeek}`] = e.shiftTypeId;
          }
        }
      } else {
        init[`T${e.teamId}-${e.dayOfWeek}`] = e.shiftTypeId;
      }
    }
    return init;
  }

  // Master-plan editor state
  const latestPlan =
    store.masterPlans[store.masterPlans.length - 1] ?? store.masterPlans[0];
  const [mpEffectiveFrom, setMpEffectiveFrom] = useState<string>(
    addDays(resolvedWeek.weekStart, 7)
  );
  const [mpNote, setMpNote] = useState<string>("");
  const [mpGrid, setMpGrid] = useState<Record<string, number>>(() =>
    buildMpGridFromPlan(latestPlan)
  );
  const [mpSpecialSlots, setMpSpecialSlots] = useState<
    Array<{ dayOfWeek: number; shiftTypeId: number }>
  >(() =>
    latestPlan
      ? latestPlan.specialSlots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          shiftTypeId: s.shiftTypeId,
        }))
      : []
  );

  // Overdrive form state
  const [odDate, setOdDate] = useState<string>(todayIso);
  const [odTarget, setOdTarget] = useState<string>(
    String(resolvedWeek.teamRows[0]?.team.id ?? "1")
  );
  const [odMode, setOdMode] = useState<OverrideMode>("REPLACE");
  const [odShiftId, setOdShiftId] = useState<string>(
    String(store.shiftTypes[0]?.id ?? "1")
  );
  const [odCustomStart, setOdCustomStart] = useState<string>("10:00");
  const [odCustomEnd, setOdCustomEnd] = useState<string>("19:00");
  const [odReason, setOdReason] = useState<string>("");

  // Shift template form state
  const [shCode, setShCode] = useState("");
  const [shName, setShName] = useState("");
  const [shStart, setShStart] = useState("08:00");
  const [shEnd, setShEnd] = useState("17:00");
  const [shKind, setShKind] = useState<ShiftKind>("NORMAL");
  const [shColor, setShColor] = useState("am");

  // Team & Employee form state
  const [newTeamName, setNewTeamName] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [empFirstName, setEmpFirstName] = useState("");
  const [empLastName, setEmpLastName] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empPositionId, setEmpPositionId] = useState<number>(
    store.positions[0]?.id ?? 1
  );
  const [empTeamId, setEmpTeamId] = useState<number>(
    store.teams[0]?.id ?? 1
  );

  // History viewer state
  const [selectedSnapshotWeek, setSelectedSnapshotWeek] = useState<string | null>(
    store.snapshots[0]?.weekStart ?? null
  );

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setClockText(
        new Intl.DateTimeFormat("th-TH", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now)
      );
    };
    updateClock();
    const id = setInterval(updateClock, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isAdmin && activeTab !== "dash") {
      setActiveTab("dash");
    }
  }, [isAdmin, activeTab]);

  function navigateWeek(nextWeekStart: string, nextPeriod?: FairnessPeriod) {
    const p = nextPeriod ?? resolvedWeek.fairness.periodMonths;
    router.push(`/?week=${nextWeekStart}&period=${p}`);
  }

  function handleExportPdf() {
    const prevTitle = document.title;
    document.title = `ตารางกะสตูดิโอ_${resolvedWeek.weekStart}_ถึง_${resolvedWeek.weekEnd}`;
    window.print();
    document.title = prevTitle;
  }

  function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    startTransition(async () => {
      const res = await loginAdminAction(loginUser, loginPass);
      if (!res.ok) {
        setLoginError(res.error || "เข้าสู่ระบบไม่สำเร็จ");
      } else {
        setShowLoginModal(false);
        setLoginPass("");
        router.refresh();
      }
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAdminAction();
      setActiveTab("dash");
      router.refresh();
    });
  }

  function handleAssignSpecial(
    slotId: number,
    workDate: string,
    teamId: number | null
  ) {
    if (!isAdmin) return;
    setPickedSlot(null);
    setDragHoverKey(null);
    startTransition(async () => {
      await assignSpecialSlotAction(slotId, workDate, teamId);
      router.refresh();
    });
  }

  function handleAutoRotate() {
    if (!isAdmin) return;
    startTransition(async () => {
      await autoRotateWeekAction(
        resolvedWeek.weekStart,
        resolvedWeek.fairness.periodMonths
      );
      router.refresh();
    });
  }

  function handleClearWeekAssignments() {
    if (!isAdmin) return;
    startTransition(async () => {
      await clearWeekSpecialAssignmentsAction(resolvedWeek.weekStart);
      router.refresh();
    });
  }

  function loadPlanIntoEditor(planId: number) {
    const p = store.masterPlans.find((x) => x.id === planId);
    if (!p) return;
    setMpGrid(buildMpGridFromPlan(p));
    setMpSpecialSlots(
      p.specialSlots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        shiftTypeId: s.shiftTypeId,
      }))
    );
  }

  function handleSaveMasterPlan(e: React.FormEvent) {
    e.preventDefault();
    const entries: Array<{
      dayOfWeek: number;
      teamId: number | null;
      isCam3: boolean;
      employeeId?: number | null;
      shiftTypeId: number;
    }> = [];
    for (const [key, shiftTypeId] of Object.entries(mpGrid)) {
      if (!shiftTypeId) continue;
      if (key.startsWith("CAM3_")) {
        const [empPart, dowPart] = key.replace("CAM3_", "").split("-");
        entries.push({
          dayOfWeek: Number(dowPart),
          teamId: null,
          isCam3: true,
          employeeId: Number(empPart),
          shiftTypeId,
        });
      } else if (key.startsWith("CAM3-")) {
        const dow = Number(key.replace("CAM3-", ""));
        entries.push({ dayOfWeek: dow, teamId: null, isCam3: true, shiftTypeId });
      } else if (key.startsWith("T")) {
        const [tPart, dowPart] = key.slice(1).split("-");
        entries.push({
          dayOfWeek: Number(dowPart),
          teamId: Number(tPart),
          isCam3: false,
          shiftTypeId,
        });
      }
    }
    startTransition(async () => {
      await saveMasterPlanAction({
        effectiveFrom: mpEffectiveFrom,
        note: mpNote,
        entries,
        specialSlots: mpSpecialSlots,
      });
      setMpNote("");
      router.refresh();
    });
  }

  function handleSaveOverride(e: React.FormEvent) {
    e.preventDefault();
    const useCustom = odShiftId === "CUSTOM";
    startTransition(async () => {
      await saveOverrideAction({
        workDate: odDate,
        target: odTarget,
        mode: odMode,
        shiftTypeId:
          odMode === "OFF" || useCustom ? null : Number(odShiftId),
        customStart: odMode !== "OFF" && useCustom ? odCustomStart : null,
        customEnd: odMode !== "OFF" && useCustom ? odCustomEnd : null,
        reason: odReason,
      });
      setOdReason("");
      router.refresh();
    });
  }

  const selectedTeamRow =
    selectedRosterKey === "CAM3"
      ? null
      : resolvedWeek.teamRows.find((r) => r.team.id === selectedRosterKey) ??
        resolvedWeek.teamRows[0] ??
        null;

  const minFairnessTotal =
    resolvedWeek.fairness.stats.length > 0
      ? Math.min(
          ...resolvedWeek.fairness.stats.map(
            (s) => s.doneUpToToday + s.plannedAfterToday
          )
        )
      : 0;

  return (
    <div className="print-container max-w-[1320px] mx-auto px-4 sm:px-6 py-5">
      {/* Top Broadcast Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-full tally-pulse"
            style={{ background: "var(--tally)" }}
          />
          <div>
            <h1 className="text-lg font-semibold tracking-wide">
              ตารางกะสตูดิโอสถานีโทรทัศน์
            </h1>
            <p className="dim text-xs">
              เริ่มสัปดาห์วันอาทิตย์ · กะปกติ 5 วัน + กะพิเศษหมุนเวียน (วันที่ 6)
            </p>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-3">
          <div className="mono text-sm dim">
            วันนี้ {formatThaiDateShort(todayIso)} ·{" "}
            <span style={{ color: "var(--ink)" }}>{clockText || "—"}</span> ICT
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-2.5 py-1 rounded-md font-semibold"
                style={{
                  background: "rgba(255,59,48,0.16)",
                  color: "var(--tally)",
                  border: "1px solid var(--tally)",
                }}
              >
                โหมด Admin (แก้ไขได้)
              </span>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={handleLogout}
              >
                ออกจากระบบ
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="dim text-xs">มุมมองพนักงาน (อ่านอย่างเดียว)</span>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setShowLoginModal(true)}
              >
                เข้าสู่ระบบ Admin
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Admin Navigation Tabs (Hidden for regular employees who only view schedule) */}
      {isAdmin && (
        <nav
          className="no-print flex gap-5 border-b mb-5 overflow-x-auto"
          style={{ borderColor: "var(--line)" }}
          role="tablist"
        >
          {(
            [
              ["dash", "ตารางประจำสัปดาห์"],
              ["master", "Master-plan"],
              ["od", "Overdrive"],
              ["shifts", "รูปแบบกะ"],
              ["people", "พนักงานและทีม"],
              ["history", "ย้อนหลัง"],
            ] as Array<[TabKey, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className="tab pb-2.5 text-sm whitespace-nowrap cursor-pointer"
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* ==================== 1. WEEKLY SCHEDULE DASHBOARD ==================== */}
      {activeTab === "dash" && (
        <section>
          {/* Week Switcher & Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="no-print btn-ghost"
                aria-label="สัปดาห์ก่อน"
                onClick={() =>
                  navigateWeek(addDays(resolvedWeek.weekStart, -7))
                }
              >
                ‹
              </button>
              <div className="mono text-sm px-2 font-medium">
                {formatThaiWeekRange(
                  resolvedWeek.weekStart,
                  resolvedWeek.weekEnd
                )}
              </div>
              <button
                type="button"
                className="no-print btn-ghost"
                aria-label="สัปดาห์ถัดไป"
                onClick={() => navigateWeek(addDays(resolvedWeek.weekStart, 7))}
              >
                ›
              </button>
              <button
                type="button"
                className="no-print btn-ghost ml-1 text-xs"
                onClick={() => navigateWeek(todayIso)}
              >
                สัปดาห์นี้
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className="no-print btn ml-1 text-xs"
                  onClick={handleExportPdf}
                >
                  Export PDF
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs dim">
              <span>
                ใช้แผน{" "}
                {resolvedWeek.planVersionsUsed.map((p, idx) => (
                  <React.Fragment key={p.version}>
                    {idx > 0 && " → "}
                    <b style={{ color: "var(--ink)" }}>
                      Master-plan v{p.version}
                    </b>{" "}
                    (เริ่ม {formatThaiDateShort(p.effectiveFrom)})
                  </React.Fragment>
                ))}
              </span>
              {store.shiftTypes
                .filter((s) => s.active && s.kind === "NORMAL")
                .map((s) => (
                  <span key={s.id} className="flex items-center gap-1">
                    <i
                      className="inline-block w-2.5 h-2.5 rounded-xs"
                      style={{ background: getShiftColorMeta(s.color).hex }}
                    />
                    {s.name}
                  </span>
                ))}
              <span className="flex items-center gap-1">
                <i
                  className="inline-block w-2.5 h-2.5 rounded-xs"
                  style={{ background: "var(--tally)" }}
                />
                กะพิเศษ (วันที่ 6)
              </span>
              <span>
                <b style={{ color: "var(--tally)" }}>OD</b> = Overdrive
              </span>
            </div>
          </div>

          {/* 6th-Day Fairness Bar (3 months / 6 months / Full year up to today only) */}
          <div className="no-print panel p-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div>
              <b style={{ color: "var(--tally)" }}>กะพิเศษ (วันที่ 6)</b>{" "}
              <span className="dim">
                · รอจัดทีม{" "}
                <b className="mono" style={{ color: "var(--ink)" }}>
                  {resolvedWeek.unassignedSpecialCount}
                </b>{" "}
                กะ
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="dim">ยอดสะสมวันที่ 6 (นับถึงวันนี้):</span>
              <div
                className="flex rounded-md overflow-hidden border"
                style={{ borderColor: "var(--line)" }}
                role="group"
                aria-label="ช่วงเวลาสะสมวันที่ 6"
              >
                {([3, 6, 12] as FairnessPeriod[]).map((m) => {
                  const selected = resolvedWeek.fairness.periodMonths === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => navigateWeek(resolvedWeek.weekStart, m)}
                      className="px-2.5 py-1 cursor-pointer"
                      style={{
                        background: selected ? "var(--ink)" : "transparent",
                        color: selected ? "var(--bg)" : "var(--dim)",
                        fontWeight: selected ? 600 : 400,
                      }}
                    >
                      {m === 12 ? "ทั้งปี" : `${m} เดือน`}
                    </button>
                  );
                })}
              </div>

              <span className="mono dim">
                ({formatThaiDateShort(resolvedWeek.fairness.rangeStart)} –{" "}
                {formatThaiDateShort(resolvedWeek.fairness.rangeEnd)})
              </span>

              <div className="flex flex-wrap items-center gap-3">
                {resolvedWeek.fairness.stats.map((st) => {
                  const isLowest =
                    st.doneUpToToday + st.plannedAfterToday === minFairnessTotal;
                  return (
                    <span key={st.teamId} className="dim">
                      ทีม {st.teamName}{" "}
                      <b
                        className="mono"
                        style={{
                          color: isLowest ? "var(--ok)" : "var(--ink)",
                        }}
                      >
                        {st.doneUpToToday}
                      </b>
                      {st.plannedAfterToday > 0 && (
                        <span
                          className="mono"
                          style={{ color: "var(--am)" }}
                          title="มอบหมายไว้ล่วงหน้า (ยังไม่ถึงวันทำงาน)"
                        >
                          {" "}
                          +{st.plannedAfterToday}
                        </span>
                      )}
                    </span>
                  );
                })}
                <span className="dim">
                  (<span style={{ color: "var(--am)" }}>+n</span> = รอถึงวัน)
                </span>
              </div>
            </div>

            {isAdmin && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={isPending}
                  onClick={handleClearWeekAssignments}
                >
                  ล้างการมอบหมายสัปดาห์นี้
                </button>
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={
                    isPending || resolvedWeek.unassignedSpecialCount === 0
                  }
                  onClick={handleAutoRotate}
                >
                  จัดหมุนเวียนอัตโนมัติ
                </button>
              </div>
            )}
          </div>

          {/* Schedule Grid + Roster Sidebar */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="panel overflow-x-auto flex-1">
              <table className="schedule-grid w-full min-w-[920px] text-sm">
                <thead>
                  <tr>
                    <th className="p-2.5 text-left w-[130px] dim font-normal">
                      ทีม / แถว
                    </th>
                    {resolvedWeek.days.map((d) => {
                      const isToday = d.date === todayIso;
                      return (
                        <th
                          key={d.date}
                          className={`p-2.5 text-left font-normal ${
                            isToday ? "today-cell today-head" : ""
                          }`}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className={isToday ? "font-semibold" : "dim"}>
                              {d.labelShort}
                            </span>
                            <span className="mono text-xs">{d.dayNum}</span>
                          </div>
                          {resolvedWeek.planVersionsUsed.length > 1 && (
                            <div className="mono text-xs dim">
                              แผน v{d.planVersion}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th className="p-2.5 dim font-normal text-center w-[58px]">
                      วัน
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* Team Rows (A–E and any added active teams) */}
                  {resolvedWeek.teamRows.map((row) => {
                    const isRosterSelected =
                      selectedRosterKey === row.team.id;
                    return (
                      <tr key={row.team.id}>
                        <td className="p-2.5 align-top">
                          <button
                            type="button"
                            onClick={() => setSelectedRosterKey(row.team.id)}
                            className={`font-semibold hover:underline text-left cursor-pointer ${
                              isRosterSelected ? "underline" : ""
                            }`}
                          >
                            ทีม {row.team.name}
                          </button>
                          <div className="dim text-xs truncate max-w-[115px]">
                            {row.leadName.split(" ")[0]}
                          </div>
                        </td>

                        {groupConsecutiveCells(row.cells).map((group) => {
                          const firstCell = group.cells[0];
                          const hasToday = group.cells.some(
                            (c) => c.workDate === todayIso
                          );
                          const targetDropCell =
                            isAdmin && pickedSlot !== null
                              ? group.cells.find(
                                  (c) => c.dayOfWeek === pickedSlot.dayOfWeek
                                ) ?? null
                              : null;
                          const canDropHere = targetDropCell !== null;
                          const dropClass = canDropHere
                            ? targetDropCell.isWorkingRegularOrReplaced
                              ? "drop-warn"
                              : "drop-ok"
                            : "";
                          const cellKey = `${row.team.id}-${firstCell.dayOfWeek}`;
                          const hoverClass =
                            dragHoverKey === cellKey ? "drop-hover" : "";
                          const hasPerDayExtras = group.cells.some(
                            (c) =>
                              c.addedShifts.length > 0 ||
                              c.specialSlots.length > 0
                          );

                          return (
                            <td
                              key={firstCell.workDate}
                              colSpan={group.span}
                              onDragOver={(e) => {
                                if (canDropHere) {
                                  e.preventDefault();
                                  setDragHoverKey(cellKey);
                                }
                              }}
                              onDragLeave={() => {
                                if (dragHoverKey === cellKey) {
                                  setDragHoverKey(null);
                                }
                              }}
                              onDrop={(e) => {
                                if (canDropHere && pickedSlot) {
                                  e.preventDefault();
                                  handleAssignSpecial(
                                    pickedSlot.slotId,
                                    pickedSlot.workDate,
                                    row.team.id
                                  );
                                }
                              }}
                              onClick={() => {
                                if (canDropHere && pickedSlot) {
                                  handleAssignSpecial(
                                    pickedSlot.slotId,
                                    pickedSlot.workDate,
                                    row.team.id
                                  );
                                }
                              }}
                              className={`p-1.5 align-top space-y-1 ${
                                hasToday ? "today-cell" : ""
                              } ${dropClass} ${hoverClass} ${
                                canDropHere ? "cursor-pointer" : ""
                              }`}
                            >
                              {firstCell.wasOffByOverride ? (
                                <span
                                  className="chip od-badge dim"
                                  style={{ borderColor: "var(--line)" }}
                                  title={firstCell.overrideReason}
                                >
                                  <b>หยุด (Overdrive)</b>
                                  {firstCell.overrideReason && (
                                    <span className="block text-xs truncate">
                                      {firstCell.overrideReason}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <ShiftChip
                                  shift={firstCell.baseShift}
                                  spanDays={group.span}
                                />
                              )}

                              {hasPerDayExtras && (
                                <div
                                  className={
                                    group.span > 1 ? "grid gap-1.5" : "space-y-1"
                                  }
                                  style={
                                    group.span > 1
                                      ? {
                                          gridTemplateColumns: `repeat(${group.span}, minmax(0, 1fr))`,
                                        }
                                      : undefined
                                  }
                                >
                                  {group.cells.map((cell) => (
                                    <div key={cell.workDate} className="space-y-1">
                                      {cell.addedShifts.map((added, idx) => (
                                        <ShiftChip key={idx} shift={added} />
                                      ))}

                                      {cell.specialSlots.map((sp) => (
                                        <span
                                          key={sp.slotId}
                                          draggable={isAdmin}
                                          onDragStart={() =>
                                            isAdmin &&
                                            setPickedSlot({
                                              slotId: sp.slotId,
                                              dayOfWeek: sp.dayOfWeek,
                                              workDate: sp.workDate,
                                            })
                                          }
                                          onDragEnd={() => {
                                            setPickedSlot(null);
                                            setDragHoverKey(null);
                                          }}
                                          onClick={(e) => {
                                            if (!isAdmin) return;
                                            e.stopPropagation();
                                            setPickedSlot(
                                              pickedSlot?.slotId === sp.slotId
                                                ? null
                                                : {
                                                    slotId: sp.slotId,
                                                    dayOfWeek: sp.dayOfWeek,
                                                    workDate: sp.workDate,
                                                  }
                                            );
                                          }}
                                          aria-pressed={
                                            pickedSlot?.slotId === sp.slotId
                                          }
                                          className={`chip c-${
                                            sp.shift.color || "sp"
                                          } ${isAdmin ? "drag-chip" : ""}`}
                                        >
                                          {isAdmin && (
                                            <button
                                              type="button"
                                              aria-label="ยกเลิกการมอบหมาย"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleAssignSpecial(
                                                  sp.slotId,
                                                  sp.workDate,
                                                  null
                                                );
                                              }}
                                              className="no-print float-right dim px-1 hover:text-white cursor-pointer"
                                            >
                                              ×
                                            </button>
                                          )}
                                          <b>{sp.shift.name}</b>{" "}
                                          <span className="mono text-xs">
                                            {sp.shift.startTime}–
                                            {sp.shift.endTime}
                                          </span>
                                          {(sp.overlapWarning ||
                                            sp.multipleSpecialWarning) && (
                                            <span
                                              className="block text-xs"
                                              style={{ color: "var(--am)" }}
                                            >
                                              {sp.overlapWarning
                                                ? "⚠ ซ้อนกะปกติ"
                                                : "⚠ กะพิเศษ 2 ครั้ง"}
                                            </span>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td
                          className="p-2 text-center mono font-semibold"
                          style={{
                            color:
                              row.totalWorkDays === 6
                                ? "var(--tally)"
                                : row.totalWorkDays === 5
                                ? "var(--dim)"
                                : "var(--am)",
                          }}
                        >
                          {row.totalWorkDays}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Dedicated CAM3 Rows (per individual CAM3 employee) */}
                  {resolvedWeek.cam3Rows.map((cRow) => (
                    <tr key={`cam3-${cRow.employee.id}`}>
                      <td className="p-2.5 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedRosterKey("CAM3")}
                          className={`font-semibold hover:underline text-left cursor-pointer ${
                            selectedRosterKey === "CAM3" ? "underline" : ""
                          }`}
                        >
                          {cRow.employee.firstName} {cRow.employee.lastName}
                        </button>
                        <div className="dim text-xs">
                          CAM3 · <span className="mono">{cRow.employee.phone}</span>
                        </div>
                      </td>
                      {groupConsecutiveCells(cRow.cells).map((group) => {
                        const firstCell = group.cells[0];
                        const hasToday = group.cells.some(
                          (c) => c.workDate === todayIso
                        );
                        const hasAdded = group.cells.some(
                          (c) => c.addedShifts.length > 0
                        );
                        return (
                          <td
                            key={firstCell.workDate}
                            colSpan={group.span}
                            className={`p-1.5 align-top space-y-1 ${
                              hasToday ? "today-cell" : ""
                            }`}
                          >
                            {firstCell.wasOffByOverride ? (
                              <span
                                className="chip od-badge dim"
                                style={{ borderColor: "var(--line)" }}
                                title={firstCell.overrideReason}
                              >
                                <b>หยุด (Overdrive)</b>
                                {firstCell.overrideReason && (
                                  <span className="block text-xs truncate">
                                    {firstCell.overrideReason}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <ShiftChip
                                shift={firstCell.baseShift}
                                spanDays={group.span}
                              />
                            )}
                            {hasAdded && (
                              <div
                                className={
                                  group.span > 1 ? "grid gap-1.5" : "space-y-1"
                                }
                                style={
                                  group.span > 1
                                    ? {
                                        gridTemplateColumns: `repeat(${group.span}, minmax(0, 1fr))`,
                                      }
                                    : undefined
                                }
                              >
                                {group.cells.map((cell) => (
                                  <div key={cell.workDate} className="space-y-1">
                                    {cell.addedShifts.map((added, idx) => (
                                      <ShiftChip key={idx} shift={added} />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td
                        className="p-2 text-center mono font-semibold"
                        style={{
                          color:
                            cRow.totalWorkDays === 6
                              ? "var(--tally)"
                              : cRow.totalWorkDays === 5
                              ? "var(--dim)"
                              : "var(--am)",
                        }}
                      >
                        {cRow.totalWorkDays}
                      </td>
                    </tr>
                  ))}

                  {/* Special Shift Row (2 recurring special shifts per week from Master-plan) */}
                  <tr>
                    <td
                      className="p-2.5 align-top"
                      style={{ color: "var(--tally)" }}
                    >
                      <b>กะพิเศษ</b>
                      <div className="dim text-xs">
                        {isAdmin ? "ลากวาง / เลือกทีม" : "วันที่ 6 หมุนเวียน"}
                      </div>
                    </td>
                    {resolvedWeek.specialSlotsByDay.map((slots, dow) => {
                      const d = resolvedWeek.days[dow];
                      const isToday = d.date === todayIso;
                      return (
                        <td
                          key={d.date}
                          className={`p-1.5 align-top space-y-1.5 ${
                            isToday ? "today-cell" : ""
                          }`}
                        >
                          {slots.map((sp) => {
                            const isPicked = pickedSlot?.slotId === sp.slotId;
                            return (
                              <div key={sp.slotId} className="space-y-1">
                                {sp.assignedTeamId ? (
                                  <div className="text-xs dim">
                                    <span>{sp.shift.name}</span> →{" "}
                                    <b style={{ color: "var(--ink)" }}>
                                      ทีม {sp.assignedTeamName}
                                    </b>
                                  </div>
                                ) : (
                                  <span
                                    draggable={isAdmin}
                                    onDragStart={() =>
                                      isAdmin &&
                                      setPickedSlot({
                                        slotId: sp.slotId,
                                        dayOfWeek: sp.dayOfWeek,
                                        workDate: sp.workDate,
                                      })
                                    }
                                    onDragEnd={() => {
                                      setPickedSlot(null);
                                      setDragHoverKey(null);
                                    }}
                                    onClick={() =>
                                      isAdmin &&
                                      setPickedSlot(
                                        isPicked
                                          ? null
                                          : {
                                              slotId: sp.slotId,
                                              dayOfWeek: sp.dayOfWeek,
                                              workDate: sp.workDate,
                                            }
                                      )
                                    }
                                    aria-pressed={isPicked}
                                    className={`chip c-${sp.shift.color || "sp"} ${
                                      isAdmin ? "drag-chip" : ""
                                    }`}
                                  >
                                    <b>{sp.shift.name}</b>{" "}
                                    <span className="mono text-xs">
                                      {sp.shift.startTime}–{sp.shift.endTime}
                                    </span>
                                    <span className="block text-xs dim">
                                      {isAdmin
                                        ? "ลากไปวางที่ทีม หรือเลือกด้านล่าง"
                                        : "รอจัดทีม"}
                                    </span>
                                  </span>
                                )}

                                {isAdmin && (
                                  <select
                                    aria-label={`เลือกทีมสำหรับ ${sp.shift.name}`}
                                    value={sp.assignedTeamId ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleAssignSpecial(
                                        sp.slotId,
                                        sp.workDate,
                                        val ? Number(val) : null
                                      );
                                    }}
                                    className="no-print field w-full text-xs py-1"
                                  >
                                    <option value="">— เลือกทีม —</option>
                                    {resolvedWeek.teamRows.map((tr) => {
                                      const isOff =
                                        !tr.cells[dow]
                                          .isWorkingRegularOrReplaced;
                                      return (
                                        <option
                                          key={tr.team.id}
                                          value={tr.team.id}
                                        >
                                          ทีม {tr.team.name}{" "}
                                          {isOff ? "(หยุดวันนี้)" : "(มีกะปกติ)"}
                                        </option>
                                      );
                                    })}
                                  </select>
                                )}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                    <td className="p-2" />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Team / CAM3 Roster Sidebar */}
            <aside className="no-print panel p-4 lg:w-[290px] shrink-0">
              {selectedRosterKey === "CAM3" ? (
                <div>
                  <div className="flex justify-between items-baseline mb-3">
                    <h2 className="font-semibold">ตำแหน่งพิเศษ CAM3</h2>
                    <span className="dim text-xs">ไม่สังกัดทีม A–E</span>
                  </div>
                  <ul className="space-y-2.5 text-sm">
                    {resolvedWeek.cam3Rows.map((cRow) => (
                      <li
                        key={cRow.employee.id}
                        className="p-2 rounded-md"
                        style={{ background: "var(--panel2)" }}
                      >
                        <div className="flex justify-between items-center text-xs dim">
                          <span>CAM3 (รายบุคคล)</span>
                          <span>สัปดาห์นี้ {cRow.totalWorkDays} วัน</span>
                        </div>
                        <div className="flex justify-between items-center mt-0.5">
                          <span className="font-medium">
                            {cRow.employee.firstName} {cRow.employee.lastName}
                          </span>
                          <span className="mono dim text-xs">
                            {cRow.employee.phone}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : selectedTeamRow ? (
                <div>
                  <div className="flex justify-between items-baseline mb-3">
                    <h2 className="font-semibold">
                      สมาชิกทีม {selectedTeamRow.team.name}
                    </h2>
                    <span className="dim text-xs">
                      สัปดาห์นี้ {selectedTeamRow.totalWorkDays} วัน
                    </span>
                  </div>
                  <ul className="space-y-2.5 text-sm">
                    {store.positions
                      .filter((p) => !p.isSpecial)
                      .map((pos) => {
                        const matched = selectedTeamRow.members.filter(
                          (m) => m.position.id === pos.id
                        );
                        return (
                          <li key={pos.id}>
                            <div className="dim text-xs">
                              {pos.name}
                              {pos.isLead ? " · หัวหน้าทีม" : ""}
                            </div>
                            {matched.length > 0 ? (
                              matched.map((m) => (
                                <div
                                  key={m.employee.id}
                                  className="flex justify-between items-center"
                                >
                                  <span
                                    className={
                                      pos.isLead ? "font-semibold" : ""
                                    }
                                  >
                                    {m.employee.firstName} {m.employee.lastName}
                                  </span>
                                  <span className="mono dim text-xs">
                                    {m.employee.phone}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="dim text-xs">ยังไม่ระบุ</div>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>

          <p className="no-print dim text-xs mt-2">
            {isAdmin ? (
              <>
                <b>วิธีมอบหมายกะพิเศษ (วันที่ 6):</b> ลากกะพิเศษไปวางที่ช่องของทีม
                หรือคลิกที่กะแล้วคลิกช่องของทีม หรือเลือกจาก dropdown ในแถวล่าง ·{" "}
                <span style={{ color: "var(--ok)" }}>กรอบเขียว</span> = ทีมหยุดวันนั้น
                (ทำเป็นวันที่ 6 ได้พอดี) ·{" "}
                <span style={{ color: "var(--am)" }}>กรอบเหลือง</span> = ทีมมีกะปกติอยู่แล้ว
              </>
            ) : (
              <>
                คลิกชื่อ <b>ทีม A–E</b> หรือ <b>CAM3</b> ในคอลัมน์ซ้ายเพื่อดูรายชื่อสมาชิกและเบอร์โทรศัพท์ติดต่อ
              </>
            )}
          </p>

          {/* Compact Roster Summary for A4 Landscape Print / PDF Export */}
          <div className="print-only mt-3 pt-2 border-t" style={{ borderColor: "var(--line)" }}>
            <div className="grid grid-cols-6 gap-2 text-[10px]">
              {resolvedWeek.teamRows.map((tr) => (
                <div key={tr.team.id} className="p-1.5 rounded border" style={{ borderColor: "var(--line)" }}>
                  <div className="font-semibold mb-1">
                    ทีม {tr.team.name} ({tr.totalWorkDays} วัน)
                  </div>
                  {tr.members.map((m) => (
                    <div key={m.employee.id} className="flex justify-between gap-1 truncate">
                      <span>
                        {m.employee.firstName} {m.employee.lastName}
                      </span>
                      <span className="mono dim">{m.employee.phone}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="p-1.5 rounded border" style={{ borderColor: "var(--line)" }}>
                <div className="font-semibold mb-1">CAM3 (ตำแหน่งพิเศษ)</div>
                {resolvedWeek.cam3Rows.map((cRow) => (
                  <div key={cRow.employee.id} className="flex justify-between gap-1 truncate">
                    <span>
                      {cRow.employee.firstName} {cRow.employee.lastName} ({cRow.totalWorkDays} วัน)
                    </span>
                    <span className="mono dim">{cRow.employee.phone}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ==================== 2. MASTER-PLAN (ADMIN) ==================== */}
      {isAdmin && activeTab === "master" && (
        <section className="grid lg:grid-cols-[280px_1fr] gap-4">
          <div className="panel p-4">
            <h2 className="font-semibold mb-3">เวอร์ชันของ Master-plan</h2>
            <p className="dim text-xs mb-3">
              แผนที่ระบุวันเริ่มใช้แล้วจะมีผลต่อเนื่องในสัปดาห์ต่อๆ ไปจนกว่าจะมีแผนเวอร์ชันใหม่
              (รองรับการเริ่มใช้กลางสัปดาห์)
            </p>
            <ol className="space-y-2 text-sm">
              {[...store.masterPlans]
                .sort((a, b) => b.version - a.version)
                .map((p) => {
                  const isFuture = p.effectiveFrom > todayIso;
                  return (
                    <li
                      key={p.id}
                      onClick={() => loadPlanIntoEditor(p.id)}
                      className="p-3 rounded-md cursor-pointer"
                      style={{ background: "var(--panel2)" }}
                    >
                      <div className="flex justify-between items-center">
                        <b>Master-plan v{p.version}</b>
                        <span
                          className="text-xs"
                          style={{
                            color: isFuture ? "var(--am)" : "var(--ok)",
                          }}
                        >
                          {isFuture ? "รอเริ่มใช้" : "เริ่มใช้แล้ว"}
                        </span>
                      </div>
                      <div className="mono dim text-xs mt-1">
                        เริ่ม {formatThaiDateShort(p.effectiveFrom)}
                      </div>
                      {p.note && (
                        <div className="dim text-xs mt-1">{p.note}</div>
                      )}
                    </li>
                  );
                })}
            </ol>
          </div>

          <form onSubmit={handleSaveMasterPlan} className="panel p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  สร้าง Master-plan เวอร์ชันใหม่ (v
                  {store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) +
                    1}
                  )
                </h2>
                <p className="dim text-xs">
                  เลือกวันเริ่มใช้แผนได้ทุกวัน (รวมถึงกลางสัปดาห์)
                  ระบบจะสลับใช้แผนใหม่ตั้งแต่วันที่กำหนดโดยอัตโนมัติ
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <label>
                  วันเริ่มใช้แผนใหม่
                  <input
                    type="date"
                    required
                    value={mpEffectiveFrom}
                    onChange={(e) => setMpEffectiveFrom(e.target.value)}
                    className="field mono block mt-1"
                  />
                </label>
                <label>
                  หมายเหตุแผน
                  <input
                    type="text"
                    placeholder="เช่น ปรับผังรายการไตรมาสใหม่"
                    value={mpNote}
                    onChange={(e) => setMpNote(e.target.value)}
                    className="field block mt-1 w-[220px]"
                  />
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="schedule-grid w-full min-w-[780px] text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left dim font-normal">ทีม / แถว</th>
                    {THAI_DAYS_SHORT.map((d, idx) => (
                      <th key={idx} className="p-2 text-left dim font-normal">
                        {d}
                      </th>
                    ))}
                    <th className="p-2 text-center dim font-normal">วันปกติ</th>
                  </tr>
                </thead>
                <tbody>
                  {store.teams
                    .filter((t) => t.active)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((team) => {
                      const daysWorked = Array.from({ length: 7 }, (_, dow) =>
                        Boolean(mpGrid[`T${team.id}-${dow}`])
                      ).filter(Boolean).length;
                      return (
                        <tr key={team.id}>
                          <td className="p-2 font-semibold">ทีม {team.name}</td>
                          {Array.from({ length: 7 }, (_, dow) => {
                            const key = `T${team.id}-${dow}`;
                            return (
                              <td key={dow} className="p-1.5">
                                <select
                                  value={mpGrid[key] || ""}
                                  onChange={(e) =>
                                    setMpGrid((prev) => ({
                                      ...prev,
                                      [key]: Number(e.target.value) || 0,
                                    }))
                                  }
                                  className="field w-full text-xs py-1"
                                >
                                  <option value="">— หยุด —</option>
                                  {store.shiftTypes
                                    .filter(
                                      (s) => s.active && s.kind === "NORMAL"
                                    )
                                    .map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name} ({s.startTime}–{s.endTime})
                                      </option>
                                    ))}
                                </select>
                              </td>
                            );
                          })}
                          <td
                            className="p-2 text-center mono font-semibold"
                            style={{
                              color:
                                daysWorked === 5 ? "var(--ok)" : "var(--am)",
                            }}
                          >
                            {daysWorked}
                          </td>
                        </tr>
                      );
                    })}

                  {/* Individual CAM3 employee rows in Master-plan */}
                  {cam3Employees.map((emp) => {
                    const daysWorked = Array.from({ length: 7 }, (_, dow) =>
                      Boolean(mpGrid[`CAM3_${emp.id}-${dow}`])
                    ).filter(Boolean).length;
                    return (
                      <tr key={`mp-cam3-${emp.id}`}>
                        <td className="p-2">
                          <div className="font-semibold">
                            {emp.firstName} {emp.lastName}
                          </div>
                          <div className="dim text-xs">CAM3</div>
                        </td>
                        {Array.from({ length: 7 }, (_, dow) => {
                          const key = `CAM3_${emp.id}-${dow}`;
                          return (
                            <td key={dow} className="p-1.5">
                              <select
                                value={mpGrid[key] || ""}
                                onChange={(e) =>
                                  setMpGrid((prev) => ({
                                    ...prev,
                                    [key]: Number(e.target.value) || 0,
                                  }))
                                }
                                className="field w-full text-xs py-1"
                              >
                                <option value="">— หยุด —</option>
                                {store.shiftTypes
                                  .filter((s) => s.active && s.kind === "NORMAL")
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name} ({s.startTime}–{s.endTime})
                                    </option>
                                  ))}
                              </select>
                            </td>
                          );
                        })}
                        <td
                          className="p-2 text-center mono font-semibold"
                          style={{
                            color:
                              daysWorked === 5 ? "var(--ok)" : "var(--am)",
                          }}
                        >
                          {daysWorked}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Recurring Special Slots in Master-plan */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <h3
                    className="font-semibold text-sm"
                    style={{ color: "var(--tally)" }}
                  >
                    กะพิเศษประจำใน Master-plan (ปกติ 2 กะต่อสัปดาห์)
                  </h3>
                  <p className="dim text-xs">
                    ระบุเฉพาะวันและรูปแบบกะพิเศษ (ไม่ผูกทีมตายตัว)
                    เพื่อให้รอจัดทีมหมุนเวียนในตารางประจำสัปดาห์
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    const firstSpecial =
                      store.shiftTypes.find((s) => s.kind === "SPECIAL") ??
                      store.shiftTypes[0];
                    if (!firstSpecial) return;
                    setMpSpecialSlots((prev) => [
                      ...prev,
                      { dayOfWeek: 0, shiftTypeId: firstSpecial.id },
                    ]);
                  }}
                >
                  + เพิ่มกะพิเศษประจำ
                </button>
              </div>

              <div className="space-y-2">
                {mpSpecialSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-3 p-2 rounded-md"
                    style={{ background: "var(--panel2)" }}
                  >
                    <span className="mono text-xs dim">กะที่ #{idx + 1}</span>
                    <select
                      value={slot.dayOfWeek}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMpSpecialSlots((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, dayOfWeek: val } : s
                          )
                        );
                      }}
                      className="field text-xs py-1"
                    >
                      {THAI_DAYS_SHORT.map((d, dow) => (
                        <option key={dow} value={dow}>
                          วัน{d}
                        </option>
                      ))}
                    </select>

                    <select
                      value={slot.shiftTypeId}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMpSpecialSlots((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, shiftTypeId: val } : s
                          )
                        );
                      }}
                      className="field text-xs py-1"
                    >
                      {store.shiftTypes
                        .filter((s) => s.active)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime}–{s.endTime})
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      className="dim text-xs hover:text-white ml-auto cursor-pointer"
                      onClick={() =>
                        setMpSpecialSlots((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                    >
                      ลบออก
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={isPending} className="btn">
                บันทึกเป็น Master-plan เวอร์ชันใหม่
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ==================== 3. OVERDRIVE (ADMIN) ==================== */}
      {isAdmin && activeTab === "od" && (
        <section className="grid lg:grid-cols-[360px_1fr] gap-4">
          <form
            onSubmit={handleSaveOverride}
            className="panel p-4 space-y-3 text-sm"
          >
            <h2 className="font-semibold">บันทึก Overdrive (ปรับกะเฉพาะครั้ง)</h2>
            <p className="dim text-xs">
              ปรับเปลี่ยนตารางระดับทีม หรือ CAM3 เฉพาะวันที่เลือกโดยไม่กระทบ Master-plan
            </p>

            <label className="block">
              วันที่ต้องการปรับ
              <input
                type="date"
                required
                value={odDate}
                onChange={(e) => setOdDate(e.target.value)}
                className="field mono w-full mt-1"
              />
            </label>

            <label className="block">
              ทีม / ตำแหน่งพิเศษ
              <select
                value={odTarget}
                onChange={(e) => setOdTarget(e.target.value)}
                className="field w-full mt-1"
              >
                {store.teams
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      ทีม {t.name}
                    </option>
                  ))}
                {cam3Employees.map((emp) => (
                  <option key={`CAM3_${emp.id}`} value={`CAM3_${emp.id}`}>
                    CAM3 · {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              รูปแบบการปรับ
              <select
                value={odMode}
                onChange={(e) => setOdMode(e.target.value as OverrideMode)}
                className="field w-full mt-1"
              >
                <option value="REPLACE">แทนที่กะเดิมของวันนั้น</option>
                <option value="ADD">เพิ่มกะพิเศษเฉพาะกิจ (ทำงานเพิ่ม)</option>
                <option value="OFF">สั่งหยุดงาน (ยกเลิกกะวันนั้น)</option>
              </select>
            </label>

            {odMode !== "OFF" && (
              <>
                <label className="block">
                  เลือกกะการทำงาน
                  <select
                    value={odShiftId}
                    onChange={(e) => setOdShiftId(e.target.value)}
                    className="field w-full mt-1"
                  >
                    {store.shiftTypes
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name} ({s.startTime}–{s.endTime})
                        </option>
                      ))}
                    <option value="CUSTOM">กำหนดเวลาเริ่ม–จบเอง...</option>
                  </select>
                </label>

                {odShiftId === "CUSTOM" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      เวลาเริ่ม
                      <input
                        type="time"
                        value={odCustomStart}
                        onChange={(e) => setOdCustomStart(e.target.value)}
                        className="field mono w-full mt-1"
                      />
                    </label>
                    <label>
                      เวลาเลิก
                      <input
                        type="time"
                        value={odCustomEnd}
                        onChange={(e) => setOdCustomEnd(e.target.value)}
                        className="field mono w-full mt-1"
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            <label className="block">
              เหตุผล / สถานการณ์พิเศษ
              <textarea
                rows={2}
                required
                placeholder="เช่น ถ่ายทอดสดรายการพิเศษ / ซ้อมใหญ่สตูดิโอ"
                value={odReason}
                onChange={(e) => setOdReason(e.target.value)}
                className="field w-full mt-1"
              />
            </label>

            <button type="submit" disabled={isPending} className="btn w-full">
              บันทึก Overdrive
            </button>
          </form>

          <div className="panel p-4 overflow-x-auto">
            <h2 className="font-semibold mb-3">รายการ Overdrive ที่บันทึกไว้</h2>
            <table className="w-full text-sm min-w-[560px]">
              <thead className="dim text-left">
                <tr>
                  <th className="py-2">วันที่</th>
                  <th>เป้าหมาย</th>
                  <th>รูปแบบ</th>
                  <th>เวลา / กะ</th>
                  <th>เหตุผล</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...store.overrides]
                  .sort((a, b) => b.workDate.localeCompare(a.workDate))
                  .map((ov) => {
                    const team = store.teams.find((t) => t.id === ov.teamId);
                    const cam3Emp = ov.isCam3
                      ? store.employees.find((e) => e.id === ov.employeeId)
                      : undefined;
                    const st = store.shiftTypes.find(
                      (s) => s.id === ov.shiftTypeId
                    );
                    return (
                      <tr
                        key={ov.id}
                        className="border-t"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <td className="py-2.5 mono">
                          {formatThaiDateShort(ov.workDate)}
                        </td>
                        <td className="font-semibold">
                          {ov.isCam3
                            ? cam3Emp
                              ? `CAM3 · ${cam3Emp.firstName} ${cam3Emp.lastName}`
                              : "CAM3"
                            : `ทีม ${team?.name ?? "-"}`}
                        </td>
                        <td>
                          {ov.mode === "REPLACE"
                            ? "แทนที่กะเดิม"
                            : ov.mode === "ADD"
                            ? "เพิ่มกะ"
                            : "หยุดงาน"}
                        </td>
                        <td className="mono">
                          {ov.mode === "OFF"
                            ? "— หยุด"
                            : st
                            ? `${st.name} (${st.startTime}–${st.endTime})`
                            : `${ov.customStart}–${ov.customEnd}`}
                        </td>
                        <td className="dim">{ov.reason}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() =>
                              startTransition(async () => {
                                await deleteOverrideAction(ov.id);
                                router.refresh();
                              })
                            }
                            className="dim text-xs hover:text-white cursor-pointer"
                          >
                            ลบ
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================== 4. SHIFT TYPES (ADMIN) ==================== */}
      {isAdmin && activeTab === "shifts" && (
        <section className="grid lg:grid-cols-[380px_1fr] gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                await saveShiftTypeAction({
                  code: shCode,
                  name: shName,
                  startTime: shStart,
                  endTime: shEnd,
                  kind: shKind,
                  color: shColor,
                });
                setShCode("");
                setShName("");
                router.refresh();
              });
            }}
            className="panel p-4 space-y-3 text-sm"
          >
            <h2 className="font-semibold">สร้างรูปแบบกะการทำงาน</h2>
            <label className="block">
              รหัสกะ (ภาษาอังกฤษสั้นๆ)
              <input
                type="text"
                required
                placeholder="เช่น AM2 หรือ SP_NEWS"
                value={shCode}
                onChange={(e) => setShCode(e.target.value)}
                className="field mono w-full mt-1"
              />
            </label>
            <label className="block">
              ชื่อกะการทำงาน
              <input
                type="text"
                required
                placeholder="เช่น เช้าพิเศษ / รายการสดค่ำ"
                value={shName}
                onChange={(e) => setShName(e.target.value)}
                className="field w-full mt-1"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                เวลาเริ่ม
                <input
                  type="time"
                  required
                  value={shStart}
                  onChange={(e) => setShStart(e.target.value)}
                  className="field mono w-full mt-1"
                />
              </label>
              <label>
                เวลาเลิก
                <input
                  type="time"
                  required
                  value={shEnd}
                  onChange={(e) => setShEnd(e.target.value)}
                  className="field mono w-full mt-1"
                />
              </label>
            </div>
            <label className="block">
              ประเภทกะ
              <select
                value={shKind}
                onChange={(e) => {
                  const nextKind = e.target.value as ShiftKind;
                  setShKind(nextKind);
                  if (nextKind === "SPECIAL" && shColor === "am") {
                    setShColor("sp");
                  } else if (nextKind === "NORMAL" && shColor === "sp") {
                    setShColor("am");
                  }
                }}
                className="field w-full mt-1"
              >
                <option value="NORMAL">กะการทำงานปกติ</option>
                <option value="SPECIAL">กะการทำงานพิเศษ (วันที่ 6)</option>
              </select>
            </label>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span>เลือกสีแสดงผล ({SHIFT_COLORS.length} สี)</span>
                <span className="text-xs dim flex items-center gap-1.5">
                  <i
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: getShiftColorMeta(shColor).hex }}
                  />
                  {getShiftColorMeta(shColor).label}
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-1.5"
                role="radiogroup"
                aria-label="เลือกสีของกะการทำงาน"
              >
                {SHIFT_COLORS.map((c) => {
                  const selected = shColor === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setShColor(c.key)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left cursor-pointer transition-colors"
                      style={{
                        background: selected
                          ? "rgba(255, 255, 255, 0.08)"
                          : "var(--panel2)",
                        border: selected
                          ? `1.5px solid ${c.hex}`
                          : "1px solid var(--line)",
                        color: selected ? "var(--ink)" : "var(--dim)",
                        fontWeight: selected ? 600 : 400,
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ background: c.hex }}
                      />
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Color & Chip Preview */}
            <div
              className="p-3 rounded-md space-y-2"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
              }}
            >
              <div className="flex items-center justify-between text-xs dim">
                <span>ตัวอย่างการแสดงผลบนตาราง</span>
                <span className="mono">{getShiftColorMeta(shColor).hex}</span>
              </div>
              <ShiftChip
                shift={{
                  name: shName.trim() || "ตัวอย่างชื่อกะ",
                  startTime: shStart || "08:00",
                  endTime: shEnd || "17:00",
                  color: shColor,
                  kind: shKind,
                  ...calcShiftHours(shStart || "08:00", shEnd || "17:00"),
                }}
              />
            </div>

            <button type="submit" disabled={isPending} className="btn w-full">
              + บันทึกรูปแบบกะ
            </button>
          </form>

          <div className="panel p-4 overflow-x-auto">
            <h2 className="font-semibold mb-3">รูปแบบกะทั้งหมดในระบบ</h2>
            <table className="w-full text-sm min-w-[540px]">
              <thead className="dim text-left">
                <tr>
                  <th className="py-2">ตัวอย่างป้ายกะ</th>
                  <th>รหัส</th>
                  <th>ประเภท</th>
                  <th>เวลาทำงาน</th>
                  <th>จำนวนชั่วโมง</th>
                  <th>สีแสดงผล</th>
                </tr>
              </thead>
              <tbody>
                {store.shiftTypes.map((st) => {
                  const { hours, isOvernight } = calcShiftHours(
                    st.startTime,
                    st.endTime
                  );
                  const colorMeta = getShiftColorMeta(st.color);
                  return (
                    <tr
                      key={st.id}
                      className="border-t"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <td className="py-2.5">
                        <span className={`chip c-${st.color} inline-block`}>
                          <b>{st.name}</b>{" "}
                          <span className="mono text-xs dim">
                            {st.startTime}–{st.endTime}
                          </span>
                        </span>
                      </td>
                      <td className="mono dim">{st.code}</td>
                      <td
                        style={{
                          color:
                            st.kind === "SPECIAL"
                              ? "var(--tally)"
                              : "var(--dim)",
                        }}
                      >
                        {st.kind === "SPECIAL" ? "กะพิเศษ" : "กะปกติ"}
                      </td>
                      <td className="mono">
                        {st.startTime}–{st.endTime}
                        {isOvernight && (
                          <span className="dim text-xs"> (+1 วัน)</span>
                        )}
                      </td>
                      <td className="mono dim">{hours} ชม.</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-xs shrink-0"
                            style={{ background: colorMeta.hex }}
                            title={`${colorMeta.label} (${colorMeta.hex})`}
                          />
                          <select
                            aria-label={`เปลี่ยนสีของกะ ${st.name}`}
                            value={st.color}
                            onChange={(e) => {
                              const nextColor = e.target.value;
                              startTransition(async () => {
                                await saveShiftTypeAction({
                                  id: st.id,
                                  code: st.code,
                                  name: st.name,
                                  startTime: st.startTime,
                                  endTime: st.endTime,
                                  kind: st.kind,
                                  color: nextColor,
                                });
                                router.refresh();
                              });
                            }}
                            className="field text-xs py-1"
                          >
                            {SHIFT_COLORS.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================== 5. PEOPLE & TEAMS (ADMIN) ==================== */}
      {isAdmin && activeTab === "people" && (
        <section className="grid lg:grid-cols-[310px_1fr] gap-4">
          {/* Team Management */}
          <div className="panel p-4 space-y-4">
            <div>
              <h2 className="font-semibold mb-1">จัดการทีมสตูดิโอ</h2>
              <p className="dim text-xs">
                เริ่มต้น 5 ทีม (A–E) สามารถเพิ่มทีมที่ 6 หรือปิดใช้งานทีมได้โดยไม่เสียประวัติตารางเดิม
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTeamName.trim()) return;
                startTransition(async () => {
                  await addTeamAction(newTeamName);
                  setNewTeamName("");
                  router.refresh();
                });
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="ชื่อทีมใหม่ เช่น F"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="field text-sm flex-1"
              />
              <button type="submit" disabled={isPending} className="btn">
                + เพิ่มทีม
              </button>
            </form>

            <ul className="space-y-2 text-sm">
              {[...store.teams]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
                .map((t) => {
                  const members = store.employees.filter(
                    (e) => e.active && e.teamId === t.id
                  );
                  const leadCount = members.filter((e) => {
                    const p = store.positions.find(
                      (pos) => pos.id === e.positionId
                    );
                    return p?.isLead;
                  }).length;
                  return (
                    <li
                      key={t.id}
                      className="p-2.5 rounded-md flex items-center justify-between gap-2"
                      style={{
                        background: "var(--panel2)",
                        opacity: t.active ? 1 : 0.55,
                      }}
                    >
                      <div>
                        <div className="font-semibold">
                          ทีม {t.name}{" "}
                          <span className="dim text-xs font-normal">
                            ({members.length} คน)
                          </span>
                        </div>
                        {t.active && leadCount !== 1 && (
                          <div
                            className="text-xs"
                            style={{ color: "var(--am)" }}
                          >
                            {leadCount === 0
                              ? "⚠ ยังไม่มี Technician Director"
                              : `⚠ มี TD ${leadCount} คน`}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="เลื่อนขึ้น"
                          onClick={() =>
                            startTransition(async () => {
                              await moveTeamOrderAction(t.id, -1);
                              router.refresh();
                            })
                          }
                          className="btn-ghost px-2 py-0.5 text-xs"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          title="เลื่อนลง"
                          onClick={() =>
                            startTransition(async () => {
                              await moveTeamOrderAction(t.id, 1);
                              router.refresh();
                            })
                          }
                          className="btn-ghost px-2 py-0.5 text-xs"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            startTransition(async () => {
                              await toggleTeamActiveAction(t.id);
                              router.refresh();
                            })
                          }
                          className="btn-ghost px-2 py-0.5 text-xs"
                        >
                          {t.active ? "ปิดทีม" : "เปิดใช้"}
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>

          {/* Employee Management */}
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const pos = store.positions.find(
                    (p) => p.id === empPositionId
                  );
                  await saveEmployeeAction({
                    firstName: empFirstName,
                    lastName: empLastName,
                    phone: empPhone,
                    positionId: empPositionId,
                    teamId: pos?.isSpecial ? null : empTeamId,
                  });
                  setEmpFirstName("");
                  setEmpLastName("");
                  setEmpPhone("");
                  router.refresh();
                });
              }}
              className="panel p-4 grid sm:grid-cols-6 gap-2.5 items-end text-sm"
            >
              <label className="sm:col-span-1">
                ชื่อ
                <input
                  type="text"
                  required
                  value={empFirstName}
                  onChange={(e) => setEmpFirstName(e.target.value)}
                  className="field w-full mt-1"
                />
              </label>
              <label className="sm:col-span-1">
                นามสกุล
                <input
                  type="text"
                  required
                  value={empLastName}
                  onChange={(e) => setEmpLastName(e.target.value)}
                  className="field w-full mt-1"
                />
              </label>
              <label className="sm:col-span-1">
                เบอร์โทรศัพท์
                <input
                  type="text"
                  required
                  placeholder="08x-xxx-xxxx"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="field mono w-full mt-1"
                />
              </label>
              <label className="sm:col-span-1">
                ตำแหน่ง
                <select
                  value={empPositionId}
                  onChange={(e) => setEmpPositionId(Number(e.target.value))}
                  className="field w-full mt-1"
                >
                  {store.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-1">
                ทีมสังกัด
                <select
                  disabled={
                    store.positions.find((p) => p.id === empPositionId)
                      ?.isSpecial
                  }
                  value={empTeamId}
                  onChange={(e) => setEmpTeamId(Number(e.target.value))}
                  className="field w-full mt-1"
                >
                  {store.teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      ทีม {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={isPending}
                className="btn sm:col-span-1"
              >
                + เพิ่มพนักงาน
              </button>
            </form>

            <div className="panel p-4 overflow-x-auto">
              <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                <h2 className="font-semibold">
                  รายชื่อพนักงานทั้งหมด (
                  {store.employees.filter((e) => e.active).length} คน)
                </h2>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ / ตำแหน่ง / เบอร์โทร..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="field text-sm w-[240px]"
                />
              </div>

              <table className="w-full text-sm min-w-[640px]">
                <thead className="dim text-left">
                  <tr>
                    <th className="py-2">ชื่อ–นามสกุล</th>
                    <th>ตำแหน่ง</th>
                    <th>ทีมสังกัด</th>
                    <th>เบอร์โทรศัพท์</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {store.employees
                    .filter((e) => e.active)
                    .filter((e) => {
                      if (!empSearch.trim()) return true;
                      const pos = store.positions.find(
                        (p) => p.id === e.positionId
                      );
                      const q = empSearch.toLowerCase();
                      return (
                        e.firstName.toLowerCase().includes(q) ||
                        e.lastName.toLowerCase().includes(q) ||
                        e.phone.includes(q) ||
                        (pos?.name.toLowerCase().includes(q) ?? false)
                      );
                    })
                    .map((emp) => {
                      const pos = store.positions.find(
                        (p) => p.id === emp.positionId
                      );
                      const team = store.teams.find((t) => t.id === emp.teamId);
                      return (
                        <tr
                          key={emp.id}
                          className="border-t"
                          style={{ borderColor: "var(--line)" }}
                        >
                          <td className="py-2">
                            {emp.firstName} {emp.lastName}
                          </td>
                          <td
                            className={
                              pos?.isLead
                                ? "font-semibold"
                                : pos?.isSpecial
                                ? "font-semibold"
                                : "dim"
                            }
                            style={{
                              color: pos?.isSpecial
                                ? "var(--tally)"
                                : undefined,
                            }}
                          >
                            {pos?.name}
                            {pos?.isLead ? " (หัวหน้าทีม)" : ""}
                          </td>
                          <td>
                            {pos?.isSpecial || !team ? (
                              <span className="dim">กลุ่มเฉพาะ CAM3</span>
                            ) : (
                              `ทีม ${team.name}`
                            )}
                          </td>
                          <td className="mono dim">{emp.phone}</td>
                          <td className="text-right">
                            <button
                              type="button"
                              onClick={() =>
                                startTransition(async () => {
                                  await removeEmployeeAction(emp.id);
                                  router.refresh();
                                })
                              }
                              className="dim text-xs hover:text-white cursor-pointer"
                            >
                              นำออก
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ==================== 6. WEEKLY HISTORY SNAPSHOTS (ADMIN) ==================== */}
      {isAdmin && activeTab === "history" && (
        <section className="grid lg:grid-cols-[290px_1fr] gap-4">
          <div className="panel p-4">
            <h2 className="font-semibold mb-1">ตารางย้อนหลังอัตโนมัติ</h2>
            <p className="dim text-xs mb-3">
              บันทึกอัตโนมัติเมื่อสิ้นสุดแต่ละสัปดาห์ (เก็บทั้งตารางและรายชื่อทีม ณ สัปดาห์นั้น)
            </p>
            <ul className="space-y-1.5 text-sm">
              {store.snapshots.map((snap) => {
                const isSelected = selectedSnapshotWeek === snap.weekStart;
                return (
                  <li key={snap.weekStart}>
                    <button
                      type="button"
                      onClick={() => setSelectedSnapshotWeek(snap.weekStart)}
                      className="w-full text-left p-2.5 rounded-md cursor-pointer"
                      style={{
                        background: isSelected
                          ? "var(--panel2)"
                          : "transparent",
                        outline: isSelected
                          ? "1px solid var(--tally)"
                          : undefined,
                      }}
                    >
                      <div className="mono font-medium">
                        {formatThaiWeekRange(
                          snap.data.weekStart,
                          snap.data.weekEnd
                        )}
                      </div>
                      <div className="dim text-xs mt-0.5">
                        บันทึกเมื่อ{" "}
                        {formatThaiDateShort(snap.finalizedAt.slice(0, 10))}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="panel p-4 overflow-x-auto">
            {(() => {
              const snap = store.snapshots.find(
                (s) => s.weekStart === selectedSnapshotWeek
              );
              if (!snap) {
                return <p className="dim text-sm">เลือกสัปดาห์ทางซ้ายเพื่อดูข้อมูลย้อนหลัง</p>;
              }
              return (
                <div>
                  <div className="flex justify-between items-baseline mb-3">
                    <h3 className="font-semibold">
                      ภาพบันทึกตาราง:{" "}
                      {formatThaiWeekRange(
                        snap.data.weekStart,
                        snap.data.weekEnd
                      )}
                    </h3>
                    <span className="dim text-xs">
                      อ่านอย่างเดียว (Snapshot)
                    </span>
                  </div>
                  <table className="schedule-grid w-full min-w-[820px] text-sm">
                    <thead>
                      <tr>
                        <th className="p-2 text-left dim font-normal">ทีม</th>
                        {snap.data.days.map((d) => (
                          <th
                            key={d.date}
                            className="p-2 text-left dim font-normal"
                          >
                            {d.labelShort} <span className="mono">{d.dayNum}</span>
                          </th>
                        ))}
                        <th className="p-2 text-center dim font-normal">วัน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.data.teamRows.map((tr) => (
                        <tr key={tr.team.id}>
                          <td className="p-2 font-semibold">
                            ทีม {tr.team.name}
                            <div className="dim text-xs font-normal">
                              {tr.leadName.split(" ")[0]}
                            </div>
                          </td>
                          {groupConsecutiveCells(tr.cells).map((group) => {
                            const firstCell = group.cells[0];
                            return (
                              <td
                                key={firstCell.workDate}
                                colSpan={group.span}
                                className="p-1.5 space-y-1"
                              >
                                <ShiftChip
                                  shift={firstCell.baseShift}
                                  spanDays={group.span}
                                />
                                {group.cells.flatMap((c) =>
                                  c.addedShifts.map((a, i) => (
                                    <ShiftChip
                                      key={`${c.workDate}-a-${i}`}
                                      shift={a}
                                    />
                                  ))
                                )}
                                {group.cells.flatMap((c) =>
                                  c.specialSlots.map((sp) => (
                                    <ShiftChip
                                      key={sp.slotId}
                                      shift={sp.shift}
                                    />
                                  ))
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center mono">
                            {tr.totalWorkDays}
                          </td>
                        </tr>
                      ))}
                      {(snap.data.cam3Rows ?? []).map((cRow) => (
                        <tr key={`snap-cam3-${cRow.employee.id}`}>
                          <td className="p-2 font-semibold">
                            {cRow.employee.firstName} {cRow.employee.lastName}
                            <div className="dim text-xs font-normal">CAM3</div>
                          </td>
                          {groupConsecutiveCells(cRow.cells).map((group) => {
                            const firstCell = group.cells[0];
                            return (
                              <td
                                key={firstCell.workDate}
                                colSpan={group.span}
                                className="p-1.5 space-y-1"
                              >
                                <ShiftChip
                                  shift={firstCell.baseShift}
                                  spanDays={group.span}
                                />
                                {group.cells.flatMap((c) =>
                                  c.addedShifts.map((a, i) => (
                                    <ShiftChip
                                      key={`${c.workDate}-a-${i}`}
                                      shift={a}
                                    />
                                  ))
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center mono">
                            {cRow.totalWorkDays}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* ==================== ADMIN LOGIN MODAL ==================== */}
      {showLoginModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.72)" }}
        >
          <form
            onSubmit={handleLoginSubmit}
            className="panel p-5 w-full max-w-[360px] space-y-3 text-sm"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-semibold text-base">เข้าสู่ระบบผู้ดูแล (Admin)</h2>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="dim hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="dim text-xs">
              พนักงานทั่วไปดูตารางงานได้โดยไม่ต้องเข้าสู่ระบบ · เฉพาะ Admin สำหรับจัดตารางและแก้ไขข้อมูล
            </p>
            {loginError && (
              <div
                className="p-2 rounded text-xs"
                style={{
                  background: "rgba(255,59,48,0.15)",
                  color: "var(--tally)",
                }}
              >
                {loginError}
              </div>
            )}
            <label className="block">
              ชื่อผู้ใช้ (Username)
              <input
                type="text"
                required
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="field mono w-full mt-1"
              />
            </label>
            <label className="block">
              รหัสผ่าน (Password)
              <input
                type="password"
                required
                placeholder="studio-admin-2026"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="field mono w-full mt-1"
              />
            </label>
            <div className="dim text-xs">
              ค่าเริ่มต้นใน <code>.env</code>: ผู้ใช้ <code>admin</code> / รหัสผ่าน{" "}
              <code>studio-admin-2026</code>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="btn-ghost"
              >
                ยกเลิก
              </button>
              <button type="submit" disabled={isPending} className="btn">
                เข้าสู่ระบบ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
