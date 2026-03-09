

## Fix Reception Board Status + Guest Portal Order Sync

### Problem

Two related bugs:

1. **Reception board shows "Ready" when Kitchen/Bar show "Served"**: When both departments mark their items as "ready", the code auto-sets `order.status = 'Served'`. But the reception column-bucketing logic puts `status='Served' + allReady` orders into the **Ready** column, not Served. Kitchen and Bar both show these same orders in their **Served** column. This mismatch is confusing.

2. **Guest portal reflects the wrong state**: Since the overall `order.status` jumps to `'Served'` the moment departments finish (before anyone actually delivers the food), the guest sees "Served" prematurely.

### Root Cause

The flow should be: departments mark ready → reception sees it as "Ready to deliver" → reception marks served → order moves to Served. But the current code **auto-advances** `status` to `'Served'` when both departments are done, skipping the reception step.

### Fix

**`src/components/service/ServiceBoard.tsx` — handleAction**

- `kitchen-ready` and `bar-ready`: When all departments are done, set `status = 'Ready'` instead of `'Served'`. This is a new intermediate status meaning "all food/drinks prepared, waiting for delivery."

- Update the query to also include `'Ready'` in the status filter (`.in('status', ['New', 'Preparing', 'Ready', 'Served', 'Paid'])`).

**`src/components/service/ServiceBoard.tsx` — column bucketing**

- Kitchen/Bar: `status === 'Ready'` orders go to the Ready column (alongside dept-level `ready`).
- Reception: `status === 'Ready'` → Ready column. `status === 'Served'` → Served column. Remove the complex multi-pass logic.

**`src/components/service/ServiceOrderCard.tsx` — action buttons**

- Update the "Mark Served" condition to trigger when `order.status === 'Ready'` (not just checking dept statuses).

**`src/pages/GuestPortal.tsx` — ORDER_STATUS_MAP**

- Add `'Ready': { label: 'Ready', color: 'bg-emerald-500/20 text-emerald-400' }` so guests see a "Ready" badge when food is prepared but not yet delivered.
- Update `DEPT_STATUS_LABELS` and per-item status logic to handle the new status.

### Technical Details

New status flow:
```text
New → Preparing → Ready → Served → Paid
         ↑ dept starts    ↑ all depts done   ↑ reception delivers   ↑ payment
```

### Files Changed

```
EDIT  src/components/service/ServiceBoard.tsx     — query filter, handleAction, column bucketing
EDIT  src/components/service/ServiceOrderCard.tsx  — action button conditions for 'Ready' status
EDIT  src/pages/GuestPortal.tsx                    — ORDER_STATUS_MAP + item status logic
```

No database changes needed — `status` is a text field with no constraints.

