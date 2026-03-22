

## Add Tours Board to Service Mode

### Overview
Add a "Tours" card to the `/service` selection screen and a new `/service/tours` board page that displays tour bookings from the existing `tour_bookings` table as cards.

### Changes

**1. ServiceModePage.tsx — Add Tours department card**
- Add a `Compass` icon import from lucide-react
- Add a new entry to the `departments` array with key `tours`, route `/service/tours`, warm teal gradient, and permKeys `['experiences', 'reception']`
- Add a `tours` count to the counts memo that queries today's confirmed tour bookings

**2. New file: `src/pages/ServiceToursPage.tsx`**
- Simple page wrapper following the exact pattern of `ServiceKitchenPage.tsx`
- Uses `ServiceHeader` with department="tours" and renders a new `ToursBoard` component

**3. New file: `src/components/service/ToursBoard.tsx`**
- Fetches from `tour_bookings` table (upcoming + today, ordered by tour_date, pickup_time)
- Displays each booking as a card showing:
  - Guest name + unit (from `guest_name` field)
  - Tour name
  - Date + pickup time
  - Pax count badge
  - Notes (special requests)
  - Status badge: color-coded pill (confirmed = green, pending = amber, completed = muted)
- Auto-refreshes every 15 seconds
- Filter pills at top: All / Today / Upcoming
- Status filter: All / Confirmed / Pending / Completed

**4. App.tsx — Add route**
- Import `ServiceToursPage`
- Add route: `/service/tours` with `requiredPermission={['experiences', 'reception']}`

**5. ServiceHeader.tsx — Add tours label**
- Add `tours` to the department label map so the header shows "Tours" with appropriate icon

### Files to create/edit
- `src/pages/ServiceModePage.tsx` (edit — add tours card + count)
- `src/pages/ServiceToursPage.tsx` (new)
- `src/components/service/ToursBoard.tsx` (new)
- `src/App.tsx` (edit — add route)
- `src/components/service/ServiceHeader.tsx` (edit — add tours label)

