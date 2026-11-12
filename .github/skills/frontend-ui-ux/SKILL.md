---
name: frontend-ui-ux
description: "Design, build, critique, or refine frontend UI/UX in this workspace. Use for Next.js pages and components, interaction design, responsive layouts, accessibility, visual systems, and frontend usability improvements."
argument-hint: "Describe the UI or workflow, its users, and any visual references or constraints."
---

# Frontend UI/UX

Turn a product or workflow need into a clear, usable, accessible interface that fits the existing application. Use this skill for UI design, implementation, redesign, and focused UX critique in `application/web`.

## Workflow

1. **Clarify the job.** Identify the audience, their primary task, the context of use, and what success looks like. Inspect the existing page, nearby components, styles, assets, and frontend conventions before proposing changes. Ask a concise question only when a missing decision would materially change the design; otherwise state a reasonable assumption and proceed.
2. **Respect the product.** For an existing application, preserve its established design system and interaction patterns. Tailor hierarchy and density to the work: operational tools should be scannable and efficient; expressive visual treatments should support the product rather than obscure it. Do not turn a request for an application into a marketing landing page.
3. **Define the experience before implementation.** For anything beyond a trivial change, present a concise design brief:
   - **Component tree:** page, layout, feature, and reusable primitives.
   - **Responsibilities:** ownership and purpose of each component.
   - **Contracts:** typed props, events, data dependencies, and error shape.
   - **State model:** server, URL, form, and local UI state; include applicable loading, empty, error, disabled, success, unauthorized, and destructive-confirmation states.
   - **Visual system:** task hierarchy, content grouping, grid, spacing, typography, color roles, responsive behavior, and feedback.
   - **Accessibility:** semantics, accessible names, keyboard flow, focus handling, validation feedback, contrast, zoom, and reduced motion.
   - **File plan and verification:** exact ownership boundaries and the focused checks that will establish success.
     For a tiny change, keep the brief proportionate but still name the component contract, affected states, and accessibility behavior.
4. **Make the UI legible and distinctive.** Establish the primary task and action first. Use typography, spacing, color, and imagery intentionally; avoid generic component arrangements or decoration that competes with content. Use existing tokens and components where available. Choose familiar control patterns for the action, provide clear labels and feedback, and make text fit without overlap at supported sizes.
5. **Build with the framework.** Read the applicable project and directory instructions and the relevant installed Next.js documentation before changing framework code. Keep server rendering by default; add client-side behavior only where interaction or browser APIs require it. Keep component boundaries focused, validate external data, and do not expose secrets or trust client-side authorization.
6. **Verify the experience.** Run the narrowest relevant lint, typecheck, or test immediately after the first implementation edit. Then verify the primary interaction and meaningful state transitions, keyboard use and visible focus, and representative narrow and wide viewports. Use browser automation or screenshots when available; inspect for clipping, overlap, missing assets, and unreadable contrast. Respect reduced-motion preferences. Report checks run and any remaining gaps.

## Completion Criteria

- The primary user task is obvious and can be completed without avoidable friction.
- The layout and controls remain usable at narrow and wide viewport sizes, with no incoherent overlap or clipping.
- Interactive elements have semantic controls, accessible names, keyboard behavior, focus feedback, and useful validation or status feedback.
- Relevant loading, empty, error, permission, and confirmation states are handled rather than implied.
- Visual decisions fit the product and existing conventions; decoration does not displace content or action.
- Focused checks pass, or unverified behavior and residual risks are stated plainly.
