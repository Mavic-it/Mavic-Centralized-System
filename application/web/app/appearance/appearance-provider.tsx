"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { setAppearanceTokens } from "./appearance-runtime";
import { defaultAppearancePreferences, parseAppearancePreferences, type AppearancePreferences } from "./types";

type AppearanceContextValue = {
  preferences: AppearancePreferences;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (preferences: AppearancePreferences) => Promise<void>;
  reset: () => Promise<void>;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const storageKey = (userId: string) => `mspaces.appearance.v1.${encodeURIComponent(userId)}`;

function cachedAppearance(userId: string): AppearancePreferences {
  if (typeof window === "undefined") return defaultAppearancePreferences;
  try {
    return parseAppearancePreferences(JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "null")) ?? defaultAppearancePreferences;
  } catch { return defaultAppearancePreferences; }
}

function resolveDarkMode(preferences: AppearancePreferences) {
  return preferences.themeMode === "system"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : preferences.themeMode === "dark";
}

function applyAppearance(preferences: AppearancePreferences) {
  const root = document.documentElement;
  const dark = resolveDarkMode(preferences);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themeMode = preferences.themeMode;
  root.dataset.density = preferences.layoutDensity;
  setAppearanceTokens(root, preferences, dark);
}

export function AppearanceProvider({ userId, initialPreferences, children }: { userId: string; initialPreferences: AppearancePreferences | null; children: ReactNode }) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(initialPreferences ?? defaultAppearancePreferences);
  const initialized = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/users/me/preferences", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(response.status === 401 ? "Your session expired. Sign in again to load appearance preferences." : "Appearance preferences could not be loaded.");
      const parsed = parseAppearancePreferences(await response.json());
      if (!parsed) throw new Error("The saved appearance settings are invalid. Reset them to continue.");
      setPreferences(parsed);
      setError(null);
      try { window.localStorage.setItem(storageKey(userId), JSON.stringify(parsed)); } catch { /* Storage is an optional visual cache. */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Appearance preferences could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const request = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(request);
  }, [load]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    await load();
  }, [load]);

  useLayoutEffect(() => {
    const current = initialized.current ? preferences : initialPreferences ?? cachedAppearance(userId);
    if (!initialized.current) {
      initialized.current = true;
      if (!initialPreferences) setPreferences(current);
    }
    applyAppearance(current);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      if (current.themeMode === "system") applyAppearance(current);
    };
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, [preferences, userId, initialPreferences]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey(userId) || !event.newValue) return;
      try {
        const updated = parseAppearancePreferences(JSON.parse(event.newValue));
        if (updated) setPreferences(updated);
      } catch { /* Ignore invalid cross-tab cache events. */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const save = useCallback(async (next: AppearancePreferences) => {
    const response = await fetch("/api/users/me/preferences", {
      method: "PATCH", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
    });
    if (!response.ok) throw new Error("Preferences were not saved. Check your connection and try again.");
    let responseValue: unknown;
    try { responseValue = await response.json(); } catch { throw new Error("The server returned an unreadable preference response. Your changes were not applied."); }
    const saved = parseAppearancePreferences(responseValue);
    if (!saved) throw new Error("The server returned invalid preferences. Your changes were not applied.");
    setPreferences(saved);
    try { window.localStorage.setItem(storageKey(userId), JSON.stringify(saved)); } catch { /* The database remains the source of truth. */ }
  }, [userId]);

  const reset = useCallback(async () => {
    const response = await fetch("/api/users/me/preferences", { method: "DELETE", credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Preferences were not reset. Check your connection and try again.");
    let responseValue: unknown;
    try { responseValue = await response.json(); } catch { throw new Error("The server returned an unreadable default preference response."); }
    const restored = parseAppearancePreferences(responseValue);
    if (!restored) throw new Error("The server returned invalid default preferences.");
    setPreferences(restored);
    try { window.localStorage.setItem(storageKey(userId), JSON.stringify(restored)); } catch { /* Ignore unavailable cache. */ }
  }, [userId]);

  const value = useMemo(() => ({ preferences, loading, error, reload, save, reset }), [preferences, loading, error, reload, save, reset]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used inside AppearanceProvider.");
  return value;
}

export function applyAppearancePreview(preferences: AppearancePreferences, target: HTMLElement) {
  const dark = resolveDarkMode(preferences);
  target.dataset.previewTheme = dark ? "dark" : "light";
  target.dataset.previewDensity = preferences.layoutDensity;
  setAppearanceTokens(target, preferences, dark);
}
