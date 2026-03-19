

## Plan: Hide Completed Tours from Reception Dashboard

### Problem
Completed tours still show on the Reception "Tours & Activities" section with a "completed" badge. Once a tour is completed (and charged to the room ledger), it should disappear from the Reception operational view — it's already visible in Guest Services and on the guest bill.

### Changes

**`src/pages/ReceptionPage.tsx`**

1. **Filter out completed/cancelled tours from `todayTours` display** (line 1264):
   - Change `todayTours.map(...)` to `todayTours.filter(t => t.status !== 'completed' && t.status !== 'cancelled').map(...)`

2. **Fix the section count and visibility** (line 1263):
   - Update the count to only reflect active (non-completed, non-cancelled) tours
   - Update the section visibility condition to hide when all tours are completed/cancelled

3. **Filter completed `tourBookings`** from the confirmed section (line 1319):
   - The `tourBookings` query already excludes cancelled but still shows completed — filter those out in the render

4. **Move the room charge posting from "confirm" to "complete"** (line 465):
   - Currently the room transaction is posted when *confirming* a tour, but the plan says it should post on *completion*
   - Move the `room_transactions` insert from the `status === 'confirmed'` block to a `status === 'completed'` block in `updateTourStatus`
   - Do the same for `completeTourBooking`

### Result
- Completed tours vanish from Reception immediately
- They remain visible in Guest Services (already works)
- The charge appears on the guest bill via the room ledger
- Only active/pending tours show in the operational view

### Files
- `src/pages/ReceptionPage.tsx` (~15 lines changed)

