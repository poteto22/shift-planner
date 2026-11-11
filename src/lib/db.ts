import fs from "node:fs";
import path from "node:path";
import {
  formatIsoDate,
  parseIsoDate,
  type PlannerStoreData,
} from "./schedule";
import { createInitialSeedData } from "./seed-data";
import { finalizePastWeeks } from "./snapshot";

const LOCAL_STORE_PATH = path.join(process.cwd(), "data", "local-store.json");

export function getBangkokTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "11";
  const d = parts.find((p) => p.type === "day")?.value ?? "09";
  return `${y}-${m}-${d}`;
}

function ensureDefaultPositions(store: PlannerStoreData): boolean {
  let changed = false;
  if (!store.positions.some((p) => p.name === "CAM3-กะปกติ")) {
    const nextId = store.positions.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    const nextSort =
      store.positions.reduce((m, p) => Math.max(m, p.sortOrder), 0) + 1;
    store.positions.push({
      id: nextId,
      name: "CAM3-กะปกติ",
      sortOrder: nextSort,
      isLead: false,
      isSpecial: false,
    });
    changed = true;
  }
  return changed;
}

function readLocalFileStore(): PlannerStoreData {
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf8");
      const store = JSON.parse(raw) as PlannerStoreData;
      if (ensureDefaultPositions(store)) {
        writeLocalFileStore(store);
      }
      return store;
    }
  } catch {
    // Fallback to initial seed data if file is corrupted
  }
  const initial = createInitialSeedData();
  finalizePastWeeks(initial, getBangkokTodayIso(), 4);
  writeLocalFileStore(initial);
  return initial;
}

function writeLocalFileStore(data: PlannerStoreData): void {
  try {
    const dir = path.dirname(LOCAL_STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Read-only filesystem in Vercel serverless environment; safe to ignore when DB is connected
  }
}

// ponytail: uses Prisma PostgreSQL when DATABASE_URL is provided or PG_CONNECTED=true, otherwise persists to data/local-store.json
function resolvePostgresUrl(): string | undefined {
  if (process.env.POSTGRES_PASSWORD) {
    const user = encodeURIComponent(process.env.POSTGRES_USER || "postgres");
    const pass = encodeURIComponent(process.env.POSTGRES_PASSWORD);
    const host = process.env.POSTGRES_HOST || "localhost";
    const port = process.env.POSTGRES_PORT || "5432";
    const db = process.env.POSTGRES_DB || "work_planner";
    return `postgresql://${user}:${pass}@${host}:${port}/${db}?schema=public`;
  }
  return process.env.DATABASE_URL;
}

function shouldConnectPostgres(): boolean {
  if (process.env.PG_CONNECTED === "false") return false;
  if (process.env.PG_CONNECTED === "true") return true;
  return Boolean(resolvePostgresUrl());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaInstance: any = null;

async function getPrismaClient() {
  if (!prismaInstance) {
    const { PrismaClient } = await import("@prisma/client");
    prismaInstance = new PrismaClient({
      datasources: { db: { url: resolvePostgresUrl() } },
    });
  }
  return prismaInstance;
}

async function syncStoreToPostgres(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  store: PlannerStoreData
): Promise<void> {
  for (const pos of store.positions) {
    await prisma.position.upsert({
      where: { id: pos.id },
      update: {
        name: pos.name,
        sortOrder: pos.sortOrder,
        isLead: pos.isLead,
        isSpecial: pos.isSpecial,
      },
      create: {
        id: pos.id,
        name: pos.name,
        sortOrder: pos.sortOrder,
        isLead: pos.isLead,
        isSpecial: pos.isSpecial,
      },
    });
  }

  for (const team of store.teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: {
        name: team.name,
        sortOrder: team.sortOrder,
        active: team.active,
      },
      create: {
        id: team.id,
        name: team.name,
        sortOrder: team.sortOrder,
        active: team.active,
      },
    });
  }

  const shiftIds = store.shiftTypes.map((s) => s.id);
  await prisma.shiftType.deleteMany({
    where: shiftIds.length > 0 ? { id: { notIn: shiftIds } } : {},
  });
  for (const st of store.shiftTypes) {
    await prisma.shiftType.upsert({
      where: { id: st.id },
      update: {
        code: st.code,
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

  for (const emp of store.employees) {
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

  const planIds = store.masterPlans.map((p) => p.id);
  await prisma.masterPlan.deleteMany({
    where: planIds.length > 0 ? { id: { notIn: planIds } } : {},
  });

  for (const plan of store.masterPlans) {
    await prisma.masterPlan.upsert({
      where: { id: plan.id },
      update: {
        version: plan.version,
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
          id: e.id,
          planId: plan.id,
          dayOfWeek: e.dayOfWeek,
          teamId: e.teamId,
          isCam3: e.isCam3,
          employeeId: e.employeeId ?? null,
          shiftTypeId: e.shiftTypeId,
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

    for (const slot of plan.specialSlots) {
      await prisma.specialSlot.upsert({
        where: { id: slot.id },
        update: {
          planId: plan.id,
          dayOfWeek: slot.dayOfWeek,
          shiftTypeId: slot.shiftTypeId,
        },
        create: {
          id: slot.id,
          planId: plan.id,
          dayOfWeek: slot.dayOfWeek,
          shiftTypeId: slot.shiftTypeId,
        },
      });
    }
  }

  await prisma.specialAssignment.deleteMany({});
  if (store.specialAssignments.length > 0) {
    await prisma.specialAssignment.createMany({
      data: store.specialAssignments.map((a) => ({
        id: a.id,
        slotId: a.slotId,
        workDate: parseIsoDate(a.workDate),
        teamId: a.teamId,
      })),
    });
  }

  await prisma.override.deleteMany({});
  if (store.overrides.length > 0) {
    await prisma.override.createMany({
      data: store.overrides.map((o) => ({
        id: o.id,
        workDate: parseIsoDate(o.workDate),
        teamId: o.teamId,
        isCam3: o.isCam3,
        employeeId: o.employeeId ?? null,
        mode: o.mode,
        shiftTypeId: o.shiftTypeId,
        customStart: o.customStart,
        customEnd: o.customEnd,
        reason: o.reason,
      })),
    });
  }

  for (const snap of store.snapshots) {
    await prisma.weekSnapshot.upsert({
      where: { weekStart: parseIsoDate(snap.weekStart) },
      update: {
        data: snap.data as object,
        finalizedAt: new Date(snap.finalizedAt),
      },
      create: {
        weekStart: parseIsoDate(snap.weekStart),
        data: snap.data as object,
        finalizedAt: new Date(snap.finalizedAt),
      },
    });
  }
}

async function tryLoadFromPostgres(): Promise<PlannerStoreData | null> {
  if (!shouldConnectPostgres()) return null;
  try {
    const prisma = await getPrismaClient();
    const teamCount = await prisma.team.count();
    if (teamCount === 0) {
      const initial = readLocalFileStore();
      await syncStoreToPostgres(prisma, initial);
    }
    const [
      teams,
      positions,
      employees,
      shiftTypes,
      masterPlans,
      specialAssignments,
      overrides,
      snapshots,
    ] = await Promise.all([
      prisma.team.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.position.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.employee.findMany({ orderBy: { id: "asc" } }),
      prisma.shiftType.findMany({ orderBy: { id: "asc" } }),
      prisma.masterPlan.findMany({
        include: { entries: true, specialSlots: true },
        orderBy: { version: "asc" },
      }),
      prisma.specialAssignment.findMany({ orderBy: { id: "asc" } }),
      prisma.override.findMany({ orderBy: { id: "asc" } }),
      prisma.weekSnapshot.findMany({ orderBy: { weekStart: "desc" } }),
    ]);
    const storeData: PlannerStoreData = {
      teams,
      positions,
      employees,
      shiftTypes,
      masterPlans: masterPlans.map((p: any) => ({
        id: p.id,
        version: p.version,
        effectiveFrom: formatIsoDate(p.effectiveFrom),
        note: p.note,
        entries: p.entries,
        specialSlots: p.specialSlots,
      })),
      specialAssignments: specialAssignments.map((a: any) => ({
        id: a.id,
        slotId: a.slotId,
        workDate: formatIsoDate(a.workDate),
        teamId: a.teamId,
      })),
      overrides: overrides.map((o: any) => ({
        id: o.id,
        workDate: formatIsoDate(o.workDate),
        teamId: o.teamId,
        isCam3: o.isCam3,
        employeeId: o.employeeId,
        mode: o.mode,
        shiftTypeId: o.shiftTypeId,
        customStart: o.customStart,
        customEnd: o.customEnd,
        reason: o.reason,
      })),
      snapshots: snapshots.map((s: any) => ({
        weekStart: formatIsoDate(s.weekStart),
        data: s.data as unknown as PlannerStoreData["snapshots"][number]["data"],
        finalizedAt: s.finalizedAt.toISOString(),
      })),
    };
    if (ensureDefaultPositions(storeData)) {
      await syncStoreToPostgres(prisma, storeData);
    }
    return storeData;
  } catch (err) {
    console.error("Postgres load error, falling back to local store:", err);
    return null;
  }
}

async function trySaveToPostgres(store: PlannerStoreData): Promise<boolean> {
  if (!shouldConnectPostgres()) return false;
  try {
    const prisma = await getPrismaClient();
    await syncStoreToPostgres(prisma, store);
    return true;
  } catch (err) {
    console.error("Postgres save error:", err);
    return false;
  }
}

export async function getStore(): Promise<PlannerStoreData> {
  const pgData = await tryLoadFromPostgres();
  if (pgData) {
    if (finalizePastWeeks(pgData, getBangkokTodayIso(), 4)) {
      await trySaveToPostgres(pgData);
    }
    return pgData;
  }

  const store = readLocalFileStore();
  if (finalizePastWeeks(store, getBangkokTodayIso(), 4)) {
    writeLocalFileStore(store);
  }
  return store;
}

export async function mutateStore(
  mutator: (store: PlannerStoreData) => void | Promise<void>
): Promise<PlannerStoreData> {
  const store = await getStore();
  await mutator(store);
  finalizePastWeeks(store, getBangkokTodayIso(), 4);
  writeLocalFileStore(store);
  await trySaveToPostgres(store);
  return store;
}
