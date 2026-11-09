import { PrismaClient } from "@prisma/client";
import { createInitialSeedData } from "../src/lib/seed-data";
import { parseIsoDate } from "../src/lib/schedule";

const prisma = new PrismaClient();

async function main() {
  const data = createInitialSeedData();

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
        entries: {
          create: plan.entries.map((e) => ({
            dayOfWeek: e.dayOfWeek,
            teamId: e.teamId,
            isCam3: e.isCam3,
            employeeId: e.employeeId ?? null,
            shiftTypeId: e.shiftTypeId,
          })),
        },
        specialSlots: {
          create: plan.specialSlots.map((s) => ({
            id: s.id,
            dayOfWeek: s.dayOfWeek,
            shiftTypeId: s.shiftTypeId,
          })),
        },
      },
    });
  }

  console.log("Seeded PostgreSQL database for TV Studio Shift Planner.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
