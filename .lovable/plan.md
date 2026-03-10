

## Auto-Post Accommodation Charges to Guest Folio

### Problem
Right now, the `room_rate` is stored on the booking but **never posted as a `room_transaction`**. The guest folio (and guest portal) only shows F&B orders, tours, transport, and manual quick charges — but not the actual accommodation cost. The checkout modal displays `nights × rate` as informational text but doesn't include it in the balance calculation. This means:
- Guest portal shows no room charges
- The folio balance is incomplete
- Reception can't adjust/delete accommodation charges
- Checkout balance doesn't reflect the full stay cost

### Solution
**Auto-post nightly accommodation charges at check-in**, then let reception edit/delete them via the existing billing tab.

### Changes

**1. `src/pages/ReceptionPage.tsx` — Post accommodation charges at check-in**
- In `handleReservationCheckIn` and `handleWalkIn`: after setting unit to `occupied`, calculate `nights × room_rate` and insert a single `room_transaction` with `transaction_type: 'accommodation'` and notes like `"3 nights × ₱2,500/night"`
- For imported reservations (Booking.com, Airbnb, etc.) that already have `paid_amount`, also insert a corresponding payment transaction so the pre-paid amount is reflected
- This covers all booking sources: direct, walk-in, and bulk imports

**2. `src/components/rooms/RoomBillingTab.tsx` — Show accommodation charges prominently**
- In the Room Ledger section, accommodation charges will already appear (they're just `room_transactions`)
- Add an inline edit/delete capability for accommodation transactions so reception can adjust the nightly rate or number of nights after check-in
- Add a delete button on accommodation charge rows (with confirmation) so reception can remove and re-add if the rate changes

**3. `src/components/rooms/AdjustmentModal.tsx` — Add "Accommodation" to quick charges**
- Add an "Accommodation" option to the `QUICK_CHARGES` array so reception can manually post room charges if needed (e.g., extending a stay, rate changes)

**4. `src/components/rooms/CheckoutModal.tsx` — Remove duplicate display**
- The checkout modal currently shows `nights × rate` as info text separate from the ledger. Since accommodation is now in the ledger, the balance will be correct automatically. Keep the info line but remove any separate calculation that would double-count.

### Flow by Booking Source

**Direct / Walk-In:**
```
Check-in → auto-inserts room_transaction (accommodation: 3 nights × ₱2,500 = ₱7,500)
→ appears on guest folio + guest portal immediately
→ reception can edit/delete if rate negotiated differently
```

**Imported (Booking.com / Airbnb / Agoda):**
```
CSV import creates booking with room_rate + paid_amount
→ Check-in → auto-inserts accommodation charge (₱7,500)
→ Also inserts pre-payment transaction (-₱7,500 via Booking.com)
→ Balance shows ₱0 for accommodation (pre-paid)
→ Only F&B/tours/extras show as outstanding
```

### Files to Edit
1. `src/pages/ReceptionPage.tsx` — Insert accommodation + pre-payment transactions at check-in
2. `src/components/rooms/RoomBillingTab.tsx` — Add delete button on accommodation rows
3. `src/components/rooms/AdjustmentModal.tsx` — Add "Accommodation" quick charge
4. `src/components/rooms/CheckoutModal.tsx` — Remove separate nights×rate display (now in ledger)

