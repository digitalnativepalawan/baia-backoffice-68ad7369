

## Add Cancel to Tours — Display Only

### 1. ToursBoard.tsx (`/service/tours`)

- Add `useQueryClient` import and a `cancelTour` handler that sets `status = 'cancelled'` on `tour_bookings` and invalidates the query
- Expand `StatusFilter` type to include `'cancelled'`
- Add a "Cancelled" filter pill next to "Completed"
- Update the default filter behavior: when `statusFilter === 'all'`, hide cancelled tours (user must explicitly select "Cancelled" pill to see them)
- Add a "Cancel" button on each non-cancelled/non-completed tour card

### 2. ReceptionPage.tsx (Tours & Activities section)

- **guest_tours items (line 1261-1272)**: Add a "Cancel" button next to "Complete". On click, call `updateTourStatus(tour.id, 'cancelled', tour)` — this already updates `guest_tours` status. Also update the corresponding `tour_bookings` record if one exists (query by matching tour_name + tour_date + guest unit).
- **confirmed tour_bookings items (line 1315-1320)**: Add a "Cancel" button next to "Complete". On click, set `status = 'cancelled'` on `tour_bookings` (reuse existing `cancelTourBooking` which already exists but is only wired to pending bookings).

### Files Modified
- `src/components/service/ToursBoard.tsx`
- `src/pages/ReceptionPage.tsx`

### What Does NOT Change
- Billing, payment flows, room charges
- ExperiencesPage, GuestPortal, RoomsDashboard, or any other pages

