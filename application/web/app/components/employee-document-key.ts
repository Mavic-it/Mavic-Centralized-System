export function employeeDocumentKey(employeeId: string, index: number): string {
  return `${employeeId}:document:${index}`;
}
