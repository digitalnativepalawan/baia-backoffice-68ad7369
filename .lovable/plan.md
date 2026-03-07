

## Plan: Fix Lingering Orders + Seamless Checkout Cleanup

### Root Problem
The Experiences page shows **all** completed/confirmed guest requests and tour bookings indefinitely — there's no filter by active booking or checkout status. When a guest checks out, their completed requests (Rental, Transport, etc.) keep showing because the queries only exclude `cancelled`, not `completed`. The checkout flow also doesn't clean up related guest_requests/tour_bookings.

### Changes

**1. Checkout cleanup — auto-close related requests** (`src/components/rooms/CheckoutModal.tsx`)
- After checkout, update all `guest_requests` and `tour_bookings` linked to the same `booking_id` that are still `pending` → set them to `cancelled` (guest left, no longer actionable)
- This prevents orphaned pending requests from lingering after checkout

**2. Experiences page — only show actionable items** (`src/pages/ExperiencesPage.tsx`)
- **Guest Requests query**: Filter out `completed` status (only show `pending` and `confirmed`) — completed requests are historical and belong in archive, not the active dashboard
- **Tour Bookings query**: Same — exclude `completed` status from the active view
- Add a "Recent History" collapsible section at the bottom for completed items from the last 24 hours only, so staff can reference recent activity without clutter
- Add date filtering: only show requests from the last 7 days max to prevent old data accumulating

**3. Reception page — cross-reference active bookings** (`src/pages/ReceptionPage.tsx`)
- In any section showing guest requests or tours, cross-check against active bookings (where the unit is currently occupied) so checked-out guest data doesn't appear in active views
- Ensure checkout invalidates experience-related query keys so the Experiences page refreshes immediately

### Files to Edit
1. `src/components/rooms/CheckoutModal.tsx` — cancel pending requests/bookings on checkout
2. `src/pages/ExperiencesPage.tsx` — filter out completed items from active view, add recent history section
3. `src/pages/ReceptionPage.tsx` — invalidate experience queries on checkout

