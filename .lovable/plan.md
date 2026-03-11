

## Fix: Order Flow, Walk-in Visibility, and Room Order Grouping in Cashier

### Problems Identified

1. **ServiceBoard `mark-served` auto-pays room charges and tabs** (lines 194-200 in ServiceBoard.tsx) — bypasses the cashier entirely. Room/tab orders jump straight to "Paid" when kitchen/bar marks them served, so the cashier never sees them.

2. **Walk-in orders not reaching cashier** — related to the flow above; walk-ins work correctly in CashierBoard but may not appear if they're stuck at intermediate statuses.

3. **Room orders listed individually in Bill Out** — each order for the same room shows as a separate card. The user wants them grouped by room for a cleaner view.

### Plan

#### 1. Stop auto-paying on "Mark Served" in ServiceBoard.tsx

**File: `src/components/service/ServiceBoard.tsx`** (lines 194-200)

Change `mark-served` to always set `status = 'Served'` — never auto-jump to `Paid`. Remove the auto-pay logic for room charges and tabs. This ensures ALL orders flow through the cashier for final payment confirmation.

```typescript
// BEFORE:
} else if (action === 'mark-served') {
  updateData.status = 'Served';
  if ((order.payment_type === 'Charge to Room' && order.room_id) || order.tab_id) {
    updateData.status = 'Paid';
    updateData.closed_at = new Date().toISOString();
  }
}

// AFTER:
} else if (action === 'mark-served') {
  updateData.status = 'Served';
}
```

#### 2. Update ServiceBoard bucketing for reception

Since room/tab orders will now stay at "Served" instead of jumping to "Paid", update the reception column logic so `Served` room/tab orders go to "Bill Out" instead of "Completed":

- `Served` (any) → Bill Out
- Only `Paid` → Completed

This aligns reception's view with the cashier flow.

#### 3. Update CashierBoard Bill Out to include all Served orders

**File: `src/components/service/CashierBoard.tsx`**

The current bucketing already puts `Served` and non-auto-payable `Ready` orders into billOut. Since we're removing auto-pay, ALL served orders (including room charges and tabs) will now appear in Bill Out — which is correct.

#### 4. Group room orders by room in Bill Out section

**File: `src/components/service/CashierBoard.tsx`**

Replace the flat list of bill-out orders with grouped rendering:
- Orders with a `room_id` or `payment_type === 'Charge to Room'` are grouped by `location_detail` (room name)
- Each room group shows as a single expandable card: "Room 3 — 2 orders — ₱1,200"
- Tapping the room group expands to show individual orders inside
- Walk-in/dine-in orders remain as individual cards (ungrouped)

```text
Bill Out section layout:
┌─────────────────────────┐
│ 💰 BILL OUT             │
│                         │
│ ┌── Room 3 ──────────┐  │  ← grouped card
│ │ 2 orders  ₱1,200   │  │
│ │  > French Toast     │  │  ← expanded items
│ │  > Mojito           │  │
│ └─────────────────────┘  │
│                         │
│ ┌── Walk-In: Table 2 ─┐ │  ← individual card
│ │ Pancakes    ₱350    │  │
│ └─────────────────────┘  │
└─────────────────────────┘
```

Implementation: Create a `GroupedBillOut` component that:
- Separates billOut orders into `roomGroups` (keyed by `location_detail`) and `ungrouped` (walk-ins)
- Each room group is a `Collapsible` that shows total count and combined amount
- When a specific order inside a group is tapped, it opens the BillOutPanel for that order
- The cashier can pay orders individually or (future) batch-pay a room group

### Files Changed

| File | Change |
|------|--------|
| `src/components/service/ServiceBoard.tsx` | Remove auto-pay from `mark-served`; update reception bucketing |
| `src/components/service/CashierBoard.tsx` | Group room orders in Bill Out by room name |

