import type { PlannerStoreData } from "./schedule";

export function createInitialSeedData(): PlannerStoreData {
  const teams = [
    { id: 1, name: "A", sortOrder: 1, active: true },
    { id: 2, name: "B", sortOrder: 2, active: true },
    { id: 3, name: "C", sortOrder: 3, active: true },
    { id: 4, name: "D", sortOrder: 4, active: true },
    { id: 5, name: "E", sortOrder: 5, active: true },
  ];

  const positions = [
    { id: 1, name: "Technician Director", sortOrder: 1, isLead: true, isSpecial: false },
    { id: 2, name: "Sound Technician", sortOrder: 2, isLead: false, isSpecial: false },
    { id: 3, name: "Play Out", sortOrder: 3, isLead: false, isSpecial: false },
    { id: 4, name: "CG", sortOrder: 4, isLead: false, isSpecial: false },
    { id: 5, name: "CAM 1 : CCU : Lighting", sortOrder: 5, isLead: false, isSpecial: false },
    { id: 6, name: "CAM 2", sortOrder: 6, isLead: false, isSpecial: false },
    { id: 7, name: "CAM3", sortOrder: 7, isLead: false, isSpecial: true },
  ];

  const employees = [
    // Team A
    { id: 1, firstName: "วิชัย", lastName: "ทองดี", phone: "081-234-5678", positionId: 1, teamId: 1, active: true },
    { id: 2, firstName: "สุดา", lastName: "แก้วมณี", phone: "089-112-3344", positionId: 2, teamId: 1, active: true },
    { id: 3, firstName: "ปกรณ์", lastName: "สายบุญ", phone: "086-555-0192", positionId: 3, teamId: 1, active: true },
    { id: 4, firstName: "นภา", lastName: "รุ่งเรือง", phone: "092-781-6620", positionId: 4, teamId: 1, active: true },
    { id: 5, firstName: "ก้องภพ", lastName: "ศรีวงศ์", phone: "083-447-9010", positionId: 5, teamId: 1, active: true },
    { id: 6, firstName: "อนันต์", lastName: "พึ่งบุญ", phone: "061-302-8875", positionId: 6, teamId: 1, active: true },
    // Team B
    { id: 7, firstName: "ธีรพงษ์", lastName: "มั่นคง", phone: "081-998-2231", positionId: 1, teamId: 2, active: true },
    { id: 8, firstName: "ปิยะ", lastName: "วงศ์สวัสดิ์", phone: "089-201-4411", positionId: 2, teamId: 2, active: true },
    { id: 9, firstName: "ชลธิชา", lastName: "นาคสมบูรณ์", phone: "086-309-7781", positionId: 3, teamId: 2, active: true },
    { id: 10, firstName: "กิตติ", lastName: "เจริญสุข", phone: "092-415-8820", positionId: 4, teamId: 2, active: true },
    { id: 11, firstName: "วรพจน์", lastName: "คำดี", phone: "083-512-6090", positionId: 5, teamId: 2, active: true },
    { id: 12, firstName: "จักรกฤษณ์", lastName: "ใจงาม", phone: "061-678-1123", positionId: 6, teamId: 2, active: true },
    // Team C
    { id: 13, firstName: "ศิริพร", lastName: "ชัยมงคล", phone: "081-775-3091", positionId: 1, teamId: 3, active: true },
    { id: 14, firstName: "ณัฐพล", lastName: "หงส์ทอง", phone: "089-884-2104", positionId: 2, teamId: 3, active: true },
    { id: 15, firstName: "อารยา", lastName: "บุญเลิศ", phone: "086-912-3300", positionId: 3, teamId: 3, active: true },
    { id: 16, firstName: "ภานุวัฒน์", lastName: "มีสุข", phone: "092-104-5592", positionId: 4, teamId: 3, active: true },
    { id: 17, firstName: "สุรชัย", lastName: "พิทักษ์", phone: "083-229-7410", positionId: 5, teamId: 3, active: true },
    { id: 18, firstName: "พีรพัฒน์", lastName: "วัฒนา", phone: "061-390-8841", positionId: 6, teamId: 3, active: true },
    // Team D
    { id: 19, firstName: "สมศักดิ์", lastName: "บุญมา", phone: "081-440-9920", positionId: 1, teamId: 4, active: true },
    { id: 20, firstName: "กัญญา", lastName: "โพธิ์งาม", phone: "089-551-6723", positionId: 2, teamId: 4, active: true },
    { id: 21, firstName: "ธนากร", lastName: "รักษ์ดี", phone: "086-662-0912", positionId: 3, teamId: 4, active: true },
    { id: 22, firstName: "มณีรัตน์", lastName: "สว่างจิต", phone: "092-773-4180", positionId: 4, teamId: 4, active: true },
    { id: 23, firstName: "อภิชาติ", lastName: "ยอดเยี่ยม", phone: "083-884-5291", positionId: 5, teamId: 4, active: true },
    { id: 24, firstName: "ศุภชัย", lastName: "เนตรทิพย์", phone: "061-995-6302", positionId: 6, teamId: 4, active: true },
    // Team E
    { id: 25, firstName: "อรุณี", lastName: "แสงทอง", phone: "081-118-2736", positionId: 1, teamId: 5, active: true },
    { id: 26, firstName: "ประเสริฐ", lastName: "คงคา", phone: "089-229-3847", positionId: 2, teamId: 5, active: true },
    { id: 27, firstName: "วรรณา", lastName: "ศิริกุล", phone: "086-330-4958", positionId: 3, teamId: 5, active: true },
    { id: 28, firstName: "เกรียงไกร", lastName: "เดชะ", phone: "092-441-5069", positionId: 4, teamId: 5, active: true },
    { id: 29, firstName: "นิรันดร์", lastName: "ทองคำ", phone: "083-552-6170", positionId: 5, teamId: 5, active: true },
    { id: 30, firstName: "ชัยวัฒน์", lastName: "สุขสวัสดิ์", phone: "061-663-7281", positionId: 6, teamId: 5, active: true },
    // Dedicated CAM3 staff (no team)
    { id: 31, firstName: "ธนา", lastName: "ศรีสุข", phone: "080-661-4420", positionId: 7, teamId: null, active: true },
    { id: 32, firstName: "คมสัน", lastName: "อินทร์แก้ว", phone: "080-772-5531", positionId: 7, teamId: null, active: true },
  ];

  const shiftTypes = [
    { id: 1, code: "AM", name: "เช้า", startTime: "06:00", endTime: "15:00", kind: "NORMAL" as const, color: "am", active: true },
    { id: 2, code: "PM", name: "บ่าย", startTime: "14:00", endTime: "23:00", kind: "NORMAL" as const, color: "pm", active: true },
    { id: 3, code: "NT", name: "ดึก", startTime: "22:00", endTime: "07:00", kind: "NORMAL" as const, color: "nt", active: true },
    { id: 4, code: "C3", name: "CAM3 ปกติ", startTime: "08:00", endTime: "17:00", kind: "NORMAL" as const, color: "am", active: true },
    { id: 8, code: "C3-2", name: "CAM3-2", startTime: "09:00", endTime: "18:00", kind: "NORMAL" as const, color: "orange", active: true },
    { id: 5, code: "SP_SUN", name: "ข่าวเช้าวันหยุด", startTime: "05:00", endTime: "10:00", kind: "SPECIAL" as const, color: "sp", active: true },
    { id: 6, code: "SP_SAT", name: "รายการสดเสาร์", startTime: "08:00", endTime: "16:00", kind: "SPECIAL" as const, color: "sp", active: true },
    { id: 7, code: "SP_LIVE", name: "ถ่ายทอดสดพิเศษ", startTime: "16:00", endTime: "22:00", kind: "SPECIAL" as const, color: "sp", active: true },
  ];

  // Master-plan patterns (each team has 5 regular days per week, 2 days off)
  // 1=AM, 2=PM, 3=NT, null=OFF
  const matrix: Record<number, Array<number | null>> = {
    1: [1, 1, 2, 2, null, null, 3], // Team A: off Thu, Fri
    2: [2, 2, null, null, 3, 3, 1], // Team B: off Tue, Wed
    3: [null, null, 3, 3, 1, 1, 2], // Team C: off Sun, Mon
    4: [3, 3, 1, 1, 2, 2, null],    // Team D: off Sat, and wait -> 6? Let's make Team D 5 days: off Fri, Sat
    5: [1, 2, 1, null, 2, 3, null], // Team E: off Wed, Sat
  };
  matrix[4] = [3, 3, 1, 1, 2, null, null]; // Team D: 5 regular days (Sun-Thu), off Fri, Sat

  let entryId = 1;
  const entries = [];
  for (const teamId of [1, 2, 3, 4, 5]) {
    const row = matrix[teamId];
    for (let dow = 0; dow < 7; dow++) {
      const shiftTypeId = row[dow];
      if (shiftTypeId) {
        entries.push({
          id: entryId++,
          planId: 1,
          dayOfWeek: dow,
          teamId,
          isCam3: false,
          shiftTypeId,
        });
      }
    }
  }
  // CAM3 employee 31 (ธนา ศรีสุข) works Sun-Thu (5 days, CAM3 ปกติ)
  for (let dow = 0; dow < 5; dow++) {
    entries.push({
      id: entryId++,
      planId: 1,
      dayOfWeek: dow,
      teamId: null,
      isCam3: true,
      employeeId: 31,
      shiftTypeId: 4,
    });
  }
  // CAM3 employee 32 (คมสัน อินทร์แก้ว) works Tue-Sat (5 days, CAM3-2)
  for (let dow = 2; dow < 7; dow++) {
    entries.push({
      id: entryId++,
      planId: 1,
      dayOfWeek: dow,
      teamId: null,
      isCam3: true,
      employeeId: 32,
      shiftTypeId: 8,
    });
  }

  const masterPlans = [
    {
      id: 1,
      version: 1,
      effectiveFrom: "2026-01-04",
      note: "แผนมาตรฐานสตูดิโอ 5 ทีม (กะพิเศษ 2 กะ/สัปดาห์)",
      entries,
      specialSlots: [
        { id: 1, planId: 1, dayOfWeek: 0, shiftTypeId: 5 }, // อาทิตย์: ข่าวเช้าวันหยุด
        { id: 2, planId: 1, dayOfWeek: 6, shiftTypeId: 6 }, // เสาร์: รายการสดเสาร์
      ],
    },
  ];

  // Historical special shift assignments across the year so 3m / 6m / 12m filters show realistic data
  const specialAssignments = [
    // Older than 6 months (only in 12m)
    { id: 1, slotId: 1, workDate: "2026-02-01", teamId: 3 },
    { id: 2, slotId: 2, workDate: "2026-02-07", teamId: 4 },
    { id: 3, slotId: 1, workDate: "2026-03-08", teamId: 5 },
    { id: 4, slotId: 2, workDate: "2026-03-14", teamId: 1 },
    { id: 5, slotId: 1, workDate: "2026-04-12", teamId: 2 },
    // Between 3 and 6 months ago (in 6m and 12m)
    { id: 6, slotId: 1, workDate: "2026-06-14", teamId: 3 },
    { id: 7, slotId: 2, workDate: "2026-06-20", teamId: 4 },
    { id: 8, slotId: 1, workDate: "2026-07-12", teamId: 1 },
    { id: 9, slotId: 2, workDate: "2026-07-18", teamId: 5 },
    { id: 10, slotId: 1, workDate: "2026-08-02", teamId: 2 },
    // Within last 3 months (in 3m, 6m, 12m)
    { id: 11, slotId: 1, workDate: "2026-09-06", teamId: 3 },
    { id: 12, slotId: 2, workDate: "2026-09-12", teamId: 4 },
    { id: 13, slotId: 1, workDate: "2026-10-04", teamId: 5 },
    { id: 14, slotId: 2, workDate: "2026-10-10", teamId: 1 },
    { id: 15, slotId: 1, workDate: "2026-10-18", teamId: 2 },
    { id: 16, slotId: 2, workDate: "2026-10-24", teamId: 4 },
    { id: 17, slotId: 1, workDate: "2026-11-01", teamId: 3 },
    { id: 18, slotId: 2, workDate: "2026-11-07", teamId: 5 },
    // Current week Sunday (2026-11-08): assigned to Team C (which is OFF on Sunday)
    { id: 19, slotId: 1, workDate: "2026-11-08", teamId: 3 },
  ];

  const overrides = [
    {
      id: 1,
      workDate: "2026-11-10",
      teamId: 1,
      isCam3: false,
      mode: "REPLACE" as const,
      shiftTypeId: null,
      customStart: "10:00",
      customEnd: "19:00",
      reason: "ซ้อมใหญ่รายการพิเศษสตูดิโอ 1",
    },
  ];

  return {
    teams,
    positions,
    employees,
    shiftTypes,
    masterPlans,
    specialAssignments,
    overrides,
    snapshots: [],
  };
}
