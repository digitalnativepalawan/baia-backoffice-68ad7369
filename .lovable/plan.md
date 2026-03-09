

## Plan: Add Ping Sound for New Housekeeping Orders

### Problem
When reception or admin assigns a room for cleaning, the housekeeping staff's page shows the new order silently. There's no audio alert like the kitchen/bar get for F&B orders.

### How it works today
- **Kitchen/Bar** (`DepartmentOrdersView.tsx`): Uses Web Audio API (`AudioContext`) to play a chime tone when a new order arrives via Supabase realtime subscription
- **Housekeeping** (`HousekeeperPage.tsx`): Uses polling every 5 seconds (`refetchInterval: 5000`), no sound, no realtime

### Solution
Add the same Web Audio API ping pattern from `DepartmentOrdersView` to `HousekeeperPage`:

1. Create an `AudioContext` on first user interaction (touch/click) to unlock mobile audio
2. Add a Supabase realtime subscription on `housekeeping_orders` table for INSERT events
3. Play a distinct chime tone (different frequency from kitchen/bar, e.g. 520 Hz) when a new housekeeping order is inserted
4. Keep the existing polling as a fallback

### Files
```
EDIT  src/pages/HousekeeperPage.tsx  — Add AudioContext, realtime subscription, and ping sound on new housekeeping orders
```

### Technical Detail
- Reuse the exact `AudioContext` + oscillator pattern from `DepartmentOrdersView` (lines 50-84)
- Subscribe to `postgres_changes` INSERT events on `housekeeping_orders` table
- Use a lower frequency (520 Hz) to distinguish from kitchen (880 Hz) and bar (660 Hz)
- Unlock audio context on first touch/click for mobile compatibility

