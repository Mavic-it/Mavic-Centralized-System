"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, LoaderCircle, RotateCcw, Save, X } from "lucide-react";
import { notifyError, notifySuccess } from "../lib/notifications";
import { Button } from "../components/ui/button";
import { useAppearance, applyAppearancePreview } from "./appearance-provider";
import { defaultAppearancePreferences, textSizePresets, withTextSize, type AppearancePreferences } from "./types";
import styles from "./appearance-settings.module.css";

const accentChoices = [
  { value: "red", name: "Red · Default", hex: "#B4232F" },
  { value: "green", name: "Green", hex: "#166534" },
  { value: "blue", name: "Blue", hex: "#1D4ED8" },
  { value: "teal", name: "Teal", hex: "#0F766E" },
  { value: "purple", name: "Purple", hex: "#6D28D9" },
  { value: "orange", name: "Orange", hex: "#C2410C" },
  { value: "pink", name: "Pink", hex: "#BE185D" },
] as const;

const themeChoices = [
  { value: "light", label: "Light", description: "A bright, clear workspace." },
  { value: "dark", label: "Dark", description: "A darker workspace with softer glare." },
  { value: "system", label: "System", description: "Follow your device appearance." },
] as const;

function Segmented<T extends string>({ label, value, choices, onChange, disabled = false }: {
  label: string;
  value: T;
  choices: readonly { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return <fieldset className={styles.segmentField}>
    <legend>{label}</legend>
    <div className={styles.segmentGroup} role="group" aria-label={label}>
      {choices.map((choice) => <button
        aria-pressed={value === choice.value}
        className={styles.segment}
        disabled={disabled}
        key={choice.value}
        onClick={() => onChange(choice.value)}
        type="button"
      >
        <span>{choice.label}</span>
        {choice.description && <small>{choice.description}</small>}
      </button>)}
    </div>
  </fieldset>;
}

export function AppearanceSettings() {
  const { preferences, loading, error, reload, save, reset } = useAppearance();
  const [draftState, setDraftState] = useState<{ source: string | null; value: AppearancePreferences }>({ source: null, value: defaultAppearancePreferences });
  const [resetPending, setResetPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<"saved" | "cancelled" | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  const savedKey = JSON.stringify(preferences);
  const hasUnsavedDraft = draftState.source !== null && JSON.stringify(draftState.value) !== draftState.source;
  const draft = hasUnsavedDraft ? draftState.value : preferences;
  const dirty = useMemo(() => JSON.stringify(draft) !== savedKey, [draft, savedKey]);
  const defaultsSelected = JSON.stringify(draft) === JSON.stringify(defaultAppearancePreferences);
  const actionStatusState = saving ? "saving" : actionError ? "error" : resetPending ? "reset" : dirty ? "dirty" : actionFeedback === "saved" ? "saved" : "idle";
  const actionStatus = saving
    ? "Saving your appearance preferences…"
    : actionError
      ? "Save failed. Your changes are still in the preview."
      : resetPending
        ? "Defaults are previewed. Apply changes to save them, or Cancel to keep your settings."
        : dirty
          ? "Unsaved changes. Apply them to update your workspace."
          : actionFeedback === "saved"
            ? "Changes saved. Your workspace is up to date."
            : actionFeedback === "cancelled"
              ? "Changes discarded. Your saved appearance is restored."
              : "No changes to apply. Choose a setting to preview it.";
  const textSizeIndex = Math.max(0, textSizePresets.findIndex((preset) => preset.bodyFontSize === draft.bodyFontSize));
  const textSize = textSizePresets[textSizeIndex];
  const customTextSize = textSize.titleFontSize !== draft.titleFontSize || textSize.headerFontSize !== draft.headerFontSize;

  useEffect(() => {
    if (previewRef.current) applyAppearancePreview(draft, previewRef.current);
  }, [draft]);

  function change<K extends keyof AppearancePreferences>(key: K, value: AppearancePreferences[K]) {
    setDraftState({ source: savedKey, value: { ...draft, [key]: value } });
    setResetPending(false);
    setActionError(null);
    setActionFeedback(null);
  }

  function changeTextSize(index: number) {
    setDraftState({ source: savedKey, value: withTextSize(draft, index) });
    setResetPending(false);
    setActionError(null);
    setActionFeedback(null);
  }

  async function saveChanges() {
    setSaving(true);
    setActionError(null);
    setActionFeedback(null);
    try {
      const restoringDefaults = resetPending && defaultsSelected;
      if (restoringDefaults) await reset();
      else await save(draft);
      const savedValue = restoringDefaults ? defaultAppearancePreferences : draft;
      setDraftState({ source: JSON.stringify(savedValue), value: savedValue });
      setResetPending(false);
      setActionFeedback("saved");
      notifySuccess("Appearance preferences saved.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Preferences could not be saved.";
      setActionError(message);
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  function cancelChanges() {
    setDraftState({ source: savedKey, value: preferences });
    setResetPending(false);
    setActionError(null);
    setActionFeedback("cancelled");
  }

  function stageReset() {
    setDraftState({ source: savedKey, value: defaultAppearancePreferences });
    setResetPending(true);
    setActionError(null);
    setActionFeedback(null);
  }

  const loadingView = <main className={styles.page} aria-busy="true">
    <header className={styles.heading}><div><p className={styles.eyebrow}>SYSTEM SETTINGS</p><h1>Appearance &amp; Personalization</h1><p>Make your workspace easier to read and more comfortable to use.</p></div></header>
    <div className={styles.skeletonGrid}><section className={styles.skeletonPanel}><div className={styles.skeletonLine} /><div className={styles.skeletonControl} /><div className={styles.skeletonLine} /><div className={styles.skeletonControl} /><div className={styles.skeletonLine} /><div className={styles.skeletonControl} /></section><section className={styles.skeletonPreview}><div className={styles.skeletonLine} /><div className={styles.skeletonControl} /><div className={styles.skeletonControl} /></section></div>
  </main>;

  if (loading) return loadingView;

  return <main className={styles.page}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>SYSTEM SETTINGS</p><h1>Appearance &amp; Personalization</h1><p>Make your workspace easier to read and more comfortable to use. These preferences follow your account across branches.</p></div>
    </header>

    {error && <div className={styles.notice} role="alert"><span>{error}</span><Button onClick={() => void reload()} variant="outline" size="sm">Retry</Button></div>}
    <div className={styles.layout}>
      <section className={styles.controls} aria-label="Appearance preferences">
        <section className={styles.panel}>
          <div className={styles.panelHeading}><span className={styles.step}>01</span><div><h2>Theme</h2><p>Choose how the workspace looks.</p></div></div>
          <Segmented label="Theme mode" value={draft.themeMode} choices={themeChoices} onChange={(value) => change("themeMode", value)} disabled={saving} />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><span className={styles.step}>02</span><div><h2>Color palette</h2><p>Mavic defaults to red accents, a black sidebar, and white surfaces in light mode. Choose another accent to personalize your workspace.</p></div></div>
          <div className={styles.colors} role="group" aria-label="Accent color">
            {accentChoices.map((color) => <button aria-pressed={draft.accentColor === color.value} aria-label={`${color.name} accent color`} className={styles.colorChoice} disabled={saving} key={color.value} onClick={() => change("accentColor", color.value)} type="button">
              <span className={styles.swatch} style={{ backgroundColor: color.hex }}>{draft.accentColor === color.value && <Check aria-hidden="true" size={17} />}</span><span>{color.name}</span>
            </button>)}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><span className={styles.step}>03</span><div><h2>Typography</h2><p>One comfortable size for every title, heading, and line of text.</p></div></div>
          <div className={styles.textSizeControl}>
            <div className={styles.textSizeHeading}>
              <label htmlFor="appearance-text-size">Text size</label>
              <output htmlFor="appearance-text-size" className={styles.sizeValue}>{customTextSize ? "Custom" : textSize.label}<span>{textSize.scale}</span></output>
            </div>
            <div className={styles.sliderRow}>
              <span className={styles.smallLetter} aria-hidden="true">A</span>
              <input id="appearance-text-size" className={styles.textSizeSlider} type="range" min={0} max={2} step={1} value={textSizeIndex} aria-valuetext={customTextSize ? "Custom sizes. Move the slider to choose a unified text size." : `${textSize.label}, ${textSize.scale}`} aria-describedby="appearance-text-size-hint" disabled={saving} onChange={(event) => changeTextSize(Number(event.target.value))} style={{ "--range-fill": `${textSizeIndex * 50}%` } as CSSProperties} />
              <span className={styles.largeLetter} aria-hidden="true">A</span>
            </div>
            <div className={styles.sliderLabels} aria-hidden="true"><span>Small</span><span>Default</span><span>Large</span></div>
            <p id="appearance-text-size-hint" className={styles.textSizeHint}>{customTextSize ? "Your saved sizes are custom. Move the slider to scale all text together." : "Preview the size here, then apply your changes to the workspace."}</p>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}><span className={styles.step}>04</span><div><h2>Layout density</h2><p>Set the amount of space between interface elements.</p></div></div>
          <Segmented label="Layout density" value={draft.layoutDensity} choices={[
            { value: "compact", label: "Compact", description: "More information on screen" },
            { value: "comfortable", label: "Comfortable", description: "Balanced spacing" },
            { value: "spacious", label: "Spacious", description: "More room to breathe" },
          ] as const} onChange={(value) => change("layoutDensity", value)} disabled={saving} />
        </section>

        {(actionError || (error && actionError)) && <p className={styles.actionError} role="alert">{actionError}</p>}
        <div className={styles.actions}>
          <Button aria-describedby="appearance-action-status" disabled={!dirty || saving} onClick={() => void saveChanges()}>{saving ? <LoaderCircle aria-hidden="true" className={styles.savingIcon} /> : <Save aria-hidden="true" />}{saving ? "Applying…" : "Apply changes"}</Button>
          <Button aria-describedby="appearance-action-status" disabled={!dirty || saving} onClick={cancelChanges} variant="outline"><X aria-hidden="true" />Cancel</Button>
          <Button aria-describedby="appearance-action-status" disabled={saving || defaultsSelected} onClick={stageReset} variant="ghost"><RotateCcw aria-hidden="true" />Reset to default</Button>
        </div>
        <p id="appearance-action-status" className={styles.actionStatus} data-state={actionStatusState} role="status" aria-live="polite" aria-atomic="true">{actionStatus}</p>
        <p className={styles.privacy}>Changes stay in this preview until you save. Preferences are stored with your account.</p>
      </section>

      <aside className={styles.previewColumn}>
        <div className={styles.previewHeader}><div><p className={styles.eyebrow}>LIVE PREVIEW</p><h2>Workspace sample</h2></div><span>PREVIEW</span></div>
        <section aria-label="Live appearance preview" className={styles.preview} data-preview-theme="light" ref={previewRef}>
          <div className={styles.previewSidebar}><strong><span>M</span> MAVIC</strong><a aria-current="page" href="#preview">Overview</a><a href="#preview">Employees</a><a href="#preview">Reports</a><small>WORKSPACE</small></div>
          <div className={styles.previewMain}>
            <div className={styles.previewTopline}><span>Overview / Today</span><span className={styles.avatar}>JD</span></div>
            <h3>Good morning, Mavic</h3>
            <p className={styles.previewDescription}>Here is what is happening in your workspace today.</p>
            <div className={styles.previewCard}><div><span className={styles.previewLabel}>TEAM ATTENDANCE</span><strong>94.8%</strong><small>+2.4% this month</small></div><div className={styles.miniChart}><i /><i /><i /><i /><i /><i /><i /></div></div>
            <div className={styles.previewForm}><label htmlFor="appearance-preview-input">Search workspace</label><input id="appearance-preview-input" placeholder="Search employees…" readOnly /><button type="button">View report</button></div>
            <div className={styles.previewTable}><div><strong>Recent activity</strong><span>View all</span></div><p><span>Payroll review</span><b>In progress</b></p><p><span>Leave requests</span><b>4 pending</b></p></div>
          </div>
        </section>
        <p className={styles.previewCaption}>A sample of your colors, type scale, and spacing.</p>
      </aside>
    </div>
  </main>;
}
