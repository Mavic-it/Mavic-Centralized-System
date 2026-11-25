export const defaultAppearancePreferences = {
  themeMode: "light",
  accentColor: "red",
  titleFontSize: "default",
  headerFontSize: "default",
  bodyFontSize: "default",
  layoutDensity: "comfortable",
} as const;

export type AppearancePreferences = {
  themeMode: "light" | "dark" | "system";
  accentColor: "red" | "green" | "blue" | "teal" | "purple" | "orange" | "pink";
  titleFontSize: "small" | "default" | "large";
  headerFontSize: "small" | "default" | "large";
  bodyFontSize: "compact" | "default" | "large";
  layoutDensity: "compact" | "comfortable" | "spacious";
};

export const textSizePresets = [
  { label: "Small", scale: "87.5%", titleFontSize: "small", headerFontSize: "small", bodyFontSize: "compact" },
  { label: "Default", scale: "100%", titleFontSize: "default", headerFontSize: "default", bodyFontSize: "default" },
  { label: "Large", scale: "112.5%", titleFontSize: "large", headerFontSize: "large", bodyFontSize: "large" },
] as const satisfies readonly { label: string; scale: string; titleFontSize: AppearancePreferences["titleFontSize"]; headerFontSize: AppearancePreferences["headerFontSize"]; bodyFontSize: AppearancePreferences["bodyFontSize"] }[];

export function withTextSize(preferences: AppearancePreferences, index: number): AppearancePreferences {
  const preset = textSizePresets[index];
  if (!preset) return preferences;
  return { ...preferences, titleFontSize: preset.titleFontSize, headerFontSize: preset.headerFontSize, bodyFontSize: preset.bodyFontSize };
}

const keys = Object.keys(defaultAppearancePreferences) as (keyof AppearancePreferences)[];
export const appearancePreferenceOptions: Record<keyof AppearancePreferences, readonly string[]> = {
  themeMode: ["light", "dark", "system"],
  accentColor: ["red", "green", "blue", "teal", "purple", "orange", "pink"],
  titleFontSize: ["small", "default", "large"],
  headerFontSize: ["small", "default", "large"],
  bodyFontSize: ["compact", "default", "large"],
  layoutDensity: ["compact", "comfortable", "spacious"],
};

export function parseAppearancePreferences(value: unknown): AppearancePreferences | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!keys.every((key) => typeof record[key] === "string" && appearancePreferenceOptions[key].includes(record[key] as string))) return null;
  return Object.fromEntries(keys.map((key) => [key, record[key]])) as AppearancePreferences;
}
