export const taskStages = [
  "NOT_STARTED",
  "STARTED",
  "IN_PROGRESS",
  "STUCK",
  "DONE",
] as const;
export type TaskStage = (typeof taskStages)[number];
export const taskStageLabels: Record<TaskStage, string> = {
  NOT_STARTED: "Not started",
  STARTED: "Started",
  IN_PROGRESS: "In progress",
  STUCK: "Stuck",
  DONE: "Done",
};
export const taskStage = (status: string): TaskStage =>
  status === "TODO"
    ? "NOT_STARTED"
    : ["FOR_REVIEW", "COMPLETED"].includes(status)
      ? "DONE"
      : status === "STARTED"
        ? "STARTED"
        : status === "STUCK"
          ? "STUCK"
          : "IN_PROGRESS";
export function taskPreview(stage: TaskStage, progress: number) {
  return {
    progress:
      stage === "NOT_STARTED"
        ? 0
        : stage === "STARTED"
          ? 10
          : stage === "IN_PROGRESS"
            ? 50
            : stage === "DONE"
              ? 100
              : progress,
    status:
      stage === "NOT_STARTED"
        ? "TODO"
        : stage === "DONE"
          ? "FOR_REVIEW"
          : stage,
  };
}
