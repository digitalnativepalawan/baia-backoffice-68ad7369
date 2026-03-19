

## Plan: Simplify Cashier View

### Current State
The CashierBoard already filters to Served-only orders and has in-stay guest detection working. However, the UI still has visual clutter: grouped room collapsibles, status dots for kitchen/bar, "BILL OUT" headers, redundant summary strip text.

### Changes

**`src/components/service/CashierBoard.tsx`**

1. **Remove `GroupedBillOut` component** — replace with a flat list of `OrderRow` cards. No room grouping, no collapsibles for the main order list.

2. **Simplify `OrderRow`** — remove kitchen/bar status dots (Flame/GlassWater icons with colored dots). Cashier doesn't care about department prep status. Keep: guest name, location, elapsed time, total amount, and a simple "Pending Payment" badge.

3. **Simplify summary strip** (line 188-197) — show just "{n} orders awaiting payment" instead of duplicating "X Served" and "X BILL OUT".

4. **Remove "💰 BILL OUT — Awaiting Payment" header** (line 203) — unnecessary label. The whole view IS bill out.

5. **Clean empty state** — keep the "No served orders awaiting payment" message as-is (already clean).

6. **BillOutPanel** — already correct with in-stay detection. No changes needed there.

### Result
- Clean flat list of served orders on the left
- Tap an order → payment panel on right with smart Charge to Room / Pay Now