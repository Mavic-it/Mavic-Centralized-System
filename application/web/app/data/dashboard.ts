export const branchStats = {
  all: {
    employees: 184,
    activeEmployees: 176,
    reservations: 18,
    inquiries: 14,
    lowStock: 4,
    rooms: { available: 11, reserved: 6, occupied: 5, maintenance: 2 },
  },
  makati: {
    employees: 102,
    activeEmployees: 98,
    reservations: 11,
    inquiries: 8,
    lowStock: 3,
    rooms: { available: 7, reserved: 3, occupied: 3, maintenance: 1 },
  },
  ortigas: {
    employees: 82,
    activeEmployees: 78,
    reservations: 7,
    inquiries: 6,
    lowStock: 1,
    rooms: { available: 4, reserved: 3, occupied: 2, maintenance: 1 },
  },
} as const;

export type DashboardBranch = keyof typeof branchStats;

export const branchOptions: { value: DashboardBranch; label: string }[] = [
  { value: "all", label: "All branches" },
  { value: "makati", label: "Mavic Makati" },
  { value: "ortigas", label: "Mavic Ortigas" },
];

export const dashboardReservations = [
  {
    time: "09:00 AM",
    customer: "Northwind Design",
    initials: "ND",
    room: "Meeting Room 02",
    branch: "Makati",
    status: "Checked in",
    statusClass: "status-confirmed",
  },
  {
    time: "10:30 AM",
    customer: "Sofia Reyes",
    initials: "SR",
    room: "Focus Suite 04",
    branch: "Ortigas",
    status: "Arriving soon",
    statusClass: "status-upcoming",
  },
  {
    time: "01:00 PM",
    customer: "Studio Common",
    initials: "SC",
    room: "Boardroom A",
    branch: "Makati",
    status: "Needs check-in",
    statusClass: "status-attention",
  },
] as const;

export function isBranchKey(
  value: string | undefined,
): value is DashboardBranch {
  return value === "all" || value === "makati" || value === "ortigas";
}
