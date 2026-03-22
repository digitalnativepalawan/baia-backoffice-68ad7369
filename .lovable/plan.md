

## Waitstaff & Cashier — Grouped-by-Unit Display

### What Changes

**WaitstaffBoard.tsx** — Full restructure of the display layer (no backend/payment changes):

1. **Unit Tab Pills (top strip)**: Replace the summary strip with a horizontally scrollable row of unit pills. Each pill shows the unit key (e.g. `COT(3)`, `DLe`), a badge with item count or total, and highlights the active/selected unit. Tapping scrolls to or filters that unit's card. An "All" pill shows everything.

2. **Grouped Cards**: Instead of one card per order, group all orders sharing the same `location_detail` into a single consolidated card. Each grouped card shows:
   - Unit name + guest name (from first order)
   - All line items across all orders in that group, merged into one list
   - Combined total across all grouped orders
   - Status indicators (worst-case status: if any order is New → show New; if all Ready → show Ready)

3. **One "Send to Cashier" button per group**: When tapped, sets `status = 'Served'` on ALL orders in that unit group in one batch update. All orders move to cashier together.

4. **Kanban columns remain** (New / Preparing / Ready) but each column shows grouped cards instead of individual order cards. A group appears in the column matching its worst-case status.

5. **Mobile view**: Same grouping logic, just stacked vertically with the tab pills at top.

**CashierBoard.tsx** — Display-only grouping (payment logic untouched):

1. **Group the order list** by `location_detail` so multiple orders from the same unit appear as one consolidated row showing combined total and item count.
2. **When a grouped row is tapped**, the BillOutPanel shows all items from all orders in that group, with combined subtotal/service charge/total.
3. **On confirm payment**, the existing `handleConfirmPayment` runs for each order in the group (loop), applying the same payment type. Room charge logic stays exactly as-is — it already resolves booking by location_detail.

### Technical Approach

**Grouping utility** (shared logic in both files):
```typescript
// Group orders by location_detail (or order id if no location)
const groupOrdersByUnit = (orders) => {
  const groups = {};
  orders.forEach(order => {
    const key = order.location_detail || order.id;
    if (!groups[key]) groups[key] = { key, orders: [], items: [], total: 0, ... };
    groups[key].orders.push(order);
    // merge items, sum totals
  });
  return Object.values(groups);
};
```

**Waitstaff "Send to Cashier"**: Batch update all order IDs in group:
```typescript
await supabase.from('orders').update({ status: 'Served' })
  .in('id', group.orders.map(o => o.id));
```

**Cashier confirm payment**: Loop through each order in group, running existing settlement logic per order (preserves room_transaction creation per order).

### Files Modified
- `src/components/service/WaitstaffBoard.tsx` — major rewrite of display
- `src/components/service/CashierBoard.tsx` — grouping wrapper around existing order list + payment loop

### What Does NOT Change
- Payment flow, room charge logic, booking resolution
- Order database schema
- ServiceModePage counts
- Any other pages

