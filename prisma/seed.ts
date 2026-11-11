import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createInitialSeedData } from "../src/lib/seed-data";
import { parseIsoDate } from "../src/lib/schedule";
import type { PlannerStoreData } from "../src/lib/schedule";

const prisma = new PrismaClient();

async function main() {
  const localStorePath = path.join(process.cwd(), "data", "local-store.json");
  let data: PlannerStoreData;

  if (fs.existsSync(localStorePath)) {
    console.log("Loading seed data from data/local-store.json...");
    data = JSON.parse(fs.readFileSync(localStorePath, "utf-8")) as PlannerStoreData;
  } else {
    console.log("Loading initial seed data from seed-data.ts...");
    data = createInitialSeedData();
  }

  for (const pos of data.positions) {
    await prisma.position.upsert({
      where: { name: pos.name },
      update: { sortOrder: pos.sortOrder, isLead: pos.isLead, isSpecial: pos.isSpecial },
      create: {
        id: pos.id,
        name: pos.name,
        sortOrder: pos.sortOrder,
        isLead: pos.isLead,
        isSpecial: pos.isSpecial,
      },
    });
  }

  for (const team of data.teams) {
    await prisma.team.upsert({
      where: { name: team.name },
      update: { sortOrder: team.sortOrder, active: team.active },
      create: {
        id: team.id,
        name: team.name,
        sortOrder: team.sortOrder,
        active: team.active,
      },
    });
  }

  for (const st of data.shiftTypes) {
    await prisma.shiftType.upsert({
      where: { code: st.code },
      update: {
        name: st.name,
        startTime: st.startTime,
        endTime: st.endTime,
        kind: st.kind,
        color: st.color,
        active: st.active,
      },
      create: {
        id: st.id,
        code: st.code,
        name: st.name,
        startTime: st.startTime,
        endTime: st.endTime,
        kind: st.kind,
        color: st.color,
        active: st.active,
      },
    });
  }

  for (const emp of data.employees) {
    await prisma.employee.upsert({
      where: { id: emp.id },
      update: {
        firstName: emp.firstName,
        lastName: emp.lastName,
        phone: emp.phone,
        positionId: emp.positionId,
        teamId: emp.teamId,
        active: emp.active,
      },
      create: {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        phone: emp.phone,
        positionId: emp.positionId,
        teamId: emp.teamId,
        active: emp.active,
      },
    });
  }

  for (const plan of data.masterPlans) {
    await prisma.masterPlan.upsert({
      where: { version: plan.version },
      update: {
        effectiveFrom: parseIsoDate(plan.effectiveFrom),
        note: plan.note,
      },
      create: {
        id: plan.id,
        version: plan.version,
        effectiveFrom: parseIsoDate(plan.effectiveFrom),
        note: plan.note,
      },
    });

    await prisma.planEntry.deleteMany({ where: { planId: plan.id } });
    if (plan.entries.length > 0) {
      await prisma.planEntry.createMany({
        data: plan.entries.map((e) => ({
          dayOfWeek: e.dayOfWeek,
          teamId: e.teamId,
          isCam3: e.isCam3,
          employeeId: e.employeeId ?? null,
          shiftTypeId: e.shiftTypeId,
          planId: plan.id,
        })),
      });
    }

    const currentSlotIds = plan.specialSlots.map((s) => s.id);
    await prisma.specialSlot.deleteMany({
      where: {
        planId: plan.id,
        ...(currentSlotIds.length > 0 ? { id: { notIn: currentSlotIds } } : {}),
      },
    });
    for (const s of plan.specialSlots) {
      await prisma.specialSlot.upsert({
        where: { id: s.id },
        update: {
          dayOfWeek: s.dayOfWeek,
          shiftTypeId: s.shiftTypeId,
          planId: plan.id,
        },
        create: {
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          shiftTypeId: s.shiftTypeId,
          planId: plan.id,
        },
      });
    }
  }

  if (data.specialAssignments && data.specialAssignments.length > 0) {
    for (const a of data.specialAssignments) {
      await prisma.specialAssignment.upsert({
        where: { id: a.id },
        update: {
          slotId: a.slotId,
          workDate: parseIsoDate(a.workDate),
          teamId: a.teamId,
        },
        create: {
          id: a.id,
          slotId: a.slotId,
          workDate: parseIsoDate(a.workDate),
          teamId: a.teamId,
        },
      });
    }
  }

  if (data.overrides && data.overrides.length > 0) {
    for (const o of data.overrides) {
      await prisma.override.upsert({
        where: { id: o.id },
        update: {
          workDate: parseIsoDate(o.workDate),
          teamId: o.teamId,
          isCam3: o.isCam3,
          employeeId: o.employeeId,
          mode: o.mode,
          shiftTypeId: o.shiftTypeId,
          customStart: o.customStart,
          customEnd: o.customEnd,
          reason: o.reason,
        },
        create: {
          id: o.id,
          workDate: parseIsoDate(o.workDate),
          teamId: o.teamId,
          isCam3: o.isCam3,
          employeeId: o.employeeId,
          mode: o.mode,
          shiftTypeId: o.shiftTypeId,
          customStart: o.customStart,
          customEnd: o.customEnd,
          reason: o.reason,
        },
      });
    }
  }

  console.log("Seeded database successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
