

## Two Fixes: Double Charge Bug + Tours Board Sync

### Root Cause Analysis

**Double Charge Bug**: Tour room_transaction records are inserted in THREE separate places:
1. `ExperiencesPage.updateTourStatus` — charges on **confirm** (line 215-231)
2. `ReceptionPage.updateTourStatus` — charges on **complete** (line 454-470)
3. `RoomBillingTab.handleCompleteTour` — charges on **complete** (line 197-212)

A tour confirmed from Experiences gets charged once, then completed from Reception or Billing gets charged again = double entry.

**Tours Board Sync**: `RoomsDashboard.addTour` (line 352) only inserts into `guest_tours`. Nothing writes to `tour_bookings`, so `/service/tours` never sees it.

### Fix 1 — Remove Duplicate Charge Inserts

Keep room_transaction insertion ONLY in `RoomBillingTab.handleCompleteTour` (the dedicated billing component). Remove it from:

- **`ReceptionPage.tsx`** (lines 454-470): Remove the `if (status === 'completed' ...)` block that inserts room_transaction
- **`ExperiencesPage.tsx`** (lines 215-231): Remove the `if (status === 'confirmed' ...)` block that inserts room_transaction

This ensures exactly ONE charge is created, only when the tour is marked done from the room's billing tab.

### Fix 2 — Sync to tour_bookings on Add

In `RoomsDashboard.addTour` (line 352-373), after inserting into `guest_tours`, also insert a matching record into `tour_bookings` with the same data (mapping `unit_name` → looking up `room_id` from the selected unit). This makes the tour visible on `/service/tours`.

Fields to map:
- `guest_name` ← from `currentBooking.resort_ops_guests.full_name`
- `tour_name`, `tour_date`, `pax`, `price`, `pickup_time`, `notes` ← same values
- `booking_id` ← from `currentBooking.id`
- `room_id` ← from `selectedUnit.id`
- `status` ← `'confirmed'`
- `confirmed_by` ← staff name from localStorage

### Files Modified
- `src/components/admin/RoomsDashboard.tsx` — add tour_bookings insert in `addTour`
- `src/pages/ReceptionPage.tsx` — remove room_transaction insert from `updateTourStatus`
- `src/pages/ExperiencesPage.tsx` — remove room_transaction insert from `updateTourStatus`

### What Does NOT Change
- RoomBillingTab (keeps its single room_transaction on complete)
- Guest portal, payment flows, cashier, or any other pages
- No new tables or schema changes

