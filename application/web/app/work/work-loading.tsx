import { LoadingFields, LoadingLines, LoadingList, LoadingRegion } from "../components/content-loading";
import { Skeleton } from "../components/loading-ui";
import type { Kind } from "./types";
import css from "./workspace.module.css";

export function WorkDetailLoading({ kind }: { kind: Kind }) {
  return <div className={kind === "tasks" ? css.overview : css.incidentWorkspace}><section><h3>{kind === "tasks" ? "Task brief" : "Report details"}</h3><LoadingRegion label="Loading private record"><LoadingLines lines={3} /></LoadingRegion></section>{kind === "tasks" && <section className={`${css.progressPanel} ${css.taskProgress}`} aria-hidden="true"><h3>Task status</h3><Skeleton className="loading-pill" /><Skeleton className="loading-description" /></section>}<LoadingFields label="Loading record details" labels={kind === "tasks" ? ["Assignees", "Branch", "Start date", "Due date", "Priority"] : ["Reference", "Concerned employee", "Branch", "Incident date", "Category"]} className={css.recordMetadata} /><LoadingList label="Loading record history" items={3} /></div>;
}
