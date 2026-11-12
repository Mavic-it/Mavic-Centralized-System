# Resizable sidebar design

1. **Component tree:** `AppShell` owns the sidebar width and mobile drawer. `SidebarNavItem` renders each authorized link or unavailable item. The existing `IconActionButton` supplies the desktop collapse control; its tooltip hook supplies labels for compact navigation. A focusable resize separator sits on the desktop sidebar edge.
2. **Responsibilities:** `AppShell` handles sizing, persistence, drag/keyboard interactions, and layout. `SidebarNavItem` renders the icon, text, active state, and a viewport tooltip in compact mode. Existing access filtering continues to decide which navigation items appear.
3. **Contracts:** Widths are 72px collapsed, 220px minimum expanded, 360px maximum expanded, and 252px default. Width normalization accepts only finite numeric values. The resize separator has an accessible name, width value, orientation, and a controlled sidebar. Navigation items receive label, icon, destination, active/disabled state, compact state, and a navigation callback. There are no API or server data changes.
4. **State model:** Desktop width and last expanded width are local client state. Both values are stored in browser local storage and restored after mount, so expanding after a reload restores the previous custom width. Pointer movement previews a clamped width; release saves it. Dragging below 220px selects 72px. The top bar button toggles compact/last expanded width. Left/Right arrows change width by 16px, Home collapses, and End expands to maximum. Mobile drawer open/close remains independent and always displays full labels.
5. **Visual system:** Desktop content offset tracks the sidebar width. The edge handle is a narrow visible bar with hover/focus feedback and a larger hit area. Compact navigation centers 18px icons and hides wordmarks, section headings, and footer copy; subtle separators retain grouping. Hover/focus labels render in the existing viewport tooltip layer. Expanded navigation keeps its current hierarchy and colors. Mobile sizing and backdrop stay as they are.
6. **Accessibility:** The resize handle is a keyboard operable vertical separator. The top bar toggle and navigation links have explicit accessible names. Compact labels are available on hover and keyboard focus. The active link retains `aria-current`. Focus rings remain visible; reduced-motion users receive no width animation. Pointer capture ends on release/cancel, and users can always restore an expanded sidebar by keyboard or button.
7. **File plan:** Update `application/web/app/components/app-shell.tsx` for layout and interaction state; add `application/web/app/components/sidebar-nav-item.tsx` for navigation presentation; export the existing portal tooltip hook from `application/web/app/components/icon-action-button.tsx`; update `application/web/app/globals.css` for responsive widths, handle, and compact appearance; record completion in `docs/HRIS_IMPLEMENTATION_PLAN.md`.
8. **Verification:** Inspect desktop expanded, compact, hover/focus labels, keyboard width control, mobile drawer, persistence, resize cancellation, and narrow desktop layout. Run web TypeScript, changed-file lint, and a production build. Keep the main HRIS phase boundary unchanged.

## Transition refinement

1. **Component tree:** The existing `AppShell` and `SidebarNavItem` remain the only UI components; this refinement uses their existing width and compact state with no new component or data dependency.
2. **Responsibilities:** CSS owns the motion for the sidebar, content offset, resize handle, and compact text; pointer and keyboard behavior stays in `AppShell`.
3. **Contracts:** No prop, API, storage, or error contract changes. The current 72px compact and 220–360px expanded bounds remain.
4. **State model:** Button and keyboard changes use a short ease-out transition. Pointer dragging follows quickly with a shorter transition, including when it crosses the compact threshold. Compact text fades and contracts with the width change.
5. **Visual system:** Preserve the existing desktop sidebar hierarchy, spacing, and colors. Use subtle motion only on the desktop sidebar and content boundary; mobile navigation keeps its existing drawer behavior.
6. **Accessibility:** Existing focus and keyboard controls remain. Hidden compact text is noninteractive, while link accessible names and hover/focus tooltips remain available. Disable the added transitions under `prefers-reduced-motion: reduce`.
7. **File plan:** Change `application/web/app/globals.css` for motion and hidden text, and record completion in `docs/HRIS_IMPLEMENTATION_PLAN.md`.
8. **Verification:** Check smooth button, keyboard, and drag resizing at both width boundaries; inspect compact labels, desktop/mobile breakpoints, and reduced motion. No backend or HRIS phase change.

## Compact layout correction

1. **Component tree and responsibilities:** Keep `AppShell` and `SidebarNavItem`; CSS constrains the existing navigation grid and icon rows within the compact rail.
2. **Contracts and state:** No prop, API, storage, or state changes. The existing 72px compact width and expanded range remain.
3. **Visual system:** Give desktop navigation grids zero-minimum columns and full available width; center each compact icon within its row. Preserve label fade, tooltips, and mobile drawer styling.
4. **Accessibility:** Link names, focus states, keyboard resize, and reduced-motion behavior remain as designed.
5. **File plan and verification:** Update `application/web/app/globals.css` and this design, then record the correction in `docs/HRIS_IMPLEMENTATION_PLAN.md`. Inspect compact alignment with overflow and long navigation labels.

## Compact brand alignment

The compact brand retains no space for the hidden wordmark, so the 38px M mark centers on the same axis as the navigation icons. `AppShell` state and navigation contracts remain unchanged. Animate the brand gap with the existing width transition; retain full brand spacing in expanded and mobile views and honor reduced-motion preferences. Change only the sidebar CSS and phase tracker.
