

## Enhance Room Billing Tab with Full Folio Management

### Problem
From the screenshots, the current billing view has gaps:
1. **Adjustment modal is too generic** — "Discount / Void / Complimentary / Correction" only works against existing room_transactions, but doesn't let staff adjust specific F&B orders (change price, partial discount), edit tour prices, or modify request charges
2. **No edit capability on ledger items** — staff can only delete accommodation charges; all other room_transactions have no edit/delete
3. **F&B orders can only be Comped or Deleted** — no partial discount, no price edit, no ability to mark as Paid individually
4. **Tours/requests have no price editing** — cancel and delete only, can't adjust the price if negotiated differently
5. **Guest portal shows transactions but has no itemized breakdown** of what each charge is for (F&B items, tour details, etc.)
6. **Room Ledger shows ₱0 balance** even though there are paid orders and rentals visible — the accommodation charge wasn't posted (separate issue, already fixed), but the ledger also doesn't include F&B order totals or tour/request costs in the summary

### Changes

**1. `src/components/rooms/RoomBillingTab.tsx`** — Add full inline management
- **Edit F&B order total**: Add an "Edit" button on each unpaid order that opens an inline input to adjust the total (e.g., discount a drink from ₱300 to ₱200)
- **Mark individual orders as Paid**: Add a "Mark Paid" button so staff can settle one order at a time without full checkout
- **Edit tour price**: Add an inline edit button on tour cards to change the price
- **Mark tour/request as Completed**: Add a "Complete" button on active tours/requests so they count toward the bill
- **Delete any room_transaction** (not just accommodation): Add trash icon on all ledger entries for admin/receptionist
- **Edit room_transaction amount**: Add an edit button on ledger rows to modify the amount (with audit log)

**2. `src/components/rooms/AdjustmentModal.tsx`** — Make adjustments more specific
- **Percentage discount option**: Add a "% Discount" field so staff can enter 10% off instead of calculating manually
- **Custom amount adjustment**: Allow entering a specific discount amount (not just reversing the full charge)
- **Apply to all charges**: Option to apply a blanket discount across the entire folio
- Filter the "Select Charge" dropdown to show ALL transaction types (not just `room_charge`)

**3. `src/pages/GuestPortal.tsx` (BillView)** — Enhanced guest transparency
- **Show F&B order items**: Display itemized order contents (e.g., "1× Mango Daiquiri") instead of just "Food & Drink Order"
- **Show completed tours/requests** in the confirmed section with prices
- **Show accommodation charge** clearly labeled with nights breakdown
- **Real-time status indicators**: Show order status (Preparing → Ready → Served) so guests know what's happening

### Files to Edit
1. `src/components/rooms/RoomBillingTab.tsx` — Add edit/paid/complete/delete actions on all sections
2. `src/components/rooms/AdjustmentModal.tsx` — Add percentage discount and custom amount options, expand charge selection
3. `src/pages/GuestPortal.tsx` — Enhance BillView with itemized F&B orders, completed tours/requests, and status badges

