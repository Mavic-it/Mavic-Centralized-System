export function normalizeStatusPillValue(
  value: string | null | undefined,
): string {
  return String(value ?? "UNKNOWN")
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");
}
