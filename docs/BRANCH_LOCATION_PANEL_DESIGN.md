# Branch location panel - 2026-10-23

Fix viewport-based desktop location columns that squeeze/overlap the map inside the shared 720px panel. BranchFormDialog keeps one location column: full-width picker, then address/city/province/postal fields. Existing two-column address fields may remain within that block; mobile fields stack. No branch payload, permissions or provider change.

Picker owns existing search/cache/rate limit, results and marker interaction. Add scoped CSS for clear heading, labelled search row, full-width bounded map, contained results and quiet help/coordinates. Existing search result selection updates the same parent fields; manual fields remain usable. Loading/map failure and search error stay explicit. Leaflet invalidates its dimensions after initialization and when its container resizes, with observer/frame cleanup. No nested form, auto lookup or new geocoding behavior. Native keyboard-operable result buttons and manual address entry remain, with visible focus and mobile search wrapping.

Verify actual branch dialog layout at 390/1440px, no map/address overlap or panel overflow, labelled search, search/selection mapping, resize handling and error/manual fallback through a fixture with simulated Leaflet/provider data. Focused tests, lint, TypeScript and build; distinguish mock map/browser checks from live provider availability. No real branch update or active Phase 1 change.

Branch location final verification: production Next.js Webpack build passed. Browser fixture evidence is under tmp/branch-location-review. No migration or configuration is needed.
