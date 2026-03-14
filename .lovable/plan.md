

## Plan: Room Orders Billing Separation & Partial Payment

### Problem
1. Room orders appear in the Cashier board — they should only appear in the Room Bill (reception)
2. Reception needs ability to let guests pay specific orders before checkout (partial bill settlement)
3. Paid orders not appearing in "Completed" section in cashier

### Changes

#### 1. `src/components/service/CashierBoard.tsx` — Exclude room orders

In the active orders query (~line 62) and completed orders query (~line 81), add a filter to exclude orders that have `room_id` set or `payment_type = 'Charge to Room'`:

```typescript
// Active orders: exclude room orders
.is('room_id', null)
.neq('payment_type', 'Charge to Room')

// Completed orders: same exclusion
.is('room_id', null)  
.neq('payment_type', 'Charge to Room')
```

Also remove the "Charge to Room" option from the BillOutPanel payment methods since room charging shouldn't happen from cashier.

#### 2. `src/components/rooms/RoomBillingTab.tsx` — Add selective order payment

Add a "Pay Selected Orders" flow to the Room Billing tab:
- Add checkboxes next to each unpaid order
- Add a "Pay Selected" button that opens a payment modal
- When confirmed, mark selected orders as `Paid` with the chosen payment method and record a `room_transactions` payment entry
- This lets guests pay specific F&B orders before full checkout

New UI elements:
- Checkbox on each unpaid order row
- "Pay Selected (X orders — ₱Y)" button in the action bar
- Reuse existing `AddPaymentModal` pattern for payment method selection, or create a small inline payment flow

#### 3. Fix "Completed" section in Cashier

The completed query already fetches `status = 'Paid'` orders. The issue is that room orders with `status = 'Paid'` were mixed in. By excluding room orders (change #1), only walk-in/dine-in paid orders will show in Completed — which is correct.

### Files to Edit

| File | Change |
|------|--------|
| `src/components/service/CashierBoard.tsx` | Filter out `room_id` orders from active + completed queries; remove "Charge to Room" from payment panel |
| `src/components/rooms/RoomBillingTab.tsx` | Add multi-select checkboxes on unpaid orders + "Pay Selected" flow with payment method picker |

