"use client";

import { useCallback, useSyncExternalStore } from "react";

const PREFIX = "mspaces:display-view:";
const CHANGE_EVENT = "mspaces:display-view-changed";
const fallbackViews = new Map<string, string>();
export const CARD_TABLE_VIEWS = ["cards", "table"] as const;
export const GRID_LIST_VIEWS = ["grid", "list"] as const;

/** A browser-local display preference; never stores employee or account data. */
export function useRememberedView<T extends string>(
  module: string,
  defaultView: T,
  allowedViews: readonly T[],
): [T, (view: T) => void] {
  const storageKey = `${PREFIX}${module}`;
  const read = useCallback((): T => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return allowedViews.find((allowed) => allowed === stored) ?? defaultView;
    } catch {
      const fallback = fallbackViews.get(storageKey);
      return (
        allowedViews.find((allowed) => allowed === fallback) ?? defaultView
      );
    }
  }, [storageKey, defaultView, allowedViews]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) onChange();
      };
      const onLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === storageKey) onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(CHANGE_EVENT, onLocalChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CHANGE_EVENT, onLocalChange);
      };
    },
    [storageKey],
  );

  const view = useSyncExternalStore(subscribe, read, () => defaultView);

  const selectView = useCallback(
    (nextView: T) => {
      if (!allowedViews.includes(nextView)) return;
      try {
        window.localStorage.setItem(storageKey, nextView);
      } catch {
        fallbackViews.set(storageKey, nextView);
      }
      window.dispatchEvent(
        new CustomEvent(CHANGE_EVENT, { detail: storageKey }),
      );
    },
    [storageKey, allowedViews],
  );

  return [view, selectView];
}
