import { useMutation, useQueryClient } from "@tanstack/react-query";
import { hrRequest } from "../components/people-workspace-services";
import { notifySuccess } from "../lib/notifications";
export const api = <T>(path: string, init?: RequestInit) =>
  hrRequest<T>("leave", path, init);
export const send = <T>(path: string, body: unknown, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function useAction<T>(
  action: (input: T) => Promise<unknown>,
  message: string,
  onDone?: () => void,
) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["leave"] });
      notifySuccess(message);
      onDone?.();
    },
  });
}
export const currentDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const currentYear = () => Number(currentDate().slice(0, 4));
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value));
export const dateTimeLabel = (value: string) =>
  `${new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(value))} (PHT)`;
