

## Plan: Reception Calendar System

### Overview
Add a full calendar component at the bottom of `ReceptionPage.tsx` that visualizes bookings from `resort_ops_bookings` with multi-view toggle, conflict prevention, and CRUD operations.

### Data Model (existing — no migrations needed)
- **resort_ops_bookings**: `id`, `unit_id`, `guest_id`, `check_in`, `check_out`, `platform`, `room_rate`, `adults`, `children`, `notes`, `paid_amount`
- **resort_ops_units**: `id`, `name`, `type`, `base_price`, `capacity`
- **resort_ops_guests**: `id`, `full_name`, `email`, `phone`

### New Component: `src/components/reception/ReceptionCalendar.tsx`

**View Toggle** (Week / 2-Week / Month):
- ToggleGroup at top with date navigation (prev/next arrows)
- Default: Week view

**Layout**:
- **Mobile**: Vertically stacked day cards, each listing bookings for that day
- **Desktop**: Grid with rooms as rows, dates as columns; booking spans rendered as colored bars

**Booking Display**:
- Color-coded by status/platform: Green (Confirmed/Direct), Yellow (Pending/partial payment), Red (Maintenance blocks)
- Check-in arrow (→) and check-out arrow (←) indicators
- Guest name + room name on each bar/card
- Click to open edit modal

**Conflict Prevention** (`src/components/reception/ConflictModal.tsx`):
- Before inserting/updating a booking, query `resort_ops_bookings` for overlapping date ranges on the same `unit_id`
- If conflict found, show modal with: conflicting booking details, list of alternative available rooms, override button (visible only if `canManage('reception')`)
- Helper function: `checkAvailability(unitId, checkIn, checkOut, excludeBookingId?)`

**CRUD Modals**:
- **Add Reservation** (`src/components/reception/AddReservationModal.tsx`): Room picker, guest name, dates, platform, rate — runs conflict check before save. Creates `resort_ops_guests` entry if new guest, then inserts `resort_ops_bookings`.
- **Edit Reservation**: Reuses same modal in edit mode, pre-filled with existing data. Conflict check on date/room changes.
- **Delete Reservation**: AlertDialog confirmation, deletes from `resort_ops_bookings`.
- **Block Room**: Special "Maintenance" booking with no guest, red color coding.

**Permissions**:
- Uses `usePermissions` hook
- View-only users see calendar but no Add/Edit/Delete buttons
- Override on conflicts requires `canManage('reception')`

### Integration with ReceptionPage
- Import `ReceptionCalendar` at bottom of `ReceptionPage.tsx` (after existing content)
- Pass `bookings`, `resortUnits`, `units`, `canDoEdit`, `canDoManage` as props
- Shares the existing `rooms-bookings` query key for cache consistency

### Files
```
CREATE  src/components/reception/ReceptionCalendar.tsx    (main calendar component)
CREATE  src/components/reception/AddReservationModal.tsx   (add/edit reservation)
CREATE  src/components/reception/ConflictModal.tsx         (conflict warning + alternatives)
CREATE  src/components/reception/calendarUtils.ts          (date helpers, availability check)
EDIT    src/pages/ReceptionPage.tsx                        (add calendar at bottom)
```

No database migrations needed — uses existing tables and RLS policies.

