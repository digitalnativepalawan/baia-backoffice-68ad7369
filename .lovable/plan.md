

## Plan: Fix Room Charge Flow End-to-End

### Root Causes Identified

1. **Reception "Served · Room Charge" sets `status: 'Served'`** — but `booking_id` is never set on the `room_transactions` insert (hardcoded `null`), and `room_id` might be null, so no transaction is created at all.
2. **Reception status badge** shows "Paid" for room-charged orders because `statusMap` doesn't have a dedicated entry for `payment_type === 'Charge to Room'`.
3. **Guest Portal "My Bill"** queries unpaid orders with `.neq('payment_type', 'Charge to Room')` — this explicitly **excludes** room-charged orders from the bill. Room-charged orders also have `status: 'Served'` (not `'Paid'`), so they fall through both queries.
4. **RoomBillingTab** similarly filters out `payment_type === 'Charge to Room'` from `unpaidOrdersTotal`, so room charges via orders don't show in the balance.
5. **Cashier** already works correctly for room charges but the `handleConfirmPayment` needs the booking match to work without `selectedBooking` when `inStayBooking` is auto-detected.

### Changes

#### 1. `src/pages/ReceptionPage.tsx` — Fix Room Charge transaction creation

**Lines ~1496-1520**: The "Served · Room Charge" handler:
- Look up the active booking by matching `order.location_detail` against `resort_ops_units.name` (already have `activeBookings` or query inline) when `order.room_id` is null
- Set `booking_id` on the `room_transactions` insert (currently hardcoded `null`)
- Set `room_id` on the order update so downstream queries can find it
- Always create the `room_transaction` record (currently skipped if `room_id` is null)

**Lines ~1401-1409**: Add a dedicated status for room-charged orders in `statusMap`:
- When `order.payment_type === 'Charge to Room'` and status is `'Served'`, show a blue "🏠 Room Charge" badge instead of "✅ Served"
- Add a "Collect Now" button for room-charged orders so staff can mark them paid on the spot

#### 2. `src/pages/GuestPortal.tsx` — Show room charges in "My Bill"

**Lines ~1062-1081**: The `unpaidOrders` query currently excludes `Charge to Room` orders. Fix:
- Add a **separate query** for room-charged orders: orders with `payment_type = 'Charge to Room'` and `status` in `['Served']` (not yet settled)
- Show them in the bill as "Room Charge" line items with amounts
- Include their total in the balance calculation (~line 1213)

**Lines ~1288-1351**: Render room-charged orders in a dedicated section with a blue "Room Charge" badge and full amount display (instead of ₱0).

#### 3. `src/components/rooms/RoomBillingTab.tsx` — Show room charges in folio

**Lines ~86-87 and ~131-140**: Currently `unpaidOrders` is `roomOrders.filter(o => o.status !== 'Paid')`, but room-charged orders have `status: 'Served'`. The balance calculation at line 132 explicitly excludes `Charge to Room` from `unpaidOrdersTotal`. Fix:
- Room-charged orders are already tracked via `room_transactions`, so they're counted in `totalCharges`. The current exclusion from `unpaidOrdersTotal` is correct to avoid double-counting.
- BUT: if the transaction was never created (bug #1), they show as ₱0. Fixing bug #1 above will fix this.
- Add a visual section showing room-charged orders with "Room Charge" badge and "Collect Now" button.

#### 4. `src/pages/ReceptionPage.tsx` — Add active bookings query for room matching

Need to fetch active bookings in ReceptionPage to resolve `booking_id` and `unit_id` when creating room transactions. Add a query similar to what CashierBoard uses.

### Files Changed
- `src/pages/ReceptionPage.tsx` (~40 lines changed — fix transaction creation, add badge, add Collect Now button, add bookings query)
- `src/pages/GuestPortal.tsx` (~30 lines changed — add room-charge orders query, display section, include in balance)
- `src/components/rooms/RoomBillingTab.tsx` (~10 lines changed — add visual display for room-charged orders with Collect Now)

### Technical Details

**Order lifecycle for room charges:**
```text
Order placed → Kitchen/Bar prepares → Ready → 
  Reception clicks "Served · Room Charge" →
    order.status = 'Served'
    order.payment_type = 'Charge to Room'  
    order.room_id = unit_id (resolved from location_detail)
    room_transactions record created with booking_id
  → Appears in Guest Portal "My Bill" as room charge line
  → Appears in Room Billing folio via room_transactions
  → At checkout, balance includes these charges
```

**Key fix**: The `room_transactions` insert must always happen (not gated on `order.room_id` which is null before the update). Resolve the unit/booking by matching `order.location_detail` against active bookings.

