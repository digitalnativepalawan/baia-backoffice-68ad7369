

## Fix Low Stock Alerts — Smart Consumption-Based Thresholds

### Root Cause

Looking at the database, almost every ingredient has `low_stock_threshold: 200` regardless of unit type or actual consumption rate. A bulk ingredient like Sugar (6000g) with threshold 200 is fine, but Chorizo (40g stock, threshold 200) is permanently flagged LOW even though you might only use 80g per week. The thresholds were set uniformly and don't reflect real usage patterns.

### Solution

Replace the static threshold system with a **consumption-aware** approach that calculates daily burn rate from actual `inventory_logs` data, then shows "days of stock remaining" and auto-suggests thresholds.

### Changes

**1. `src/components/admin/InventoryDashboard.tsx` — Smart alerts + auto-threshold**

- Calculate **average daily consumption** per ingredient from `inventory_logs` (order_deduction entries over last 14 days)
- Show **days of stock remaining** on each ingredient card (e.g., "~12 days left") instead of just raw stock numbers
- Redesign the low stock alert panel:
  - Sort by urgency (fewest days remaining first)
  - Show: ingredient name, current stock, daily burn rate, days remaining
  - Color code: red (<2 days), amber (<5 days), muted (>5 days)
- Add **"Auto-set Thresholds"** button that sets each ingredient's `low_stock_threshold` to `avg_daily_consumption × buffer_days` (default 3 days buffer). This batch-updates all ingredients based on real usage so thresholds are meaningful.
- Show a "Reorder Qty" suggestion = `(buffer_days × daily_rate) - current_stock` when stock is low
- Keep manual threshold override — the auto-calc is a suggestion, not forced

**2. `src/lib/stockCheck.ts` — No changes needed**

The `getMenuItemStockStatus` function already uses `current_stock < low_stock_threshold` correctly. Once thresholds are fixed in the DB, the menu sold-out/low-stock indicators will also become accurate.

### File Summary

```
EDIT: src/components/admin/InventoryDashboard.tsx — consumption-based alerts, days remaining, auto-threshold tool
```

No database changes. The existing `inventory_logs` table already has all the consumption data needed.

