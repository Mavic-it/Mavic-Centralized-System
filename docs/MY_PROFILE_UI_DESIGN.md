# My Profile UI modernization

Scope: `/my-profile`, the independent Super Admin self-service profile. Linked employee profiles retain their existing `/me` redirect; this does not redesign Employee Portal or change main HRIS Phase 1.

## Audit and component tree

MyProfileWorkspace owns role/redirect checks, query/cache, draft values, form validation, mutations, photo fallback and unsaved-change protection. Current text and controls are smaller than the updated modules, with a separate token palette. Route loading has a structural skeleton, but query loading shows two unrelated blocks.

Keep AuthorizedWorkspacePage and MyProfileQueryProvider unchanged. Reuse workspace-theme tokens. MyProfileWorkspace retains existing props/state/requests and becomes a styled page header, identity/photo card, personal/emergency information and read-only account section. Extract MyProfileLoading as a shared presentation component for route and query loading. It has no data props and exposes busy/status semantics with silent placeholders. Keep the existing CSS module as the sole owner of profile presentation; other routes are unaffected.

## Contracts and state

No API or schema change. Existing independent/employee response union, nullable profile, form values and upload validation remain unchanged. Existing profile renders details and Edit action; missing profile renders initial setup. Draft/error/busy/success/cancel/photo states retain their current owners and handlers. Account email, role, status and timestamps remain read-only. Photo requires a saved profile; file limits, confirmation and secure own-photo URL stay intact. Unauthorized and employee-linked accounts retain redirects without displaying profile data.

## Visual and accessibility

Header context, identity with photo action guidance, grouped profile details/form, then read-only account details. Reuse neutral surfaces, red primary action, semantic statuses, 12px cards, 42px controls, 14px values/12px labels, consistent 24px spacing. Responsive 360/768/1024/1440px grids stack without hiding fields. Native labels/buttons, visible focus, associated hints/errors, semantic busy states, polite save/photo feedback, readable long values and reduced motion. Keep destructive/unsaved-change confirmation and focus handling in the shared dialog provider.

## File plan and verification

Update my-profile-workspace.tsx and its CSS module; add my-profile-loading.tsx and re-export it from the route loading file. Add focused render tests with seeded artificial independent/employee/null/error/loading responses using actual query/role providers and a mocked router. Produce isolated real-component visual fixtures; report their limitations separately from authenticated mutation checks. Run existing/full web tests, changed-file lint, TypeScript/production build and browser layout/focus review. Update the module tracker and maintained HRIS plan, preserving Phase 1.

## Verification results

- Baseline: 90 web tests passed. Final full suite: **97 tests across 34 files passed**, including seven new My Profile cases. The focused profile/provider/own-profile-link run passed 12 tests.
- Changed-file `bun run lint` passed without warnings. `bun run build` passed including TypeScript and route generation; the final typography-only refinement was also rebuilt.
- Headless Chrome checked actual-component saved/setup/loading/error fixtures at 360, 768, 1024 and 1440px (16 cases): no document overflow or out-of-bounds input/select/textarea controls, with visible 3px keyboard focus. Desktop/mobile screenshots were inspected. Fixtures use artificial data and mocked navigation; shared utility styling is not fully represented.
- Tests verify personal details/read-only account fields, five required setup fields, photo prerequisites, structural loading parity, error recovery, restricted/linked data visibility, escaping and encoded own-photo URLs. SSR checks do not establish that redirect effects run in a browser.
- Authenticated save/upload/remove, failed mutations, unsaved-change dialogs and live navigation were not exercised end-to-end. Their existing handlers, payloads, validation and shared confirmation implementation remain unchanged. No live records were modified.
