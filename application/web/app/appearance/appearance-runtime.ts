import type { AppearancePreferences } from "./types";

// Share the same token values between server-rendered HTML and client updates.
export function appearanceTokens(preferences: AppearancePreferences, dark: boolean): Record<`--${string}`, string> {
  const accentTokens = {
    red: { primary: "#b4232f", hover: "#941d2b", active: "#7f1925", text: "#941d2b", darkText: "#fca5a5", lightSoft: "#fdf0f1" },
    green: { primary: "#166534", hover: "#14532d", active: "#123e24", text: "#14532d", darkText: "#86efac", lightSoft: "#f0fdf4" },
    blue: { primary: "#1d4ed8", hover: "#1e40af", active: "#1e3a8a", text: "#1e40af", darkText: "#93c5fd", lightSoft: "#eff6ff" },
    teal: { primary: "#0f766e", hover: "#115e59", active: "#134e4a", text: "#115e59", darkText: "#5eead4", lightSoft: "#f0fdfa" },
    purple: { primary: "#6d28d9", hover: "#5b21b6", active: "#4c1d95", text: "#5b21b6", darkText: "#c4b5fd", lightSoft: "#f5f3ff" },
    orange: { primary: "#c2410c", hover: "#9a3412", active: "#7c2d12", text: "#9a3412", darkText: "#fdba74", lightSoft: "#fff7ed" },
    pink: { primary: "#be185d", hover: "#9d174d", active: "#831843", text: "#9d174d", darkText: "#f9a8d4", lightSoft: "#fdf2f8" },
  } as const satisfies Record<AppearancePreferences["accentColor"], {
    primary: string; hover: string; active: string; text: string; darkText: string; lightSoft: string;
  }>;

  const fontSizes = {
    title: { small: "24px", default: "28px", large: "32px" },
    header: { small: "18px", default: "20px", large: "24px" },
    body: { compact: "14px", default: "16px", large: "18px" },
    density: { compact: "0.78", comfortable: "1", spacious: "1.22" },
  } as const;

  const accent = accentTokens[preferences.accentColor];
  const accentSoft = dark ? `color-mix(in srgb, ${accent.primary} 22%, #242832)` : accent.lightSoft;
  return {
    "--primary": accent.primary,
    "--primary-hover": accent.hover,
    "--primary-active": accent.active,
    "--primary-dark": dark ? accent.darkText : accent.text,
    "--primary-soft": accentSoft,
    "--primary-subtle": accentSoft,
    "--primary-subtle-foreground": dark ? accent.darkText : accent.text,
    "--primary-foreground": "#ffffff",
    "--focus-ring": dark ? accent.darkText : accent.primary,
    "--ring": dark ? accent.darkText : accent.primary,
    "--app-title-size": fontSizes.title[preferences.titleFontSize],
    "--app-header-size": fontSizes.header[preferences.headerFontSize],
    "--app-body-size": fontSizes.body[preferences.bodyFontSize],
    "--app-text-scale": String({ compact: 0.875, default: 1, large: 1.125 }[preferences.bodyFontSize]),
    "--density-scale": fontSizes.density[preferences.layoutDensity],
  };
}

export function setAppearanceTokens(target: HTMLElement, preferences: AppearancePreferences, dark: boolean) {
  target.dataset.accent = preferences.accentColor;
  for (const [name, value] of Object.entries(appearanceTokens(preferences, dark))) {
    target.style.setProperty(name, value);
  }
}

