import { hrRequest } from "../../components/people-workspace-services";
export const obApi = <T>(path: string, body?: unknown) =>
  hrRequest<T>(
    "attendance",
    `/official-business${path}`,
    body === undefined
      ? undefined
      : { method: "POST", body: JSON.stringify(body) },
  );
export const obDate = (s: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(`${s}T00:00:00+08:00`));
export const obTime = (s: string, zone = "Asia/Manila") =>
  new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date(s));
export const obTimestamp = (s: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(s));
