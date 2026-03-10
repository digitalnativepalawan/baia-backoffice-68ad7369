

## Redesign Calendar Status Colors to Reflect Real Occupancy

### Problem
The current calendar color logic is confusing:
- **"Confirmed"** (green) = booking has a payment or is "Direct" platform -- but this doesn't tell you if the guest is actually checked in
- **"Pending"** (amber) = no payment yet -- but a checked-in guest with no prepayment shows as "pending"
- **"Maintenance"** (red) = room blocked for maintenance -- unclear label

A checked-in guest like David Le shows the same color as an upcoming reservation. The statuses should reflect **operational reality**.

### New Status System

| Status | Color | Meaning |
|--------|-------|---------|
| **Occupied** | Blue | Guest is checked in (unit status = `occupied` and booking matches) |
| **Upcoming** | Amber/Yellow | Reservation exists but guest hasn't checked in yet |
| **Checked Out** | Gray | Past booking, guest departed |
| **Blocked** | Red | Room blocked for maintenance/cleaning |

### How It Works
1. Query the `units` table alongside bookings to know which units are currently `occupied`
2. Cross-reference: if the booking's unit has `status = 'occupied'` AND today falls within the booking dates → **Occupied**
3. If the booking's check-in is today or future and unit is not occupied → **Upcoming**
4. If the booking's check-out is in the past → **Checked Out** (or just dim/gray)
5. If `platform = 'Maintenance'` → **Blocked**

### Changes

**1. `src/components/reception/calendarUtils.ts`**
- Update `getBookingStatus()` to accept unit status as a parameter
- New return values: `'occupied' | 'upcoming' | 'checked_out' | 'blocked'`
- Update `statusColors` map with new color set
- Update `BookingWithGuest` interface or add optional `unit_status` field

**2. `src/components/reception/ReceptionCalendar.tsx`**
- Pass unit status data into the status calculation
- Create a lookup map: `unitId → unit.status`
- Update legend to show: Occupied (blue), Upcoming (amber), Blocked (red)
- Update `renderBookingChip` to use new status logic

**3. `src/pages/ReceptionPage.tsx`**
- Pass the `units` data (which already includes `status`) to the calendar component so it can cross-reference

### Technical Detail

Status resolution logic:
```typescript
const getBookingStatus = (booking, unitStatus?: string) => {
  if (booking.platform === 'Maintenance') return 'blocked';
  const today = new Date().toISOString().split('T')[0];
  if (booking.check_out <= today) return 'checked_out';
  if (unitStatus === 'occupied' && booking.check_in <= today) return 'occupied';
  return 'upcoming';
};
```

Color map:
```typescript
occupied:    { bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/40' }
upcoming:    { bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/40' }
checked_out: { bg: 'bg-muted/30',       text: 'text-muted-foreground', border: 'border-border' }
blocked:     { bg: 'bg-destructive/20', text: 'text-destructive', border: 'border-destructive/40' }
```

