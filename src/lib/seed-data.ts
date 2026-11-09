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

  return {
    teams,
    positions,
    employees: [],
    shiftTypes: [],
    masterPlans: [],
    specialAssignments: [],
    overrides: [],
    snapshots: [],
  };
}
