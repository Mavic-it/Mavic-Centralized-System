"use client";

import { useQuery } from "@tanstack/react-query";
import EmployeeWorkScheduleCard from "../components/employee-work-schedule-card";
import { hrRequest } from "../components/people-workspace-services";
import type { WorkspaceRole } from "../data/people";
import styles from "./workspace.module.css";

export function MyWorkSchedule({ role }: { role: WorkspaceRole }) {
  const employee = useQuery({
    queryKey: ["attendance-own-employee"],
    queryFn: () => hrRequest<{ id: string }>("employees", "/me"),
  });
  if (employee.isPending) return <p role="status" className={styles.notice}>Loading your work schedule…</p>;
  if (employee.isError) return <div role="alert" className={styles.notice}><p>Your employee record could not be loaded. {employee.error.message}</p><button className={styles.secondaryButton} type="button" onClick={() => void employee.refetch()}>Retry</button></div>;
  if (!employee.data?.id) return <p className={styles.notice}>Link your employee record to view your work schedule.</p>;
  return <EmployeeWorkScheduleCard employeeId={employee.data.id} role={role} readOnly />;
}
