"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  calcShiftHours,
  getShiftColorMeta,
  getSundayOfWeek,
  groupConsecutiveCells,
  resolveDateRange,
  resolveWeek,
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
  autoRotateMonthAction,
  autoRotateWeekAction,
  clearMonthSpecialAssignmentsAction,
  clearWeekSpecialAssignmentsAction,
  deleteMasterPlanAction,
  deleteOverrideAction,
  loginAdminAction,
  logoutAdminAction,
  moveTeamOrderAction,
  removeEmployeeAction,
  removeShiftTypeAction,
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

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1 + deltaMonths, 1));
  return d.toISOString().slice(0, 7);
}

function formatThaiYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${THAI_MONTHS_SHORT[(m || 1) - 1]} ${y}`;
}

const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

function formatThaiMonthYearFull(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const monthName = THAI_MONTHS_FULL[(m || 1) - 1] || "";
  const beYear = (y || 2026) + 543;
  return `${monthName} ${beYear}`;
}

function getMonthSixWeekStart(ym: string): string {
  const firstIso = `${ym}-01`;
  const w0 = getSundayOfWeek(firstIso);
  return w0 === firstIso ? addDays(w0, -7) : w0;
}

function getCrossMonthEndSixWeekStart(ym: string): string {
  const nextYm = shiftYearMonth(ym, 1);
  const lastDayOfMonth = addDays(`${nextYm}-01`, -1);
  const endWeek = getSundayOfWeek(lastDayOfMonth);
  return addDays(endWeek, -14);
}

function isLastDayOfMonth(iso: string): boolean {
  return addDays(iso, 1).slice(8, 10) === "01";
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
    return (
      <span className="dim text-xs flex items-center min-h-[44px] px-1">
        — หยุด
      </span>
    );
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
      <span className="flex items-center gap-2 flex-wrap">
        <b className="font-semibold">{shift.name}</b>{" "}
        <span className="mono text-xs">
          {shift.startTime}–{shift.endTime}
        </span>
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

type TabKey =
  | "dash"
  | "special"
  | "master"
  | "od"
  | "shifts"
  | "people"
  | "history";

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // 6-Week Special Shift & Overdrive Planner state
  const [sixWeekMonth, setSixWeekMonth] = useState<string>(() =>
    resolvedWeek.weekStart.slice(0, 7)
  );
  const [sixWeekStart, setSixWeekStart] = useState<string>(() =>
    getMonthSixWeekStart(resolvedWeek.weekStart.slice(0, 7))
  );

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

  // A3 Paper Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportYm, setExportYm] = useState<string>(() =>
    resolvedWeek.weekStart.slice(0, 7)
  );
  const [isDownloadingA3, setIsDownloadingA3] = useState(false);
  const a3ExportRef = useRef<HTMLDivElement>(null);

  async function handleDownloadA3Image() {
    if (!a3ExportRef.current) return;
    try {
      setIsDownloadingA3(true);
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(a3ExportRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const title = `ตารางกะการทำงาน_${formatThaiMonthYearFull(exportYm).replace(/\s+/g, "_")}`;
      const link = document.createElement("a");
      link.download = `${title}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export image error:", err);
      alert("เกิดข้อผิดพลาดในการสร้างหรือดาวน์โหลดรูปภาพ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsDownloadingA3(false);
    }
  }

  function handlePrintA3() {
    window.print();
  }

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
  const [editingPlanId, setEditingPlanId] = useState<number | null>(() => {
    return latestPlan && latestPlan.effectiveFrom > todayIso ? latestPlan.id : null;
  });
  const [mpEffectiveFrom, setMpEffectiveFrom] = useState<string>(() => {
    return latestPlan && latestPlan.effectiveFrom > todayIso
      ? latestPlan.effectiveFrom
      : addDays(resolvedWeek.weekStart, 7);
  });
  const [mpNote, setMpNote] = useState<string>(() => {
    return latestPlan && latestPlan.effectiveFrom > todayIso ? latestPlan.note : "";
  });
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

  const editingPlan = editingPlanId
    ? store.masterPlans.find(
        (p) => p.id === editingPlanId && p.effectiveFrom > todayIso
      ) ?? null
    : null;

  // Overdrive form state
  const [odDate, setOdDate] = useState<string>(todayIso);
  const [odTarget, setOdTarget] = useState<string>(
    String(resolvedWeek.teamRows[0]?.team.id ?? "1")
  );
  const [odMode, setOdMode] = useState<OverrideMode>("REPLACE");
  const [odShiftId, setOdShiftId] = useState<string>(() => {
    const firstActive = store.shiftTypes.find((s) => s.active);
    return firstActive ? String(firstActive.id) : "CUSTOM";
  });
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
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const employeeFormRef = useRef<HTMLFormElement>(null);

  function handleStartEditEmployee(emp: (typeof store.employees)[number]) {
    setEditingEmpId(emp.id);
    setEmpFirstName(emp.firstName);
    setEmpLastName(emp.lastName);
    setEmpPhone(emp.phone);
    setEmpPositionId(emp.positionId);
    setEmpTeamId(emp.teamId ?? store.teams[0]?.id ?? 1);
    if (activeTab !== "people") {
      setActiveTab("people");
    }
    setTimeout(() => {
      employeeFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function handleCancelEditEmployee() {
    setEditingEmpId(null);
    setEmpFirstName("");
    setEmpLastName("");
    setEmpPhone("");
    setEmpPositionId(store.positions[0]?.id ?? 1);
    setEmpTeamId(store.teams[0]?.id ?? 1);
  }

  // History viewer state
  const [selectedSnapshotWeek, setSelectedSnapshotWeek] = useState<string | null>(
    store.snapshots[0]?.weekStart ?? null
  );

  useEffect(() => {
    const saved = localStorage.getItem("studio_theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("studio_theme", next);
  }

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

  function navigateMonth(nextMonth: string, nextPeriod?: FairnessPeriod) {
    const p = nextPeriod ?? resolvedWeek.fairness.periodMonths;
    router.push(`/?month=${nextMonth}&period=${p}`);
  }

  function navigateWeek(nextWeekStart: string, nextPeriod?: FairnessPeriod) {
    const p = nextPeriod ?? resolvedWeek.fairness.periodMonths;
    router.push(`/?month=${nextWeekStart.slice(0, 7)}&period=${p}`);
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

  function handleAutoRotateMonth() {
    if (!isAdmin) return;
    startTransition(async () => {
      await autoRotateMonthAction(
        resolvedWeek.weekStart.slice(0, 7),
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

  function handleClearMonthAssignments() {
    if (!isAdmin) return;
    startTransition(async () => {
      await clearMonthSpecialAssignmentsAction(
        resolvedWeek.weekStart.slice(0, 7)
      );
      router.refresh();
    });
  }

  function loadPlanIntoEditor(planId: number) {
    const p = store.masterPlans.find((x) => x.id === planId);
    if (!p) return;
    const isFuture = p.effectiveFrom > todayIso;
    if (isFuture) {
      setEditingPlanId(p.id);
      setMpEffectiveFrom(p.effectiveFrom);
      setMpNote(p.note);
    } else {
      setEditingPlanId(null);
      setMpEffectiveFrom(addDays(todayIso, 7));
      setMpNote(`ต่อยอดจาก v${p.version}`);
    }
    setMpGrid(buildMpGridFromPlan(p));
    setMpSpecialSlots(
      p.specialSlots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        shiftTypeId: s.shiftTypeId,
      }))
    );
  }

  function handleResetToNewPlan() {
    setEditingPlanId(null);
    setMpEffectiveFrom(addDays(resolvedWeek.weekStart, 7));
    setMpNote("");
    setMpGrid(buildMpGridFromPlan(latestPlan));
    setMpSpecialSlots(
      latestPlan
        ? latestPlan.specialSlots.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            shiftTypeId: s.shiftTypeId,
          }))
        : []
    );
  }

  function handleDeleteFuturePlan(planId: number, version: number) {
    if (
      !window.confirm(
        `คุณแน่ใจหรือไม่ว่าต้องการลบ Master-plan v${version} ที่ยังไม่เริ่มต้นใช้งานนี้?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteMasterPlanAction(planId);
      handleResetToNewPlan();
      router.refresh();
    });
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
        planId: editingPlan ? editingPlan.id : undefined,
        effectiveFrom: mpEffectiveFrom,
        note: mpNote,
        entries,
        specialSlots: mpSpecialSlots,
      });
      if (!editingPlan) {
        setMpNote("");
      }
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
              เริ่มสัปดาห์วันอาทิตย์ · กะปกติ 5 วัน + กะ OT หมุนเวียน (วันที่ 6)
            </p>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-3">
          <div className="mono text-sm dim">
            วันนี้ {formatThaiDateShort(todayIso)} ·{" "}
            <span style={{ color: "var(--ink)" }}>{clockText || "—"}</span> ICT
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="btn-ghost text-xs"
            aria-label="สลับโหมดสีหน้าจอ"
          >
            {theme === "dark" ? "☀ โหมดสว่าง" : "☾ โหมดมืด"}
          </button>

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
              ["special", "จัดกะ OT "],
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
          {/* Month Switcher & Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="no-print btn-ghost"
                aria-label="เดือนก่อนหน้า"
                onClick={() =>
                  navigateMonth(
                    shiftYearMonth(resolvedWeek.weekStart.slice(0, 7), -1)
                  )
                }
              >
                ‹
              </button>
              <div className="mono text-sm px-2 font-medium">
                {formatThaiYearMonth(resolvedWeek.weekStart.slice(0, 7))}
              </div>
              <button
                type="button"
                className="no-print btn-ghost"
                aria-label="เดือนถัดไป"
                onClick={() =>
                  navigateMonth(
                    shiftYearMonth(resolvedWeek.weekStart.slice(0, 7), 1)
                  )
                }
              >
                ›
              </button>
              <button
                type="button"
                className="no-print btn-ghost ml-1 text-xs"
                onClick={() => navigateMonth(todayIso.slice(0, 7))}
              >
                เดือนนี้
              </button>
              <button
                type="button"
                className="no-print btn text-xs flex items-center gap-1.5 ml-1"
                onClick={() => {
                  setExportYm(resolvedWeek.weekStart.slice(0, 7));
                  setShowExportModal(true);
                }}
                title="ส่งออกรูปภาพตารางกะขนาด A3 (5 สัปดาห์)"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>Export รูปภาพ (A3)</span>
              </button>
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
                กะ OT  (วันที่ 6)
              </span>
              <span>
                <b style={{ color: "var(--tally)" }}>OD</b> = Overdrive
              </span>
            </div>
          </div>

          {/* 6th-Day Fairness Bar (3 months / 6 months / Full year up to today only) */}
          <div className="no-print panel p-3 mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <div>
              <b style={{ color: "var(--tally)" }}>กะ OT  (วันที่ 6)</b>{" "}
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
                      onClick={() =>
                        navigateMonth(resolvedWeek.weekStart.slice(0, 7), m)
                      }
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
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => setActiveTab("special")}
                >
                  มุมมอง 6 สัปดาห์
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={isPending}
                  onClick={handleClearMonthAssignments}
                >
                  ล้างการมอบหมายเดือนนี้
                </button>
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={
                    isPending || resolvedWeek.unassignedSpecialCount === 0
                  }
                  onClick={handleAutoRotateMonth}
                >
                  จัดหมุนเวียนอัตโนมัติ (เดือนนี้)
                </button>
              </div>
            )}
          </div>

          {/* Schedule Grid + Roster Sidebar */}
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="panel overflow-x-auto flex-1">
              <table className="schedule-grid min-w-max text-sm">
                <thead>
                  <tr>
                    <th className="sticky-col w-[72px] min-w-[72px] max-w-[72px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px] p-1.5 sm:p-2.5 text-right dim font-normal text-xs sm:text-sm">
                      ทีม
                    </th>
                    {resolvedWeek.days.map((d) => {
                      const isToday = d.date === todayIso;
                      const isSunday = d.dayOfWeek === 0;
                      const isSaturday = d.dayOfWeek === 6;
                      const isWeekend = isSunday || isSaturday;
                      return (
                        <th
                          key={d.date}
                          className={`w-[72px] min-w-[72px] max-w-[72px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px] p-1.5 sm:p-2 text-left font-normal ${
                            isToday
                              ? "today-cell today-head"
                              : isWeekend
                              ? "weekend-cell"
                              : ""
                          } ${isSaturday ? "border-r-2" : ""}`}
                          style={
                            isSaturday
                              ? { borderRightColor: "var(--line)" }
                              : undefined
                          }
                        >
                          <div className="flex items-baseline justify-between">
                            <span
                              className={
                                isSunday
                                  ? "font-semibold"
                                  : isToday
                                  ? "font-semibold"
                                  : "dim"
                              }
                              style={
                                isSunday
                                  ? { color: "var(--tally)" }
                                  : undefined
                              }
                            >
                              {d.labelShort}
                            </span>
                            <span className="mono text-xs">{d.dayNum}</span>
                          </div>
                          {resolvedWeek.planVersionsUsed.length > 1 && (
                            <div className="mono text-[10px] dim truncate">
                              v{d.planVersion}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {/* Team Rows (A–E and any added active teams) */}
                  {resolvedWeek.teamRows.map((row) => {
                    const isRosterSelected =
                      selectedRosterKey === row.team.id;
                    return (
                      <tr key={row.team.id}>
                        <td className="sticky-col w-[72px] min-w-[72px] max-w-[72px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px] p-1.5 sm:p-2.5 align-middle text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedRosterKey(row.team.id)}
                            className={`font-semibold hover:underline text-right ml-auto cursor-pointer block truncate text-xs sm:text-sm ${
                              isRosterSelected ? "underline" : ""
                            }`}
                          >
                            ทีม {row.team.name}
                          </button>
                          <div className="hidden sm:block dim text-xs truncate max-w-[115px] ml-auto">
                            {row.leadName.split(" ")[0]}
                          </div>
                        </td>

                        {groupConsecutiveCells(row.cells).map((group) => {
                          const firstCell = group.cells[0];
                          const hasToday = group.cells.some(
                            (c) => c.workDate === todayIso
                          );
                          const isWeekend =
                            group.cells.length === 1
                              ? group.cells[0].dayOfWeek === 0 ||
                                group.cells[0].dayOfWeek === 6
                              : group.cells.every(
                                  (c) =>
                                    c.dayOfWeek === 0 || c.dayOfWeek === 6
                                );
                          const targetDropCell =
                            isAdmin && pickedSlot !== null
                              ? group.cells.find(
                                  (c) => c.workDate === pickedSlot.workDate
                                ) ?? null
                              : null;
                          const canDropHere = targetDropCell !== null;
                          const dropClass = canDropHere
                            ? targetDropCell.isWorkingRegularOrReplaced
                              ? "drop-warn"
                              : "drop-ok"
                            : "";
                          const cellKey = `${row.team.id}-${firstCell.workDate}`;
                          const hoverClass =
                            dragHoverKey === cellKey ? "drop-hover" : "";
                          const hasPerDayExtras = group.cells.some(
                            (c) =>
                              c.addedShifts.length > 0 ||
                              c.specialSlots.length > 0
                          );
                          const endsOnSaturday =
                            group.cells[group.cells.length - 1].dayOfWeek === 6;

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
                              className={`p-1.5 align-middle space-y-1 ${
                                hasToday
                                  ? "today-cell"
                                  : isWeekend
                                  ? "weekend-cell"
                                  : ""
                              } ${endsOnSaturday ? "border-r-2" : ""} ${dropClass} ${hoverClass} ${
                                canDropHere ? "cursor-pointer" : ""
                              }`}
                              style={
                                endsOnSaturday
                                  ? { borderRightColor: "var(--line)" }
                                  : undefined
                              }
                            >
                              {firstCell.wasOffByOverride ? (
                                <span
                                  className="chip od-badge dim"
                                  style={{ borderColor: "var(--line)" }}
                                  title={firstCell.overrideReason}
                                >
                                  <b>หยุด (OD)</b>
                                  {firstCell.overrideReason && (
                                    <span className="block text-[10px] truncate">
                                      {firstCell.overrideReason}
                                    </span>
                                  )}
                                </span>
                              ) : (firstCell.baseShift || !hasPerDayExtras) ? (
                                <ShiftChip
                                  shift={firstCell.baseShift}
                                  spanDays={group.span}
                                />
                              ) : null}

                              {hasPerDayExtras && (
                                <div
                                  className={
                                    group.span > 1
                                      ? "grid gap-1.5"
                                      : "space-y-1"
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
                                    <div
                                      key={cell.workDate}
                                      className="space-y-1"
                                    >
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
                                              pickedSlot?.slotId === sp.slotId &&
                                                pickedSlot?.workDate === sp.workDate
                                                ? null
                                                : {
                                                    slotId: sp.slotId,
                                                    dayOfWeek: sp.dayOfWeek,
                                                    workDate: sp.workDate,
                                                  }
                                            );
                                          }}
                                          aria-pressed={
                                            pickedSlot?.slotId === sp.slotId &&
                                            pickedSlot?.workDate === sp.workDate
                                          }
                                          title={
                                            sp.overlapWarning
                                              ? "⚠ ซ้อนกะปกติ"
                                              : sp.multipleSpecialWarning
                                              ? "⚠ กะ OT 2 ครั้งในสัปดาห์"
                                              : undefined
                                          }
                                          className={`chip relative c-${
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
                                              className="no-print absolute top-0.5 right-1 dim px-1 hover:opacity-80 cursor-pointer"
                                            >
                                              ×
                                            </button>
                                          )}
                                          <b className="font-semibold block truncate leading-tight pr-4">
                                            {sp.shift.name}
                                          </b>
                                          <span className="mono text-[10px] tracking-tight block whitespace-nowrap leading-tight">
                                            {sp.shift.startTime}–{sp.shift.endTime}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Dedicated CAM3 Rows (per individual CAM3 employee) */}
                  {resolvedWeek.cam3Rows.map((cRow) => (
                    <tr key={`cam3-${cRow.employee.id}`}>
                      <td className="sticky-col w-[72px] min-w-[72px] max-w-[72px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px] p-1.5 sm:p-2.5 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRosterKey("CAM3")}
                          className={`font-semibold hover:underline text-right ml-auto cursor-pointer block truncate text-xs sm:text-sm ${
                            selectedRosterKey === "CAM3" ? "underline" : ""
                          }`}
                          title={`${cRow.employee.firstName} ${cRow.employee.lastName}`}
                        >
                          <span className="sm:hidden">
                            {cRow.employee.firstName}
                          </span>
                          <span className="hidden sm:inline">
                            {cRow.employee.firstName} {cRow.employee.lastName}
                          </span>
                        </button>
                      </td>
                      {groupConsecutiveCells(cRow.cells).map((group) => {
                        const firstCell = group.cells[0];
                        const hasToday = group.cells.some(
                          (c) => c.workDate === todayIso
                        );
                        const isWeekend =
                          group.cells.length === 1
                            ? group.cells[0].dayOfWeek === 0 ||
                              group.cells[0].dayOfWeek === 6
                            : group.cells.every(
                                (c) =>
                                  c.dayOfWeek === 0 || c.dayOfWeek === 6
                              );
                        const hasAdded = group.cells.some(
                          (c) => c.addedShifts.length > 0
                        );
                        const endsOnSaturday =
                          group.cells[group.cells.length - 1].dayOfWeek === 6;
                        return (
                          <td
                            key={firstCell.workDate}
                            colSpan={group.span}
                            className={`p-1.5 align-middle space-y-1 ${
                              hasToday
                                ? "today-cell"
                                : isWeekend
                                ? "weekend-cell"
                                : ""
                            } ${endsOnSaturday ? "border-r-2" : ""}`}
                            style={
                              endsOnSaturday
                                ? { borderRightColor: "var(--line)" }
                                : undefined
                            }
                          >
                            {firstCell.wasOffByOverride ? (
                              <span
                                className="chip od-badge dim"
                                style={{ borderColor: "var(--line)" }}
                                title={firstCell.overrideReason}
                              >
                                <b>หยุด (OD)</b>
                                {firstCell.overrideReason && (
                                  <span className="block text-[10px] truncate">
                                    {firstCell.overrideReason}
                                  </span>
                                )}
                              </span>
                            ) : (firstCell.baseShift || !hasAdded) ? (
                              <ShiftChip
                                shift={firstCell.baseShift}
                                spanDays={group.span}
                              />
                            ) : null}
                            {hasAdded && (
                              <div
                                className={
                                  group.span > 1
                                    ? "grid gap-1.5"
                                    : "space-y-1"
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
                                  <div
                                    key={cell.workDate}
                                    className="space-y-1"
                                  >
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
                    </tr>
                  ))}

                  {/* Special Shift Row (aligned horizontally with all days) */}
                  <tr>
                    <td
                      className="sticky-col w-[72px] min-w-[72px] max-w-[72px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px] p-1.5 sm:p-2.5 align-top text-right"
                      style={{ color: "var(--tally)" }}
                    >
                      <b className="text-xs sm:text-sm block">กะ OT</b>
                      <div className="hidden sm:block dim text-[11px]">
                        {isAdmin ? "ลากวาง / เลือกทีม" : "วันที่ 6 หมุนเวียน"}
                      </div>
                    </td>
                    {resolvedWeek.specialSlotsByDay.map((slots, dayIndex) => {
                      const d = resolvedWeek.days[dayIndex];
                      const isToday = d.date === todayIso;
                      const isSaturday = d.dayOfWeek === 6;
                      const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;
                      return (
                        <td
                          key={d.date}
                          className={`w-[72px] min-w-[72px] max-w-[72px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px] p-1.5 align-top space-y-1.5 ${
                            isToday
                              ? "today-cell"
                              : isWeekend
                              ? "weekend-cell"
                              : ""
                          } ${isSaturday ? "border-r-2" : ""}`}
                          style={
                            isSaturday
                              ? { borderRightColor: "var(--line)" }
                              : undefined
                          }
                        >
                          {slots.map((sp) => {
                            const isPicked =
                              pickedSlot?.slotId === sp.slotId &&
                              pickedSlot?.workDate === sp.workDate;
                            return (
                              <div key={sp.slotId} className="space-y-1">
                                {sp.assignedTeamId ? (
                                  <div className="text-xs dim">
                                    <span className="truncate block font-medium">
                                      {sp.shift.name}
                                    </span>
                                    <span>→ </span>
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
                                    title={
                                      isAdmin
                                        ? "ลากไปวางที่ทีม หรือเลือกด้านล่าง"
                                        : "รอจัดทีม"
                                    }
                                    className={`chip c-${
                                      sp.shift.color || "sp"
                                    } ${isAdmin ? "drag-chip" : ""}`}
                                  >
                                    <b className="font-semibold block truncate leading-tight">
                                      {sp.shift.name}
                                    </b>
                                    <span className="mono text-[10px] tracking-tight block whitespace-nowrap leading-tight">
                                      {sp.shift.startTime}–{sp.shift.endTime}
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
                                    className="no-print field w-full text-[11px] py-1 mt-1 truncate"
                                  >
                                    <option value="">— เลือกทีม —</option>
                                    {resolvedWeek.teamRows.map((tr) => {
                                      const isOff =
                                        !tr.cells[dayIndex]
                                          .isWorkingRegularOrReplaced;
                                      return (
                                        <option
                                          key={tr.team.id}
                                          value={tr.team.id}
                                        >
                                          ทีม {tr.team.name}{" "}
                                          {isOff ? "(หยุด)" : "(มีกะ)"}
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
                          <div className="flex items-center gap-1.5">
                            <span className="mono dim text-xs">
                              {cRow.employee.phone}
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartEditEmployee(cRow.employee)
                                }
                                className="dim hover:text-white text-[11px] px-1 rounded cursor-pointer"
                                title="แก้ไขข้อมูลพนักงาน"
                              >
                                ✎
                              </button>
                            )}
                          </div>
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
                                  <div className="flex items-center gap-1.5">
                                    <span className="mono dim text-xs">
                                      {m.employee.phone}
                                    </span>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleStartEditEmployee(m.employee)
                                        }
                                        className="dim hover:text-white text-[11px] px-1 rounded cursor-pointer"
                                        title="แก้ไขข้อมูลพนักงาน"
                                      >
                                        ✎
                                      </button>
                                    )}
                                  </div>
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
                <b>วิธีมอบหมายกะ OT  (วันที่ 6):</b> ลากกะ OT ไปวางที่ช่องของทีม
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
        </section>
      )}

      {/* ==================== 1.5. 6-WEEK SPECIAL SHIFT & OVERDRIVE PLANNER ==================== */}
      {isAdmin && activeTab === "special" && (() => {
        const sixWeeks = Array.from({ length: 6 }, (_, idx) =>
          resolveWeek(
            store,
            addDays(sixWeekStart, idx * 7),
            todayIso,
            resolvedWeek.fairness.periodMonths
          )
        );
        const sixWeekEnd = addDays(sixWeekStart, 41);
        const activeTeams = store.teams
          .filter((t) => t.active)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

        const isFullYear = resolvedWeek.fairness.periodMonths === 12;
        const yearEndIso = `${todayIso.slice(0, 4)}-12-31`;

        const teamHeaderStats = activeTeams.map((team) => {
          const fair = resolvedWeek.fairness.stats.find(
            (s) => s.teamId === team.id
          );
          const doneUpToToday = fair?.doneUpToToday ?? 0;
          const plannedSpecialAfterToday = store.specialAssignments.filter(
            (a) =>
              a.teamId === team.id &&
              a.workDate > todayIso &&
              (!isFullYear || a.workDate <= yearEndIso)
          ).length;
          const plannedOdAddAfterToday = store.overrides.filter(
            (o) =>
              !o.isCam3 &&
              o.teamId === team.id &&
              o.mode === "ADD" &&
              o.workDate > todayIso &&
              (!isFullYear || o.workDate <= yearEndIso)
          ).length;
          const plannedAfterToday =
            plannedSpecialAfterToday + plannedOdAddAfterToday;
          return {
            team,
            doneUpToToday,
            plannedAfterToday,
            total: doneUpToToday + plannedAfterToday,
          };
        });

        const minTotalStat =
          teamHeaderStats.length > 0
            ? Math.min(...teamHeaderStats.map((s) => s.total))
            : 0;

        const isFullMonthMode =
          sixWeekStart === getMonthSixWeekStart(sixWeekMonth);
        const isCrossMonthEndMode =
          sixWeekStart === getCrossMonthEndSixWeekStart(sixWeekMonth);

        return (
          <section className="space-y-3">
            {/* Pinned Compact Header: Controls + Cumulative/Planned Summary */}
            <div
              className="sticky top-0 z-20 panel px-3 py-2 space-y-1.5 shadow-md"
              style={{ background: "var(--panel)" }}
            >
              {/* Line 1: Compact 6-Week Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-ghost text-xs py-0.5 px-2"
                    onClick={() => {
                      const prevYm = shiftYearMonth(sixWeekMonth, -1);
                      setSixWeekMonth(prevYm);
                      setSixWeekStart(getMonthSixWeekStart(prevYm));
                    }}
                  >
                    ‹
                  </button>
                  <span className="mono font-semibold text-sm px-1">
                    {formatThaiYearMonth(sixWeekMonth)}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost text-xs py-0.5 px-2"
                    onClick={() => {
                      const nextYm = shiftYearMonth(sixWeekMonth, 1);
                      setSixWeekMonth(nextYm);
                      setSixWeekStart(getMonthSixWeekStart(nextYm));
                    }}
                  >
                    ›
                  </button>
                  <span className="mono dim hidden sm:inline">
                    ({formatThaiDateShort(sixWeekStart)} –{" "}
                    {formatThaiDateShort(sixWeekEnd)})
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSixWeekStart(getMonthSixWeekStart(sixWeekMonth))
                    }
                    className="px-2 py-0.5 rounded border cursor-pointer"
                    style={{
                      borderColor: isFullMonthMode
                        ? "var(--tally)"
                        : "var(--line)",
                      background: isFullMonthMode
                        ? "rgba(255,59,48,0.14)"
                        : "var(--panel2)",
                      color: isFullMonthMode ? "var(--ink)" : "var(--dim)",
                      fontWeight: isFullMonthMode ? 600 : 400,
                    }}
                  >
                    ทั้งเดือน
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSixWeekStart(
                        getCrossMonthEndSixWeekStart(sixWeekMonth)
                      )
                    }
                    className="px-2 py-0.5 rounded border cursor-pointer"
                    style={{
                      borderColor: isCrossMonthEndMode
                        ? "var(--tally)"
                        : "var(--line)",
                      background: isCrossMonthEndMode
                        ? "rgba(255,59,48,0.14)"
                        : "var(--panel2)",
                      color: isCrossMonthEndMode ? "var(--ink)" : "var(--dim)",
                      fontWeight: isCrossMonthEndMode ? 600 : 400,
                    }}
                  >
                    คร่อมสิ้นเดือน
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs py-0.5 px-1.5"
                    onClick={() => setSixWeekStart(addDays(sixWeekStart, -7))}
                    title="เลื่อนขึ้น 1 สัปดาห์"
                  >
                    -1 สัปดาห์
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs py-0.5 px-1.5"
                    onClick={() => setSixWeekStart(addDays(sixWeekStart, 7))}
                    title="เลื่อนลง 1 สัปดาห์"
                  >
                    +1 สัปดาห์
                  </button>
                </div>
              </div>

              {/* Line 2: Compact Cumulative & Planned Summary Bar */}
              <div
                className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t text-xs"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="dim">สะสม:</span>
                  <div
                    className="inline-flex rounded overflow-hidden border"
                    style={{ borderColor: "var(--line)" }}
                  >
                    {([3, 6, 12] as FairnessPeriod[]).map((m) => {
                      const selected =
                        resolvedWeek.fairness.periodMonths === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            navigateWeek(resolvedWeek.weekStart, m)
                          }
                          className="px-1.5 py-0.5 cursor-pointer text-[11px]"
                          style={{
                            background: selected
                              ? "var(--ink)"
                              : "transparent",
                            color: selected ? "var(--bg)" : "var(--dim)",
                            fontWeight: selected ? 600 : 400,
                          }}
                        >
                          {m === 12 ? "ปี" : `${m}ด.`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {teamHeaderStats.map((st) => {
                    const isLowest = st.total === minTotalStat;
                    return (
                      <span
                        key={st.team.id}
                        className="px-2 py-0.5 rounded border mono text-xs inline-flex items-center gap-1"
                        style={{
                          background: "var(--panel2)",
                          borderColor: isLowest
                            ? "rgba(62,207,142,0.55)"
                            : "var(--line)",
                        }}
                      >
                        <span className="font-sans font-semibold">
                          ทีม {st.team.name}
                        </span>
                        <b
                          style={{
                            color: isLowest ? "var(--ok)" : "var(--ink)",
                          }}
                          title="ยอดสะสมถึงวันนี้"
                        >
                          {st.doneUpToToday}
                        </b>
                        <span
                          style={{ color: "var(--am)" }}
                          title="ยอดที่จัดไว้ล่วงหน้า"
                        >
                          +{st.plannedAfterToday}
                        </span>
                      </span>
                    );
                  })}
                </div>

                <span className="dim text-[11px] ml-auto">
                  เลขหน้า = สะสมถึงวันนี้ ·{" "}
                  <span style={{ color: "var(--am)" }}>+หลัง</span> = จัดล่วงหน้า
                </span>
              </div>
            </div>

            {/* 3-Column Table: วันที่ | กะ OT  | เลือกทีมที่ว่าง (with Overdrive Separator Rows) */}
            <div className="panel overflow-x-auto">
              <table className="schedule-grid w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-1.5 sm:p-2.5 text-left dim font-normal w-[76px] sm:w-[135px]">
                      วันที่
                    </th>
                    <th className="p-1.5 sm:p-2.5 text-left dim font-normal">
                      กะ OT
                    </th>
                    <th className="p-1.5 sm:p-2.5 text-left dim font-normal w-[112px] sm:w-[210px]">
                      เลือกทีมว่าง
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const allItems: Array<
                      | {
                        kind: "SPECIAL";
                        date: string;
                        dow: number;
                        wk: ResolvedWeek;
                        slot: ResolvedWeek["specialSlotsByDay"][number][number];
                      }
                      | {
                        kind: "OVERDRIVE";
                        date: string;
                        dow: number;
                        ov: PlannerStoreData["overrides"][number];
                      }
                    > = [];

                    for (const wk of sixWeeks) {
                      for (let dow = 0; dow < 7; dow++) {
                        const d = wk.days[dow];
                        const dayOverrides = store.overrides.filter(
                          (o) => o.workDate === d.date
                        );
                        for (const ov of dayOverrides) {
                          allItems.push({
                            kind: "OVERDRIVE",
                            date: d.date,
                            dow,
                            ov,
                          });
                        }
                        for (const sp of wk.specialSlotsByDay[dow]) {
                          allItems.push({
                            kind: "SPECIAL",
                            date: d.date,
                            dow,
                            wk,
                            slot: sp,
                          });
                        }
                      }
                    }

                    if (allItems.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={3}
                            className="p-4 dim text-xs text-center"
                          >
                            ไม่มีกะ OT หรือ Overdrive ในช่วง 6 สัปดาห์นี้
                          </td>
                        </tr>
                      );
                    }

                    return allItems.map((item) => {
                      if (item.kind === "OVERDRIVE") {
                        const { ov, dow } = item;
                        const team = store.teams.find(
                          (t) => t.id === ov.teamId
                        );
                        const cam3Emp = ov.isCam3
                          ? store.employees.find((e) => e.id === ov.employeeId)
                          : undefined;
                        const st = store.shiftTypes.find(
                          (s) => s.id === ov.shiftTypeId
                        );
                        const modeLabel =
                          ov.mode === "ADD"
                            ? "Overdrive · เพิ่มกะ"
                            : ov.mode === "REPLACE"
                              ? "Overdrive · แทนที่กะ"
                              : "Overdrive · สั่งหยุด";
                        const targetLabel = ov.isCam3
                          ? cam3Emp
                            ? `${cam3Emp.firstName} ${cam3Emp.lastName}`
                            : "CAM3"
                          : `ทีม ${team?.name ?? "-"}`;
                        const shiftText =
                          ov.mode === "OFF"
                            ? "สั่งหยุดงาน"
                            : st
                              ? `${st.name} (${st.startTime}–${st.endTime})`
                              : `${ov.customStart}–${ov.customEnd}`;

                        return (
                          <tr
                            key={`od-${ov.id}`}
                            style={{
                              background: "rgba(255,59,48,0.07)",
                              height: "auto",
                            }}
                          >
                            <td className="p-1.5 sm:p-2 align-middle mono text-[11px] sm:text-xs leading-tight">
                              <b>{THAI_DAYS_SHORT[dow]}</b>{" "}
                              {
                                formatThaiDateShort(ov.workDate)
                                  .split(" ")
                                  .slice(0, 2)
                                  .join(" ")
                              }
                            </td>
                            <td
                              colSpan={2}
                              className="p-1.5 sm:p-2 align-middle text-xs"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className="px-1.5 py-0.5 rounded font-semibold text-[10px] sm:text-[11px]"
                                  style={{
                                    background: "rgba(255,59,48,0.18)",
                                    color: "var(--tally)",
                                  }}
                                >
                                  {modeLabel}
                                </span>
                                <b>{targetLabel}</b>
                                <span className="mono">{shiftText}</span>
                                {ov.reason && (
                                  <span className="dim">· {ov.reason}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const { slot: sp, wk } = item;
                      const isEndOfMonth = isLastDayOfMonth(sp.workDate);
                      const isFirstOfMonth = sp.workDate.slice(8, 10) === "01";
                      const shortDayMonth = formatThaiDateShort(sp.workDate)
                        .split(" ")
                        .slice(0, 2)
                        .join(" ");

                      // Filter only teams that are FREE (OFF) on this day (plus keep currently assigned team if any)
                      const availableTeams = wk.teamRows.filter((tr) => {
                        const isOff =
                          !tr.cells[sp.dayOfWeek].isWorkingRegularOrReplaced;
                        return isOff || tr.team.id === sp.assignedTeamId;
                      });

                      return (
                        <tr key={`sp-${sp.slotId}-${sp.workDate}`}>
                          <td className="p-1.5 sm:p-2.5 align-middle leading-tight">
                            <div className="font-semibold text-xs whitespace-nowrap">
                              {THAI_DAYS_SHORT[sp.dayOfWeek]}{" "}
                              <span className="mono">{shortDayMonth}</span>
                            </div>
                            {(isEndOfMonth || isFirstOfMonth) && (
                              <span
                                className="inline-block mt-0.5 text-[10px] px-1 py-0.5 rounded font-semibold"
                                style={{
                                  background: isEndOfMonth
                                    ? "rgba(242,179,61,0.18)"
                                    : "rgba(69,193,214,0.18)",
                                  color: isEndOfMonth
                                    ? "var(--am)"
                                    : "var(--pm)",
                                }}
                              >
                                {isEndOfMonth ? "สิ้นเดือน" : "ต้นเดือน"}
                              </span>
                            )}
                          </td>

                          <td className="p-1.5 sm:p-2 align-middle">
                            <div className="max-w-[240px]">
                              <ShiftChip shift={sp.shift} />
                            </div>
                          </td>

                          <td className="p-1.5 sm:p-2.5 align-middle">
                            <select
                              aria-label={`เลือกทีมที่ว่างสำหรับ ${sp.shift.name} วันที่ ${sp.workDate}`}
                              disabled={isPending}
                              value={sp.assignedTeamId ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleAssignSpecial(
                                  sp.slotId,
                                  sp.workDate,
                                  val ? Number(val) : null
                                );
                              }}
                              className="field w-full text-xs py-1.5 px-1.5 sm:px-2"
                              style={{
                                borderColor:
                                  sp.assignedTeamId !== null
                                    ? "rgba(62,207,142,0.6)"
                                    : "var(--line)",
                              }}
                            >
                              <option value="">
                                — ทีมว่าง ({availableTeams.length}) —
                              </option>
                              {availableTeams.map((tr) => {
                                const cell = tr.cells[sp.dayOfWeek];
                                const isOff =
                                  !cell.isWorkingRegularOrReplaced;
                                return (
                                  <option key={tr.team.id} value={tr.team.id}>
                                    ทีม {tr.team.name}
                                    {cell.wasOffByOverride
                                      ? " (OD หยุด)"
                                      : isOff
                                        ? ""
                                        : " (ติดกะ)"}
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {/* ==================== 2. MASTER-PLAN (ADMIN) ==================== */}
      {isAdmin && activeTab === "master" && (
        <section className="grid lg:grid-cols-[280px_1fr] gap-4">
          <div className="panel p-4">
            <h2 className="font-semibold mb-2">เวอร์ชันของ Master-plan</h2>
            <p className="dim text-xs mb-3">
              แผนที่ระบุวันเริ่มใช้แล้วจะมีผลต่อเนื่องในสัปดาห์ต่อๆ ไปจนกว่าจะมีแผนเวอร์ชันใหม่
              (รองรับการเริ่มใช้กลางสัปดาห์)
            </p>

            <button
              type="button"
              onClick={handleResetToNewPlan}
              className="btn-ghost w-full text-xs py-2 mb-3 border cursor-pointer rounded-md transition"
              style={{
                borderColor: !editingPlan ? "var(--am)" : "var(--line)",
                background: !editingPlan
                  ? "rgba(242,179,61,0.12)"
                  : "var(--panel2)",
                color: !editingPlan ? "var(--am)" : "var(--ink)",
                fontWeight: !editingPlan ? 600 : 400,
              }}
            >
              + สร้าง Master-plan เวอร์ชันใหม่ (v
              {store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) + 1}
              )
            </button>

            <ol className="space-y-2 text-sm">
              {[...store.masterPlans]
                .sort((a, b) => b.version - a.version)
                .map((p) => {
                  const isFuture = p.effectiveFrom > todayIso;
                  const isSelected = editingPlanId === p.id;
                  return (
                    <li
                      key={p.id}
                      onClick={() => loadPlanIntoEditor(p.id)}
                      className="p-3 rounded-md cursor-pointer transition border"
                      style={{
                        background: isSelected
                          ? "var(--panel)"
                          : "var(--panel2)",
                        borderColor: isSelected
                          ? "var(--am)"
                          : "transparent",
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <b>Master-plan v{p.version}</b>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: isFuture
                              ? "rgba(242,179,61,0.18)"
                              : "rgba(62,207,142,0.18)",
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
                      <div
                        className="flex items-center justify-between mt-2 pt-1.5 border-t text-[11px]"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <span className="dim">
                          {isFuture
                            ? isSelected
                              ? "กำลังแก้ไข ✎"
                              : "✎ คลิกเพื่อแก้ไขแผนนี้"
                            : "คลิกเพื่อคัดลอกโครงร่าง"}
                        </span>
                        {isFuture && store.masterPlans.length > 1 && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFuturePlan(p.id, p.version);
                            }}
                            className="text-[11px] dim hover:text-red-400 cursor-pointer"
                            title="ลบแผนที่ยังไม่เริ่มใช้นี้"
                          >
                            ลบแผน
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ol>
          </div>

          <form onSubmit={handleSaveMasterPlan} className="panel p-4 space-y-4">
            {editingPlan ? (
              <div
                className="p-3 rounded-md border flex flex-wrap items-center justify-between gap-3"
                style={{
                  background: "rgba(242,179,61,0.08)",
                  borderColor: "var(--am)",
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={{
                        background: "var(--am)",
                        color: "#000",
                      }}
                    >
                      กำลังแก้ไข Master-plan v{editingPlan.version}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--am)" }}
                    >
                      (สถานะ: รอเริ่มใช้งาน)
                    </span>
                  </div>
                  <p className="dim text-xs mt-1">
                    การบันทึกจะอัปเดตข้อมูลของ v{editingPlan.version} โดยตรง โดยไม่สร้างเวอร์ชันใหม่
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetToNewPlan}
                  className="btn-ghost text-xs py-1 px-2.5 border"
                  style={{ borderColor: "var(--line)" }}
                >
                  สลับเป็นสร้างเวอร์ชันใหม่ (v
                  {store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) +
                    1}
                  ) →
                </button>
              </div>
            ) : (
              <div>
                <h2 className="font-semibold text-base">
                  สร้าง Master-plan เวอร์ชันใหม่ (v
                  {store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) +
                    1}
                  )
                </h2>
                <p className="dim text-xs mt-0.5">
                  เลือกวันเริ่มใช้แผนได้ทุกวัน (รวมถึงกลางสัปดาห์)
                  ระบบจะสลับใช้แผนใหม่ตั้งแต่วันที่กำหนดโดยอัตโนมัติ
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <label>
                  {editingPlan ? "วันเริ่มใช้แผน (อนาคต)" : "วันเริ่มใช้แผนใหม่"}
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
                    <th className="p-2 text-right dim font-normal">ทีม / แถว</th>
                    {THAI_DAYS_SHORT.map((d, idx) => (
                      <th key={idx} className="p-2 text-left dim font-normal">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {store.teams
                    .filter((t) => t.active)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((team) => {
                      return (
                        <tr key={team.id}>
                          <td className="p-2 font-semibold text-right">
                            ทีม {team.name}
                          </td>
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
                        </tr>
                      );
                    })}

                  {/* Individual CAM3 employee rows in Master-plan */}
                  {cam3Employees.map((emp) => {
                    return (
                      <tr key={`mp-cam3-${emp.id}`}>
                        <td className="p-2 font-semibold text-right">
                          {emp.firstName} {emp.lastName}
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
                    กะ OT ประจำใน Master-plan (ปกติ 2 กะต่อสัปดาห์)
                  </h3>
                  <p className="dim text-xs">
                    ระบุเฉพาะวันและรูปแบบกะ OT  (ไม่ผูกทีมตายตัว)
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
                  + เพิ่มกะ OT ประจำ
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

            {editingPlan ? (
              <div
                className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t"
                style={{ borderColor: "var(--line)" }}
              >
                {store.masterPlans.length > 1 ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleDeleteFuturePlan(editingPlan.id, editingPlan.version)
                    }
                    className="btn-ghost text-xs px-3 py-1.5 hover:text-red-400 cursor-pointer"
                    style={{ color: "var(--tally)" }}
                  >
                    ลบแผน v{editingPlan.version} นี้
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetToNewPlan}
                    className="btn-ghost text-xs px-3 py-1.5 cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="btn text-xs font-semibold px-4 py-2 cursor-pointer"
                    style={{ background: "var(--am)", color: "#000" }}
                  >
                    บันทึกการแก้ไข Master-plan v{editingPlan.version}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={isPending} className="btn">
                  บันทึกเป็น Master-plan เวอร์ชันใหม่ (v
                  {store.masterPlans.reduce((m, p) => Math.max(m, p.version), 0) + 1}
                  )
                </button>
              </div>
            )}
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
                <option value="ADD">เพิ่มกะ OT เฉพาะกิจ (ทำงานเพิ่ม)</option>
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
                            className="dim text-xs hover:opacity-80 cursor-pointer"
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
                        background: selected ? `${c.hex}22` : "var(--panel2)",
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {store.shiftTypes
                  .filter((st) => st.active)
                  .map((st) => {
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
                          <ShiftChip
                            shift={{
                              name: st.name,
                              startTime: st.startTime,
                              endTime: st.endTime,
                              color: st.color,
                              kind: st.kind,
                              hours,
                              isOvernight,
                            }}
                            extraClass="inline-block"
                          />
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
                          {st.kind === "SPECIAL" ? "กะ OT " : "กะปกติ"}
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
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() =>
                              startTransition(async () => {
                                await removeShiftTypeAction(st.id);
                                router.refresh();
                              })
                            }
                            className="dim text-xs hover:opacity-80 cursor-pointer"
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
              ref={employeeFormRef}
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const pos = store.positions.find(
                    (p) => p.id === empPositionId
                  );
                  await saveEmployeeAction({
                    id: editingEmpId ?? undefined,
                    firstName: empFirstName,
                    lastName: empLastName,
                    phone: empPhone,
                    positionId: empPositionId,
                    teamId: pos?.isSpecial ? null : empTeamId,
                  });
                  setEditingEmpId(null);
                  setEmpFirstName("");
                  setEmpLastName("");
                  setEmpPhone("");
                  router.refresh();
                });
              }}
              className="panel p-4 grid sm:grid-cols-6 gap-2.5 items-end text-sm"
              style={{
                borderColor: editingEmpId ? "var(--am)" : undefined,
                background: editingEmpId ? "rgba(242,179,61,0.04)" : undefined,
              }}
            >
              {editingEmpId && (
                <div
                  className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2 pb-2 mb-1 border-b"
                  style={{ borderColor: "var(--line)" }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={{
                        background: "rgba(242,179,61,0.18)",
                        color: "var(--am)",
                      }}
                    >
                      โหมดแก้ไขข้อมูลพนักงาน
                    </span>
                    <span className="font-semibold text-xs sm:text-sm">
                      {empFirstName} {empLastName}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelEditEmployee}
                    className="btn-ghost text-xs py-0.5 px-2"
                  >
                    ยกเลิกการแก้ไข (สลับเป็นเพิ่มใหม่)
                  </button>
                </div>
              )}
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
              <div className="sm:col-span-1 flex gap-1.5">
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn flex-1 text-xs"
                >
                  {editingEmpId ? "บันทึกแก้ไข" : "+ เพิ่มพนักงาน"}
                </button>
                {editingEmpId && (
                  <button
                    type="button"
                    onClick={handleCancelEditEmployee}
                    className="btn-ghost text-xs px-2"
                    title="ยกเลิกการแก้ไข"
                  >
                    ✕
                  </button>
                )}
              </div>
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
                          className="border-t transition"
                          style={{
                            borderColor: "var(--line)",
                            background:
                              editingEmpId === emp.id
                                ? "rgba(242,179,61,0.12)"
                                : undefined,
                          }}
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
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEditEmployee(emp)}
                                className="text-xs px-2 py-0.5 rounded font-medium cursor-pointer border hover:opacity-90"
                                style={{
                                  borderColor:
                                    editingEmpId === emp.id
                                      ? "var(--am)"
                                      : "var(--line)",
                                  background:
                                    editingEmpId === emp.id
                                      ? "rgba(242,179,61,0.2)"
                                      : "var(--panel2)",
                                  color:
                                    editingEmpId === emp.id
                                      ? "var(--am)"
                                      : "var(--ink)",
                                }}
                              >
                                {editingEmpId === emp.id ? "กำลังแก้ไข" : "แก้ไข"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  startTransition(async () => {
                                    if (editingEmpId === emp.id) {
                                      handleCancelEditEmployee();
                                    }
                                    await removeEmployeeAction(emp.id);
                                    router.refresh();
                                  })
                                }
                                className="dim text-xs hover:opacity-80 cursor-pointer"
                              >
                                นำออก
                              </button>
                            </div>
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
                        <th className="p-2 text-right dim font-normal">
                          ทีม / แถว
                        </th>
                        {snap.data.days.map((d) => (
                          <th
                            key={d.date}
                            className="p-2 text-left dim font-normal"
                          >
                            {d.labelShort} <span className="mono">{d.dayNum}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {snap.data.teamRows.map((tr) => (
                        <tr key={tr.team.id}>
                          <td className="p-2 font-semibold text-right">
                            ทีม {tr.team.name}
                            <div className="dim text-xs font-normal">
                              {tr.leadName.split(" ")[0]}
                            </div>
                          </td>
                          {groupConsecutiveCells(tr.cells).map((group) => {
                            const firstCell = group.cells[0];
                            const hasExtras = group.cells.some(
                              (c) =>
                                c.addedShifts.length > 0 ||
                                c.specialSlots.length > 0
                            );
                            return (
                              <td
                                key={firstCell.workDate}
                                colSpan={group.span}
                                className="p-1.5 space-y-1"
                              >
                                {(firstCell.baseShift || !hasExtras) && (
                                  <ShiftChip
                                    shift={firstCell.baseShift}
                                    spanDays={group.span}
                                  />
                                )}
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
                        </tr>
                      ))}
                      {(snap.data.cam3Rows ?? []).map((cRow) => (
                        <tr key={`snap-cam3-${cRow.employee.id}`}>
                          <td className="p-2 font-semibold text-right">
                            {cRow.employee.firstName} {cRow.employee.lastName}
                          </td>
                          {groupConsecutiveCells(cRow.cells).map((group) => {
                            const firstCell = group.cells[0];
                            const hasExtras = group.cells.some(
                              (c) => c.addedShifts.length > 0
                            );
                            return (
                              <td
                                key={firstCell.workDate}
                                colSpan={group.span}
                                className="p-1.5 space-y-1"
                              >
                                {(firstCell.baseShift || !hasExtras) && (
                                  <ShiftChip
                                    shift={firstCell.baseShift}
                                    spanDays={group.span}
                                  />
                                )}
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
                className="dim hover:opacity-80 cursor-pointer"
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
      {/* ==================== A3 EXPORT MODAL ==================== */}
      {showExportModal && (() => {
        const exportFirstIso = `${exportYm}-01`;
        const fiveWeekStart = getSundayOfWeek(exportFirstIso);
        const fiveWeekEnd = addDays(fiveWeekStart, 34);
        const upperResolved = resolveDateRange(store, fiveWeekStart, 21, todayIso);
        const lowerStart = addDays(fiveWeekStart, 21);
        const lowerResolved = resolveDateRange(store, lowerStart, 14, todayIso);

        const cam3List = store.employees
          .filter((e) => {
            if (!e.active) return false;
            const pos = store.positions.find((p) => p.id === e.positionId);
            return Boolean(pos?.isSpecial || e.teamId === null);
          })
          .sort((a, b) => a.id - b.id);

        function getPositionShortLabel(posName?: string): string {
          if (!posName) return "";
          if (posName.includes("Technician Director")) return "TD";
          if (posName.includes("Sound")) return "Sound";
          if (posName.includes("Play Out")) return "Play Out";
          if (posName.includes("CG")) return "CG";
          if (posName.includes("CAM 1")) return "CAM 1";
          if (posName.includes("CAM 2")) return "CAM 2";
          if (posName.includes("CAM3-กะปกติ")) return "CAM 3";
          if (posName.includes("CAM3")) return "CAM 3";
          return posName;
        }

        function renderExportTable(
          resolved: ResolvedWeek,
          tableTitle: string,
          weekSubtitle: string
        ) {
          return (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1 px-1">
                <span>{tableTitle}</span>
                <span className="text-slate-500 font-normal">{weekSubtitle}</span>
              </div>
              <table
                className="w-full text-xs border-collapse"
                style={{ tableLayout: "fixed" }}
              >
                <thead>
                  <tr className="bg-slate-100 border-y border-slate-300">
                    <th
                      className="w-[68px] min-w-[68px] max-w-[68px] p-1 text-right pr-2 font-semibold text-slate-700 border-r-2 border-slate-300"
                      style={{ borderLeft: "1px solid #cbd5e1" }}
                    >
                      ทีม
                    </th>
                    {resolved.days.map((d) => {
                      const isSunday = d.dayOfWeek === 0;
                      const isSaturday = d.dayOfWeek === 6;
                      const isWeekend = isSunday || isSaturday;
                      const isDifferentMonth = d.date.slice(0, 7) !== exportYm;
                      return (
                        <th
                          key={d.date}
                          className={`p-1 text-center font-normal border-r border-slate-300 ${
                            isWeekend ? "bg-slate-200/60" : "bg-slate-50"
                          } ${isSaturday ? "border-r-2 border-r-slate-400" : ""}`}
                        >
                          <div
                            className={`font-semibold leading-tight ${
                              isSunday ? "text-red-600" : "text-slate-700"
                            }`}
                          >
                            {d.labelShort}
                          </div>
                          <div className="mono font-bold text-slate-900 leading-tight">
                            {d.dayNum}
                          </div>
                          {isDifferentMonth && (
                            <div className="text-[9px] text-slate-400 leading-none">
                              {THAI_MONTHS_SHORT[Number(d.date.slice(5, 7)) - 1]}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Team Rows */}
                  {resolved.teamRows.map((row) => (
                    <tr key={row.team.id} className="border-b border-slate-200">
                      <td
                        className="w-[68px] min-w-[68px] max-w-[68px] p-1 text-right pr-2 font-bold text-slate-900 bg-slate-50 border-r-2 border-slate-300 align-middle"
                        style={{ borderLeft: "1px solid #cbd5e1" }}
                      >
                        <div>ทีม {row.team.name}</div>
                        <div className="text-[10px] font-normal text-slate-500 truncate">
                          {row.leadName.split(" ")[0]}
                        </div>
                      </td>
                      {groupConsecutiveCells(row.cells).map((group) => {
                        const firstCell = group.cells[0];
                        const isWeekend =
                          group.cells.length === 1
                            ? group.cells[0].dayOfWeek === 0 ||
                              group.cells[0].dayOfWeek === 6
                            : group.cells.every(
                                (c) => c.dayOfWeek === 0 || c.dayOfWeek === 6
                              );
                        const endsOnSaturday =
                          group.cells[group.cells.length - 1].dayOfWeek === 6;
                        const hasPerDayExtras = group.cells.some(
                          (c) =>
                            c.addedShifts.length > 0 || c.specialSlots.length > 0
                        );
                        return (
                          <td
                            key={firstCell.workDate}
                            colSpan={group.span}
                            className={`p-[2px] align-middle border-r border-slate-200 ${
                              isWeekend ? "bg-slate-100/50" : ""
                            } ${
                              endsOnSaturday
                                ? "border-r-2 border-r-slate-400"
                                : ""
                            }`}
                          >
                            {firstCell.wasOffByOverride ? (
                              <div className="rounded border border-slate-300 bg-slate-100 p-0.5 text-center">
                                <span className="font-semibold text-slate-500 text-[9px]">
                                  หยุด (OD)
                                </span>
                              </div>
                            ) : firstCell.baseShift || !hasPerDayExtras ? (
                              (() => {
                                const shift = firstCell.baseShift;
                                if (!shift) {
                                  return (
                                    <div className="text-center text-slate-400 text-xs py-1">
                                      — หยุด
                                    </div>
                                  );
                                }
                                const meta = getShiftColorMeta(shift.color);
                                if (group.span === 1) {
                                  return (
                                    <div
                                      className="rounded px-0.5 py-0.5 flex flex-col items-center justify-center text-center leading-none overflow-hidden"
                                      style={{
                                        backgroundColor: `${meta.hex}18`,
                                        border: `1px solid ${meta.hex}60`,
                                        borderLeft: `3px solid ${meta.hex}`,
                                      }}
                                    >
                                      <span className="font-bold text-slate-900 text-[10px] leading-tight truncate max-w-full">
                                        {shift.name}
                                      </span>
                                      <span className="text-[8px] font-medium text-slate-600 leading-tight whitespace-nowrap tracking-tight tabular-nums mt-0.5">
                                        {shift.startTime}–{shift.endTime}
                                      </span>
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    className="rounded px-1.5 py-1 flex items-center gap-1.5 overflow-hidden"
                                    style={{
                                      backgroundColor: `${meta.hex}18`,
                                      border: `1px solid ${meta.hex}60`,
                                      borderLeft: `3.5px solid ${meta.hex}`,
                                    }}
                                  >
                                    <span className="font-bold text-slate-900 text-xs shrink-0">
                                      {shift.name}
                                    </span>
                                    <span className="text-[9px] font-medium text-slate-600 tracking-tight tabular-nums whitespace-nowrap">
                                      {shift.startTime}–{shift.endTime}
                                    </span>
                                  </div>
                                );
                              })()
                            ) : null}

                            {hasPerDayExtras && (
                              <div
                                className={
                                  group.span > 1
                                    ? "grid gap-1 mt-0.5"
                                    : "space-y-0.5 mt-0.5"
                                }
                                style={
                                  group.span > 1
                                    ? {
                                        gridTemplateColumns: `repeat(${group.span}, minmax(0, 1fr))`,
                                      }
                                    : undefined
                                }
                              >
                                {group.cells.map((c) => (
                                  <div key={c.workDate} className="space-y-0.5">
                                    {c.addedShifts.map((ad, idx) => {
                                      const meta = getShiftColorMeta(ad.color);
                                      return (
                                        <div
                                          key={idx}
                                          className="rounded px-0.5 py-0.5 text-[8.5px] font-semibold text-center leading-tight"
                                          style={{
                                            backgroundColor: `${meta.hex}22`,
                                            border: `1px solid ${meta.hex}60`,
                                            borderLeft: `2.5px solid ${meta.hex}`,
                                          }}
                                        >
                                          <div className="truncate">{ad.name}</div>
                                          <div className="text-[7.5px] font-medium text-slate-600 tracking-tight tabular-nums whitespace-nowrap">
                                            {ad.startTime}–{ad.endTime}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {c.specialSlots.map((sp) => (
                                      <div
                                        key={sp.slotId}
                                        className="rounded px-0.5 py-0.5 bg-red-50 border border-red-300 text-red-700 flex flex-col items-center justify-center text-center leading-none"
                                      >
                                        <div className="flex items-center gap-0.5 leading-tight">
                                          <span className="text-[7.5px] bg-red-600 text-white px-0.5 rounded-xs uppercase leading-none py-0.5 font-bold shrink-0">
                                            OT
                                          </span>
                                          <span className="font-bold text-[9px] truncate max-w-[46px]">
                                            {sp.shift.name}
                                          </span>
                                        </div>
                                        <span className="text-[7.5px] font-medium text-red-600 leading-tight whitespace-nowrap tracking-tight tabular-nums mt-0.5">
                                          {sp.shift.startTime}–{sp.shift.endTime}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* CAM3 Rows */}
                  {resolved.cam3Rows.map((cRow) => (
                    <tr
                      key={`cam3-${cRow.employee.id}`}
                      className="border-b border-slate-200"
                    >
                      <td
                        className="w-[68px] min-w-[68px] max-w-[68px] p-1 text-right pr-2 font-bold text-slate-800 bg-slate-50 border-r-2 border-slate-300 align-middle"
                        style={{ borderLeft: "1px solid #cbd5e1" }}
                      >
                        <div className="truncate">{cRow.employee.firstName}</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          CAM3
                        </div>
                      </td>
                      {groupConsecutiveCells(cRow.cells).map((group) => {
                        const firstCell = group.cells[0];
                        const isWeekend =
                          group.cells.length === 1
                            ? group.cells[0].dayOfWeek === 0 ||
                              group.cells[0].dayOfWeek === 6
                            : group.cells.every(
                                (c) => c.dayOfWeek === 0 || c.dayOfWeek === 6
                              );
                        const endsOnSaturday =
                          group.cells[group.cells.length - 1].dayOfWeek === 6;
                        const hasAdded = group.cells.some(
                          (c) => c.addedShifts.length > 0
                        );
                        return (
                          <td
                            key={firstCell.workDate}
                            colSpan={group.span}
                            className={`p-[2px] align-middle border-r border-slate-200 ${
                              isWeekend ? "bg-slate-100/50" : ""
                            } ${
                              endsOnSaturday
                                ? "border-r-2 border-r-slate-400"
                                : ""
                            }`}
                          >
                            {firstCell.wasOffByOverride ? (
                              <div className="rounded border border-slate-300 bg-slate-100 p-0.5 text-center">
                                <span className="font-semibold text-slate-500 text-[9px]">
                                  หยุด (OD)
                                </span>
                              </div>
                            ) : firstCell.baseShift || !hasAdded ? (
                              (() => {
                                const shift = firstCell.baseShift;
                                if (!shift) {
                                  return (
                                    <div className="text-center text-slate-400 text-xs py-1">
                                      — หยุด
                                    </div>
                                  );
                                }
                                const meta = getShiftColorMeta(shift.color);
                                if (group.span === 1) {
                                  return (
                                    <div
                                      className="rounded px-0.5 py-0.5 flex flex-col items-center justify-center text-center leading-none overflow-hidden"
                                      style={{
                                        backgroundColor: `${meta.hex}18`,
                                        border: `1px solid ${meta.hex}60`,
                                        borderLeft: `3px solid ${meta.hex}`,
                                      }}
                                    >
                                      <span className="font-bold text-slate-900 text-[10px] leading-tight truncate max-w-full">
                                        {shift.name}
                                      </span>
                                      <span className="text-[8px] font-medium text-slate-600 leading-tight whitespace-nowrap tracking-tight tabular-nums mt-0.5">
                                        {shift.startTime}–{shift.endTime}
                                      </span>
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    className="rounded px-1.5 py-1 flex items-center gap-1.5 overflow-hidden"
                                    style={{
                                      backgroundColor: `${meta.hex}18`,
                                      border: `1px solid ${meta.hex}60`,
                                      borderLeft: `3.5px solid ${meta.hex}`,
                                    }}
                                  >
                                    <span className="font-bold text-slate-900 text-xs shrink-0">
                                      {shift.name}
                                    </span>
                                    <span className="text-[9px] font-medium text-slate-600 tracking-tight tabular-nums whitespace-nowrap">
                                      {shift.startTime}–{shift.endTime}
                                    </span>
                                  </div>
                                );
                              })()
                            ) : null}

                            {hasAdded && (
                              <div
                                className={
                                  group.span > 1
                                    ? "grid gap-1 mt-0.5"
                                    : "space-y-0.5 mt-0.5"
                                }
                                style={
                                  group.span > 1
                                    ? {
                                        gridTemplateColumns: `repeat(${group.span}, minmax(0, 1fr))`,
                                      }
                                    : undefined
                                }
                              >
                                {group.cells.map((c) => (
                                  <div key={c.workDate}>
                                    {c.addedShifts.map((ad, idx) => {
                                      const meta = getShiftColorMeta(ad.color);
                                      return (
                                        <div
                                          key={idx}
                                          className="rounded px-0.5 py-0.5 text-[8.5px] font-semibold text-center leading-tight"
                                          style={{
                                            backgroundColor: `${meta.hex}22`,
                                            border: `1px solid ${meta.hex}60`,
                                            borderLeft: `2.5px solid ${meta.hex}`,
                                          }}
                                        >
                                          <div className="truncate">{ad.name}</div>
                                          <div className="text-[7.5px] font-medium text-slate-600 tracking-tight tabular-nums whitespace-nowrap">
                                            {ad.startTime}–{ad.endTime}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div
            className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-xs text-slate-100"
            role="dialog"
            aria-modal="true"
            aria-label="ส่งออกตารางกะ A3"
          >
            {/* Top Action Bar */}
            <div className="no-print h-14 bg-slate-900 border-b border-slate-700 px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-sm sm:text-base flex items-center gap-2">
                  <span>ส่งออกตารางกะการทำงาน (A3 Landscape)</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 mono">
                    A3: 420 × 297 mm
                  </span>
                </h2>
                {/* Month Selector in Modal */}
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-md p-0.5 text-xs">
                  <button
                    type="button"
                    className="px-2 py-1 hover:bg-slate-700 rounded cursor-pointer"
                    onClick={() => setExportYm(shiftYearMonth(exportYm, -1))}
                    title="เดือนก่อนหน้า"
                  >
                    ‹
                  </button>
                  <span className="px-2 font-medium">
                    {formatThaiYearMonth(exportYm)}
                  </span>
                  <button
                    type="button"
                    className="px-2 py-1 hover:bg-slate-700 rounded cursor-pointer"
                    onClick={() => setExportYm(shiftYearMonth(exportYm, 1))}
                    title="เดือนถัดไป"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-slate-400 hover:text-white rounded cursor-pointer"
                    onClick={() => setExportYm(todayIso.slice(0, 7))}
                  >
                    เดือนนี้
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintA3}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 cursor-pointer flex items-center gap-1.5"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  <span>สั่งพิมพ์ (Print)</span>
                </button>
                <button
                  type="button"
                  disabled={isDownloadingA3}
                  onClick={handleDownloadA3Image}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  {isDownloadingA3 ? (
                    <>
                      <svg
                        className="animate-spin w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      <span>กำลังสร้างรูปภาพ...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      <span>ดาวน์โหลดรูปภาพ PNG (A3)</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExportModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer ml-1"
                  title="ปิด"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable Canvas Area */}
            <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center bg-slate-950">
              <div
                ref={a3ExportRef}
                id="a3-export-sheet"
                className="w-[1580px] min-w-[1580px] min-h-[1118px] bg-white text-slate-800 p-6 shadow-2xl rounded-sm flex flex-col justify-between"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                }}
              >
                {/* Header */}
                <div className="border-b-2 border-slate-800 pb-3 mb-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        ตารางกะการทำงาน {formatThaiMonthYearFull(exportYm)}
                      </h1>
                      <p className="text-xs text-slate-600 mt-0.5">
                        ช่วงวันที่ {formatThaiDateShort(fiveWeekStart)} –{" "}
                        {formatThaiDateShort(fiveWeekEnd)} (ตาราง 5 สัปดาห์ · รวม 35 วัน)
                        {upperResolved.planVersionsUsed.length > 0 && (
                          <span className="ml-2 text-slate-500">
                            · Master-plan v
                            {upperResolved.planVersionsUsed
                              .map((p) => p.version)
                              .join(", v")}
                          </span>
                        )}
                      </p>
                    </div>
                    {/* OT Shifts Fairness Stats for Full Year */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-xs bg-red-500" />
                        กะ OT สะสมทั้งปี:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {upperResolved.fairness.stats.map((st) => (
                          <span
                            key={st.teamId}
                            className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 text-xs font-medium"
                          >
                            ทีม {st.teamName}:{" "}
                            <b className="font-bold text-red-600 mono">
                              {st.doneUpToToday}
                            </b>
                            {st.plannedAfterToday > 0 && (
                              <span
                                className="text-amber-600 mono text-[10px]"
                                title="มอบหมายล่วงหน้า (ยังไม่ถึงวัน)"
                              >
                                {" "}+{st.plannedAfterToday}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Content: Full-width Upper Table (3 Weeks / 21 Days) */}
                <div className="w-full mb-2">
                  {renderExportTable(
                    upperResolved,
                    "สัปดาห์ที่ 1 – 3",
                    `${formatThaiDateShort(fiveWeekStart)} – ${formatThaiDateShort(
                      addDays(fiveWeekStart, 20)
                    )} (21 วัน)`
                  )}
                </div>

                {/* Middle Row: Lower Table (14 Days) on Left + CAM3 & Shift Times on Right */}
                <div className="flex gap-3 items-start w-full mb-2">
                  {/* Lower Table: 2 Weeks (14 Days) */}
                  <div className="w-[1044px] shrink-0">
                    {renderExportTable(
                      lowerResolved,
                      "สัปดาห์ที่ 4 – 5",
                      `${formatThaiDateShort(
                        lowerStart
                      )} – ${formatThaiDateShort(fiveWeekEnd)} (14 วัน)`
                    )}
                  </div>

                  {/* Beside Lower Table: CAM3 Roster & Shift Times */}
                  <div className="w-[476px] shrink-0 space-y-2">
                    {/* CAM3 Staff Card */}
                    <div className="border border-slate-200 rounded-md bg-slate-50/80 p-2.5">
                      <div className="font-bold text-xs text-slate-900 pb-1 border-b border-slate-200 flex justify-between items-center">
                        <span>พนักงานกลุ่มเฉพาะ CAM3</span>
                        <span className="text-[10px] font-normal text-slate-500">
                          กะหมุนเวียน/พิเศษ
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-1 text-[11px]">
                        {cam3List.map((emp) => (
                          <div
                            key={emp.id}
                            className="flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-800">
                              {emp.firstName} {emp.lastName}
                            </span>
                            <span className="mono text-[11px] text-slate-600">
                              {emp.phone || "—"}
                            </span>
                          </div>
                        ))}
                        {cam3List.length === 0 && (
                          <div className="text-slate-400 text-[10px] italic">
                            ไม่มีพนักงาน CAM3
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Shift Times Card */}
                    <div className="border border-slate-200 rounded-md bg-slate-50/80 p-2.5">
                      <div className="font-bold text-xs text-slate-900 pb-1 border-b border-slate-200">
                        ตารางเวลากะการทำงาน (Shift Times)
                      </div>
                      <div className="mt-1.5 space-y-1 text-[11px]">
                        {store.shiftTypes
                          .filter((s) => s.active)
                          .map((s) => {
                            const meta = getShiftColorMeta(s.color);
                            return (
                              <div
                                key={s.id}
                                className="flex items-center justify-between"
                              >
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-xs"
                                    style={{ backgroundColor: meta.hex }}
                                  />
                                  <span className="font-medium text-slate-800">
                                    {s.name}
                                  </span>
                                </span>
                                <span className="mono text-slate-600">
                                  {s.startTime} – {s.endTime} น.
                                </span>
                              </div>
                            );
                          })}
                        <div className="flex items-center justify-between text-slate-500 pt-0.5 border-t border-slate-200">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-xs bg-slate-300" />
                            <span>วันหยุดประจำสัปดาห์</span>
                          </span>
                          <span>—</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Team Rosters & Contact Phone Numbers (Teams A–E) in 5 Columns */}
                <div className="w-full mt-1 pt-2 border-t border-slate-300">
                  <div className="pb-1.5 flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">
                      รายชื่อทีมและหมายเลขติดต่อ (Teams A–E)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      พนักงานประจำทีมและตำแหน่ง
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-2.5">
                    {store.teams
                      .filter((t) => t.active)
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((team) => {
                        const teamEmployees = store.employees
                          .filter((e) => e.active && e.teamId === team.id)
                          .map((e) => ({
                            employee: e,
                            position: store.positions.find(
                              (p) => p.id === e.positionId
                            ),
                          }))
                          .sort(
                            (a, b) =>
                              (a.position?.sortOrder ?? 99) -
                              (b.position?.sortOrder ?? 99)
                          );
                        const lead = teamEmployees.find(
                          (m) => m.position?.isLead
                        );
                        return (
                          <div
                            key={team.id}
                            className="border border-slate-200 rounded-md bg-slate-50/80 p-2"
                          >
                            <div className="flex items-center justify-between pb-1 border-b border-slate-200 text-xs">
                              <span className="font-bold text-slate-900">
                                ทีม {team.name}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {lead
                                  ? `หัวหน้า: ${lead.employee.firstName}`
                                  : ""}
                              </span>
                            </div>
                            <div className="mt-1 space-y-0.5 text-[11px]">
                              {teamEmployees.map(({ employee, position }) => (
                                <div
                                  key={employee.id}
                                  className="flex items-center justify-between gap-1 leading-tight"
                                >
                                  <span className="text-slate-400 text-[9px] w-10 shrink-0 truncate font-normal">
                                    {getPositionShortLabel(position?.name)}
                                  </span>
                                  <span
                                    className={`truncate flex-1 min-w-0 ${
                                      position?.isLead
                                        ? "font-bold text-slate-900"
                                        : "text-slate-700"
                                    }`}
                                    title={`${employee.firstName} ${employee.lastName}`}
                                  >
                                    {employee.firstName} {employee.lastName}
                                  </span>
                                  <span className="mono text-[9px] text-slate-600 shrink-0 ml-1">
                                    {employee.phone || "—"}
                                  </span>
                                </div>
                              ))}
                              {teamEmployees.length === 0 && (
                                <div className="text-slate-400 text-[10px] italic">
                                  ไม่มีพนักงานในทีม
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Bottom Footer Note */}
                <div className="border-t border-slate-200 pt-2 text-[10px] text-slate-500 flex items-center justify-between">
                  <div>
                    เอกสารตารางกะปฏิบัติงาน · จัดทำอัตโนมัติโดยระบบ Studio Work Planner
                  </div>
                  <div className="flex items-center gap-6">
                    <span>ลงชื่อผู้จัดทำ: .................................................</span>
                    <span>ลงชื่อผู้อนุมัติ: .................................................</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
