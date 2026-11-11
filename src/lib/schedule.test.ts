import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveWeek,
  resolveMonth,
  getFairnessStats,
  computeAutoRotateAssignments,
  getSundayOfWeek,
  groupConsecutiveCells,
  SHIFT_COLORS,
  getShiftColorMeta,
  type PlannerStoreData,
} from "./schedule";
import { finalizePastWeeks } from "./snapshot";

function createTestStore(): PlannerStoreData {
  return {
    teams: [
      { id: 1, name: "A", sortOrder: 1, active: true },
      { id: 2, name: "B", sortOrder: 2, active: true },
      { id: 3, name: "C", sortOrder: 3, active: true },
    ],
    positions: [
      { id: 1, name: "Technician Director", sortOrder: 1, isLead: true, isSpecial: false },
      { id: 7, name: "CAM3", sortOrder: 7, isLead: false, isSpecial: true },
    ],
    employees: [
      { id: 1, firstName: "วิชัย", lastName: "ทองดี", phone: "081-111-1111", positionId: 1, teamId: 1, active: true },
      { id: 2, firstName: "ธนา", lastName: "ศรีสุข", phone: "080-222-2222", positionId: 7, teamId: null, active: true },
    ],
    shiftTypes: [
      { id: 1, code: "AM", name: "เช้า", startTime: "06:00", endTime: "15:00", kind: "NORMAL", color: "am", active: true },
      { id: 2, code: "PM", name: "บ่าย", startTime: "14:00", endTime: "23:00", kind: "NORMAL", color: "pm", active: true },
      { id: 3, code: "NT", name: "ดึก", startTime: "22:00", endTime: "07:00", kind: "NORMAL", color: "nt", active: true },
      { id: 4, code: "SP1", name: "ข่าวเช้าวันหยุด", startTime: "05:00", endTime: "10:00", kind: "SPECIAL", color: "sp", active: true },
      { id: 5, code: "SP2", name: "รายการสดเสาร์", startTime: "08:00", endTime: "16:00", kind: "SPECIAL", color: "sp", active: true },
    ],
    masterPlans: [
      {
        id: 1,
        version: 1,
        effectiveFrom: "2026-10-04",
        note: "แผนหลัก v1",
        entries: [
          // Team A works Sun-Thu AM (off Fri, Sat)
          { id: 1, planId: 1, dayOfWeek: 0, teamId: 1, isCam3: false, shiftTypeId: 1 },
          { id: 2, planId: 1, dayOfWeek: 1, teamId: 1, isCam3: false, shiftTypeId: 1 },
          { id: 3, planId: 1, dayOfWeek: 2, teamId: 1, isCam3: false, shiftTypeId: 1 },
          { id: 4, planId: 1, dayOfWeek: 3, teamId: 1, isCam3: false, shiftTypeId: 1 },
          { id: 5, planId: 1, dayOfWeek: 4, teamId: 1, isCam3: false, shiftTypeId: 1 },
          // Team B off Sun, works Mon-Fri PM (off Sat)
          { id: 6, planId: 1, dayOfWeek: 1, teamId: 2, isCam3: false, shiftTypeId: 2 },
          { id: 7, planId: 1, dayOfWeek: 2, teamId: 2, isCam3: false, shiftTypeId: 2 },
          { id: 8, planId: 1, dayOfWeek: 3, teamId: 2, isCam3: false, shiftTypeId: 2 },
          { id: 9, planId: 1, dayOfWeek: 4, teamId: 2, isCam3: false, shiftTypeId: 2 },
          { id: 10, planId: 1, dayOfWeek: 5, teamId: 2, isCam3: false, shiftTypeId: 2 },
          // CAM3 works Mon-Fri AM
          { id: 11, planId: 1, dayOfWeek: 1, teamId: null, isCam3: true, shiftTypeId: 1 },
        ],
        specialSlots: [
          { id: 101, planId: 1, dayOfWeek: 0, shiftTypeId: 4 }, // Sunday special
          { id: 102, planId: 1, dayOfWeek: 6, shiftTypeId: 5 }, // Saturday special
        ],
      },
    ],
    specialAssignments: [],
    overrides: [],
    snapshots: [],
  };
}

describe("Studio Shift Planner Core Logic", () => {
  it("normalizes any date to Sunday of its week", () => {
    assert.equal(getSundayOfWeek("2026-11-09"), "2026-11-08"); // Monday -> Sunday
    assert.equal(getSundayOfWeek("2026-11-08"), "2026-11-08"); // Sunday -> Sunday
    assert.equal(getSundayOfWeek("2026-11-14"), "2026-11-08"); // Saturday -> Sunday
  });

  it("supports Master-plan starting mid-week (e.g. Wednesday)", () => {
    const store = createTestStore();
    // Add Master-plan v2 effective Wednesday 2026-11-11 where Team A switches to Night shift
    store.masterPlans.push({
      id: 2,
      version: 2,
      effectiveFrom: "2026-11-11",
      note: "แผนใหม่เริ่มกลางสัปดาห์ (วันพุธ)",
      entries: [
        { id: 20, planId: 2, dayOfWeek: 3, teamId: 1, isCam3: false, shiftTypeId: 3 },
        { id: 21, planId: 2, dayOfWeek: 4, teamId: 1, isCam3: false, shiftTypeId: 3 },
      ],
      specialSlots: [
        { id: 201, planId: 2, dayOfWeek: 0, shiftTypeId: 4 },
        { id: 202, planId: 2, dayOfWeek: 6, shiftTypeId: 5 },
      ],
    });

    const week = resolveWeek(store, "2026-11-08", "2026-11-09", 3);
    const teamA = week.teamRows.find((r) => r.team.name === "A")!;
    // Sun (0), Mon (1), Tue (2) should use Plan v1 (เช้า)
    assert.equal(teamA.cells[0].planVersion, 1);
    assert.equal(teamA.cells[0].baseShift?.name, "เช้า");
    assert.equal(teamA.cells[2].planVersion, 1);
    assert.equal(teamA.cells[2].baseShift?.name, "เช้า");
    // Wed (3), Thu (4) should use Plan v2 (ดึก overnight)
    assert.equal(teamA.cells[3].planVersion, 2);
    assert.equal(teamA.cells[3].baseShift?.name, "ดึก");
    assert.equal(teamA.cells[3].baseShift?.isOvernight, true);
  });

  it("counts 6th-day fairness stats ONLY up to today within 3, 6, or 12 months", () => {
    const store = createTestStore();
    const today = "2026-11-09"; // Monday
    store.specialAssignments.push(
      // 10 months ago (included in 12m, excluded in 3m and 6m)
      { id: 1, slotId: 101, workDate: "2026-01-18", teamId: 1 },
      // 5 months ago (included in 6m and 12m, excluded in 3m)
      { id: 2, slotId: 101, workDate: "2026-06-07", teamId: 1 },
      // Last month (included in 3m, 6m, 12m)
      { id: 3, slotId: 101, workDate: "2026-10-18", teamId: 1 },
      // Yesterday Sunday 2026-11-08 <= today (included in doneUpToToday!)
      { id: 4, slotId: 101, workDate: "2026-11-08", teamId: 2 },
      // Future Saturday 2026-11-14 > today (MUST NOT be in doneUpToToday, only in plannedAfterToday)
      { id: 5, slotId: 102, workDate: "2026-11-14", teamId: 2 }
    );

    const f3 = getFairnessStats(store, "2026-11-08", today, 3);
    const f6 = getFairnessStats(store, "2026-11-08", today, 6);
    const f12 = getFairnessStats(store, "2026-11-08", today, 12);

    const a3 = f3.stats.find((s) => s.teamName === "A")!;
    const a6 = f6.stats.find((s) => s.teamName === "A")!;
    const a12 = f12.stats.find((s) => s.teamName === "A")!;
    assert.equal(a3.doneUpToToday, 1);
    assert.equal(a6.doneUpToToday, 2);
    assert.equal(a12.doneUpToToday, 3);

    const b3 = f3.stats.find((s) => s.teamName === "B")!;
    assert.equal(b3.doneUpToToday, 1); // Only 2026-11-08 counted
    assert.equal(b3.plannedAfterToday, 1); // 2026-11-14 is future
  });

  it("auto-rotates unassigned special shifts to teams that are OFF that day and have lowest count", () => {
    const store = createTestStore();
    // Team B has already done 2 special shifts in the last 3 months; Team C has done 0
    store.specialAssignments.push(
      { id: 1, slotId: 101, workDate: "2026-10-11", teamId: 2 },
      { id: 2, slotId: 101, workDate: "2026-10-18", teamId: 2 }
    );

    // On Sunday (day 0): Team A works AM, Team B is OFF, Team C is OFF.
    // Between B and C (both OFF on Sunday), C has fewer past special shifts (0 vs 2), so C gets Sunday!
    const suggestions = computeAutoRotateAssignments(store, "2026-11-08", "2026-11-09", 3);
    assert.equal(suggestions.length, 2);
    const sunAssign = suggestions.find((s) => s.workDate === "2026-11-08")!;
    assert.equal(sunAssign.teamId, 3); // Team C
  });

  it("finalizes past completed weeks idempotently without duplicating snapshots", () => {
    const store = createTestStore();
    const changedFirst = finalizePastWeeks(store, "2026-11-09", 2);
    assert.equal(changedFirst, true);
    assert.equal(store.snapshots.length, 2);
    assert.equal(store.snapshots[0].weekStart, "2026-11-01");
    assert.equal(store.snapshots[1].weekStart, "2026-10-25");

    // Calling again on the same day produces no duplicate snapshots
    const changedSecond = finalizePastWeeks(store, "2026-11-09", 2);
    assert.equal(changedSecond, false);
    assert.equal(store.snapshots.length, 2);
  });

  it("provides 15 shift colors with valid metadata lookup", () => {
    assert.equal(SHIFT_COLORS.length, 15);
    assert.equal(getShiftColorMeta("emerald").hex, "#3ecf8e");
    assert.equal(getShiftColorMeta("unknown").key, "am");
  });

  it("resolves distinct schedules per individual CAM3 employee", () => {
    const store = createTestStore();
    store.employees.push({
      id: 3,
      firstName: "คมสัน",
      lastName: "อินทร์แก้ว",
      phone: "080-333-3333",
      positionId: 7,
      teamId: null,
      active: true,
    });
    store.masterPlans[0].entries = [
      { id: 11, planId: 1, dayOfWeek: 0, teamId: null, isCam3: true, employeeId: 2, shiftTypeId: 1 },
      { id: 12, planId: 1, dayOfWeek: 1, teamId: null, isCam3: true, employeeId: 3, shiftTypeId: 2 },
    ];

    const week = resolveWeek(store, "2026-11-08", "2026-11-09", 3);
    assert.equal(week.cam3Rows.length, 2);
    const emp2Row = week.cam3Rows.find((r) => r.employee.id === 2)!;
    const emp3Row = week.cam3Rows.find((r) => r.employee.id === 3)!;
    assert.equal(emp2Row.cells[0].baseShift?.name, "เช้า");
    assert.equal(emp2Row.cells[1].baseShift, null);
    assert.equal(emp3Row.cells[0].baseShift, null);
    assert.equal(emp3Row.cells[1].baseShift?.name, "บ่าย");
  });

  it("merges adjacent cells with the same shift time into a continuous span", () => {
    const store = createTestStore();
    const week = resolveWeek(store, "2026-11-08", "2026-11-09", 3);
    const teamA = week.teamRows.find((r) => r.team.name === "A")!;
    // Team A works Sun-Thu AM (5 consecutive days), off Fri (1), off Sat (1)
    const groups = groupConsecutiveCells(teamA.cells);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].span, 5);
    assert.equal(groups[0].sharedBaseShift?.name, "เช้า");
    assert.equal(groups[1].span, 1);
    assert.equal(groups[1].sharedBaseShift, null);
    assert.equal(groups[2].span, 1);
    assert.equal(groups[2].sharedBaseShift, null);
  });

  it("applies edits to unstarted Master-plan seamlessly in future weeks without affecting past/current weeks", () => {
    const store = createTestStore();
    // Plan 1 is effective 2026-10-04 (already started)
    // Add Plan 2 effective future week (2026-11-22)
    store.masterPlans.push({
      id: 2,
      version: 2,
      effectiveFrom: "2026-11-22",
      note: "แผนอนาคต v2",
      entries: [
        { id: 201, planId: 2, dayOfWeek: 0, teamId: 1, isCam3: false, shiftTypeId: 2 }, // Team A -> PM
      ],
      specialSlots: [],
    });

    // Check week of 2026-11-08 (uses Plan 1)
    const currentWeek = resolveWeek(store, "2026-11-08", "2026-11-09", 3);
    assert.equal(currentWeek.teamRows[0].cells[0].baseShift?.name, "เช้า");

    // Edit unstarted Plan 2 in-place (switch Team A to NT shift)
    const futurePlan = store.masterPlans.find((p) => p.id === 2)!;
    futurePlan.entries[0].shiftTypeId = 3; // NT
    futurePlan.note = "แก้ไขแผนอนาคต v2";

    // Current week still unaffected
    const currentWeekAfter = resolveWeek(store, "2026-11-08", "2026-11-09", 3);
    assert.equal(currentWeekAfter.teamRows[0].cells[0].baseShift?.name, "เช้า");

    // Future week reflects edited plan
    const futureWeek = resolveWeek(store, "2026-11-22", "2026-11-09", 3);
    assert.equal(futureWeek.teamRows[0].cells[0].baseShift?.name, "ดึก");
    assert.equal(futureWeek.planVersionsUsed[0].note, "แก้ไขแผนอนาคต v2");
  });

  it("resolves a full month with accurate days and special slots", () => {
    const store = createTestStore();
    const month = resolveMonth(store, "2026-11", "2026-11-09", 12);

    // November 2026 has 30 days
    assert.equal(month.days.length, 30);
    assert.equal(month.weekStart, "2026-11-01");
    assert.equal(month.weekEnd, "2026-11-30");
    assert.equal(month.days[0].date, "2026-11-01");
    assert.equal(month.days[29].date, "2026-11-30");

    // Each team row has 30 cells
    for (const tr of month.teamRows) {
      assert.equal(tr.cells.length, 30);
    }
    // CAM3 rows have 30 cells
    for (const cr of month.cam3Rows) {
      assert.equal(cr.cells.length, 30);
    }

    // Special slots per day: Nov 1 (Sunday) has 1 slot, Nov 2 (Monday) has 0
    assert.equal(month.specialSlotsByDay.length, 30);
    assert.equal(month.specialSlotsByDay[0].length, 1); // 2026-11-01 is Sunday
    assert.equal(month.specialSlotsByDay[1].length, 0); // 2026-11-02 is Monday
    assert.equal(month.specialSlotsByDay[7].length, 1); // 2026-11-08 is Sunday
  });
});
