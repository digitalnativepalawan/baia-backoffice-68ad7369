

## Plan: Restore "Charge to Room" in Cashier Payment Panel

### Problem
The "Charge to Room" option was removed from the Cashier's payment panel (line 584: `{/* Room charging removed from cashier — handled at reception */}`). The cashier needs this option because some resort guests prefer to pay at checkout rather than immediately. The cashier should be able to choose **Pay Now** (Cash, Card, GCash, etc.) OR **Charge to Room** (added to guest folio for checkout settlement).

Multiple orders from the same guest/location are already grouped together in the Bill Out section via the `GroupedBillOut` component — this is working correctly.

### Fix: 1 file, 1 change

**`src/components/service/CashierBoard.tsx`** — BillOutPanel (line 583-585)

Replace the removed comment with the actual "Charge to Room" UI:
- Add a **"Charge to Room"** button below the payment method grid
- When selected, show a dropdown/list of active bookings (already fetched via `activeBookings` query on line 97-109)
- The cashier picks the guest's booking → confirms → order gets `payment_type = 'Charge to Room'`, `room_id`, and `status = 'Paid'`
- This logic already exists in `handleConfirmPayment` (lines 146-151) — it just needs the UI button restored

The `chargeToRoom`, `onChargeToRoom`, `activeBookings`, `selectedBooking`, and `onSelectBooking` props are all already wired up and passed to `BillOutPanel` — only the rendering was removed.

### What to add (replacing line 584)
- A divider with "OR" label
- A "Charge to Room" button that triggers `onChargeToRoom`
- When `chargeToRoom` is true, show the list of active bookings (unit name + guest name) as selectable cards
- Selecting a booking calls `onSelectBooking`

### Result
Cashier payment panel shows:
1. Payment method buttons (Cash, Credit Card, etc.)
2. **OR — Charge to Room** button
3. When clicked: list of active bookings to select
4. Confirm → order goes to guest folio, visible in guest portal

No other files need changes. The backend logic, booking query, and confirmation handler are all already in place.

