export type DtrCutoff = { from: string; to: string };

export function dtrCutoff(month: string, half: string): DtrCutoff | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  if (half === "11-25") return { from: `${month}-11`, to: `${month}-25` };
  if (half !== "26-10") return null;
  const [year, index] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 7);
  return { from: `${month}-26`, to: `${next}-10` };
}

export function attendanceMonth(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}
