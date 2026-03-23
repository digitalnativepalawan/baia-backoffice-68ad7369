

## Two Fixes: Guest Services Double Display + Guest Portal Bill Tours

### Problem 1: Guest Services (ExperiencesPage) Double Display
The ExperiencesPage queries BOTH `guest_tours` (lines 74-82) and `tour_bookings` (lines 86-96), then displays both in "Today's Tours" section (lines 393-481). Since tours added from RoomsDashboard now insert into BOTH tables, the same tour appears twice.

**Fix**: Remove the `guest_tours` query entirely from ExperiencesPage. Switch all tour display and actions to use `tour_bookings` only. This means:
- Remove the `guest_tours` query (lines 74-82) and the `recentTours` history query (lines 123-131)
- Update the `tour_bookings` query to include all statuses needed (booked, confirmed, completed, pending) and cover today + upcoming dates
- Update `todayTours`, `completedToday`, `upcomingTours` variables to derive from the unified `tourBookings` data
- Update the summary counts and "Today's Tours" rendering to use only `tourBookings`
- Remove the separate `todayTours.map(...)` rendering block (lines 400-441) since `todayBookings` from tour_bookings now covers everything
- Keep the `updateTourStatus` function but change it to update `tour_bookings` instead of `guest_tours`
- Update the "Upcoming Tours" section to use filtered `tourBookings`
- Keep recent history query but switch to `tour_bookings` table

### Problem 2: Guest Portal Bill — Show Tours Immediately
The BillView (GuestPortal.tsx) queries `guest_tours` for pending tours (lines 1108-1118) with status `['booked', 'pending']` and completed tours (lines 1120-1130) with status `['completed', 'confirmed']`. Since tours are now in `tour_bookings`, these queries return empty.

**Fix**: Switch both queries to read from `tour_bookings` instead of `guest_tours`. Also adjust the logic so confirmed tours show immediately in the bill with their full amount:
- Change `pendingTours` query to read from `tour_bookings` with status `['booked', 'pending', 'confirmed']` — this ensures confirmed tours appear immediately with a "Pending" badge
- Change `completedTours` query to read from `tour_bookings` with status `['completed']`
- Update the balance calculation: `activeToursTotal` now includes confirmed tours (already does since confirmed is in pendingTours)
- Update realtime subscription from `guest_tours` table to `tour_bookings` table (line 1201)

### Files Modified
- `src/pages/ExperiencesPage.tsx` — consolidate to `tour_bookings` only
- `src/pages/GuestPortal.tsx` — switch bill queries from `guest_tours` to `tour_bookings`, include confirmed status

### What Does NOT Change
- Guest Portal tour booking flow (already writes to `tour_bookings`)
- RoomsDashboard, RoomBillingTab, ReceptionPage
- Payment flows, billing logic
- No schema changes

