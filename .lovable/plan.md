

## Plan: Fix Slow Room Loading in Service Order Screen

### Root Cause

The `occupiedGuests` query in `OrderType.tsx` (lines 46-85) makes **3 separate queries** then does O(N^2) string matching in JavaScript:
1. Query `resort_ops_units` (all units)
2. Query `resort_ops_bookings` with guest join (all active bookings)
3. Filter `units` (from a separate useQuery) by matching unit names case-insensitively

Additionally, the query **depends on `units` data** from another useQuery — if that hasn't loaded yet, the filter produces nothing until re-render.

### Fix

#### 1. Replace with a single optimized query (`OrderType.tsx`)

Instead of 3 queries + JS matching, do one query on `resort_ops_bookings` with joins:

```typescript
const today = new Date().toISOString().split('T')[0];
const { data } = await supabase
  .from('resort_ops_bookings')
  .select('id, check_in, check_out, unit_id, resort_ops_guests(full_name), resort_ops_units(name)')
  .lte('check_in', today)
  .gt('check_out', today);
```

Then match results back to `units` by name (still needed for unit IDs used in the order flow), but now it's a single DB round-trip.

Also add `staleTime: 30000` to cache the result for 30s across re-renders.

#### 2. Add database indexes (migration)

```sql
CREATE INDEX IF NOT EXISTS idx_resort_ops_bookings_dates ON resort_ops_bookings(check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_resort_ops_bookings_unit_id ON resort_ops_bookings(unit_id);
```

#### 3. Remove dependency on `units` query completion

Currently `occupiedGuests` uses `(units || []).filter(...)` where `units` comes from a separate `useQuery`. This creates a timing dependency. Instead, query units inline or merge the occupied-guests logic to be self-contained by also fetching the `units` list inside the same queryFn (single additional query, but no cross-query dependency).

### Files to edit

| File | Change |
|------|--------|
| `src/pages/OrderType.tsx` | Rewrite `occupiedGuests` queryFn to use single joined query + add staleTime |
| Database migration | Add indexes on `resort_ops_bookings(check_in, check_out)` and `resort_ops_bookings(unit_id)` |

