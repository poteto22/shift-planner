import fs from "node:fs";
import path from "node:path";
import { formatIsoDate, type PlannerStoreData } from "./schedule";
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

function readLocalFileStore(): PlannerStoreData {
  try {
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf8");
      return JSON.parse(raw) as PlannerStoreData;
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
  const dir = path.dirname(LOCAL_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

// ponytail: uses Prisma PostgreSQL when PG_CONNECTED=true, otherwise persists to data/local-store.json until internal Postgres is running
async function tryLoadFromPostgres(): Promise<PlannerStoreData | null> {
  if (process.env.PG_CONNECTED !== "true") return null;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
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
    await prisma.$disconnect();
    return {
      teams,
      positions,
      employees,
      shiftTypes,
      masterPlans: masterPlans.map((p) => ({
        id: p.id,
        version: p.version,
        effectiveFrom: formatIsoDate(p.effectiveFrom),
        note: p.note,
        entries: p.entries,
        specialSlots: p.specialSlots,
      })),
      specialAssignments: specialAssignments.map((a) => ({
        id: a.id,
        slotId: a.slotId,
        workDate: formatIsoDate(a.workDate),
        teamId: a.teamId,
      })),
      overrides: overrides.map((o) => ({
        id: o.id,
        workDate: formatIsoDate(o.workDate),
        teamId: o.teamId,
        isCam3: o.isCam3,
        mode: o.mode,
        shiftTypeId: o.shiftTypeId,
        customStart: o.customStart,
        customEnd: o.customEnd,
        reason: o.reason,
      })),
      snapshots: snapshots.map((s) => ({
        weekStart: formatIsoDate(s.weekStart),
        data: s.data as unknown as PlannerStoreData["snapshots"][number]["data"],
        finalizedAt: s.finalizedAt.toISOString(),
      })),
    };
  } catch {
    return null;
  }
}

export async function getStore(): Promise<PlannerStoreData> {
  const pgData = await tryLoadFromPostgres();
  if (pgData) return pgData;

  const store = readLocalFileStore();
  if (finalizePastWeeks(store, getBangkokTodayIso(), 4)) {
    writeLocalFileStore(store);
  }
  return store;
}

export async function mutateStore(
  mutator: (store: PlannerStoreData) => void | Promise<void>
): Promise<PlannerStoreData> {
  const store = readLocalFileStore();
  await mutator(store);
  finalizePastWeeks(store, getBangkokTodayIso(), 4);
  writeLocalFileStore(store);
  return store;
}
