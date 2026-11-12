# Temporary client booking drafts

The client booking form saves its selected space and entered details in sessionStorage under `mspaces.booking-draft.v1`. Drafts expire after two hours of inactivity and restore on refresh of `/book` and `/review`. Storage errors do not prevent booking. Availability and prices are still checked by the backend.

Navigation between booking details and review retains the draft. Links leaving the flow and browser Back leaving the flow show a confirmation dialog. Keep booking preserves inputs; Discard draft and leave clears the local draft. Completing submission also clears the draft. Discarding never cancels a server reservation. Address-bar navigation and closing the browser are outside the custom navigation dialog.

Payment access tokens, uploaded proof, and large space images are excluded. Submission retry identity is retained to preserve idempotency after refresh. Booking terms acceptance must be selected again after refresh.

Validation commands, from `application/client-booking`:

```powershell
node --experimental-strip-types --test src/lib/booking-draft.test.mjs src/lib/booking-key.test.mjs
node ../../node_modules/next/dist/bin/next build
node ../../node_modules/next/dist/bin/next start -p 3015
# In another terminal; intercepts fixture APIs and does not create bookings:
node scripts/check-booking-draft-ui.mjs
```

The browser check covers form and review refresh, Escape and Keep booking, internal and external Back, clearing on discard, leaving through navigation links, and mobile overflow.
