

## Plan: Route All Served Orders Through Cashier for Payment Decision

### Problem
Currently, when kitchen/bar marks a room/tab order as "Served", it auto-closes to "Paid" (ServiceBoard line 200-203), bypassing the cashier entirely. The CashierBoard also explicitly filters out room orders (line 63-64: `.is('room_id', null).neq('payment_type', 'Charge to Room')`). The user wants ALL served orders — including guest unit orders — to flow through the cashier, where the cashier decides: **Pay Now** or **Charge to Room**.

### Solution: 3 changes across 2 files

**1. `src/components/service/ServiceBoard.tsx` — Stop auto-closing room/tab orders**
- Line 198-206: Change `mark-served` to ALWAYS set `status = 'Served'` regardless of room_id/tab_id. Remove the auto-pay logic. All orders go to "Served" and appear in the cashier's Bill Out queue.

**2. `src/components/service/CashierBoard.tsx` — Include room orders in Bill Out**
- Lines 59-67 (active orders query): Remove `.is('room_id', null)` and `.neq('payment_type', 'Charge to Room')` filters so room/unit guest orders with status "Served" appear in the cashier's list.
- Lines 83-88 (completed query): Keep the room_id filter for completed — room-charged orders don't need to show in cashier's completed list since they're tracked on the folio.
- The existing `BillOutPanel` already supports "Charge to Room" with booking selection and "Pay Now" with payment method selection — no changes needed there.

**3. `src/components/service/CashierBoard.tsx` — Update handleConfirmPayment**
- When cashier selects "Charge to Room", the order gets `payment_type = 'Charge to Room'`, `room_id`, and `status = 'Paid'` — this already works via the existing `handleConfirmPayment`.
- When cashier selects a direct payment method (Cash, Card, GCash), order gets `status = 'Paid'` with that payment method — also already works.

### Resulting Flow
```text
Kitchen/Bar: marks Ready → staff marks Served
    ↓
Cashier Board: order appears in "Bill Out" section
    ↓
Cashier chooses:
  "Pay Now" (Cash/Card/GCash) → status=Paid, guest portal shows finished
  "Charge to Room" (select booking) → status=Paid, room_id set, appears on guest folio for checkout
```

### What changes for each role
| Role | Before | After |
|---|---|---|
| Kitchen/Bar | "Serve & Close" auto-pays room orders | "Mark Served" — all orders go to cashier |
| Cashier | Only sees walk-in orders | Sees ALL served orders, decides payment |
| Guest Portal | Room orders auto-closed silently | Shows "Paid" or "On Room Bill" after cashier action |
| Reception | Room charges appeared instantly | Same — just routed through cashier first |

### Files Changed
- `src/components/service/ServiceBoard.tsx` (~5 lines)
- `src/components/service/CashierBoard.tsx` (~4 lines removed)

