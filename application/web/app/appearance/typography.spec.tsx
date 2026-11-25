import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultAppearancePreferences, textSizePresets, withTextSize } from "./types";
import { AppearanceSettings } from "./appearance-settings";
import { useAppearance } from "./appearance-provider";

vi.mock("./appearance-provider", () => ({ useAppearance: vi.fn(), applyAppearancePreview: vi.fn() }));

describe("unified appearance text size", () => {
  it.each(textSizePresets.map((preset, index) => ({ ...preset, index })))("applies $label to all three text roles together", (preset) => {
    const original = { ...defaultAppearancePreferences, accentColor: "green", layoutDensity: "spacious" } as const;
    const result = withTextSize(original, preset.index);
    expect(result).toEqual({ ...original, titleFontSize: preset.titleFontSize, headerFontSize: preset.headerFontSize, bodyFontSize: preset.bodyFontSize });
    expect(original).toEqual({ ...defaultAppearancePreferences, accentColor: "green", layoutDensity: "spacious" });
  });

  it("preserves preferences for an invalid slider position", () => {
    expect(withTextSize(defaultAppearancePreferences, 99)).toBe(defaultAppearancePreferences);
  });

  it("renders one labelled slider and the apply action", () => {
    vi.mocked(useAppearance).mockReturnValue({ preferences: defaultAppearancePreferences, loading: false, error: null, reload: vi.fn(), save: vi.fn(), reset: vi.fn() });
    const html = renderToStaticMarkup(<AppearanceSettings />);
    expect(html.match(/type="range"/g)).toHaveLength(1);
    expect(html).toContain('for="appearance-text-size"');
    expect(html).toContain('aria-valuetext="Default, 100%"');
    expect(html).toContain("Apply changes");
    expect(html).not.toContain("<select");
  });

  it("retains existing custom sizes until the slider is moved", () => {
    const preferences = { ...defaultAppearancePreferences, titleFontSize: "large" } as const;
    vi.mocked(useAppearance).mockReturnValue({ preferences, loading: false, error: null, reload: vi.fn(), save: vi.fn(), reset: vi.fn() });
    const html = renderToStaticMarkup(<AppearanceSettings />);
    expect(html).toContain("Your saved sizes are custom.");
    expect(withTextSize(preferences, 1)).toEqual(defaultAppearancePreferences);
  });
});
