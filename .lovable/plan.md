

# Clear Low Stock Alerts -- Set Current Stock to Match Threshold

## Overview

Update all 67 ingredients so their `current_stock` matches their `low_stock_threshold` (200). This eliminates all "Low Stock Alert" warnings since the alert triggers when stock is **at or below** the threshold.

To fully clear alerts, we need to set `current_stock` to **201** (one above threshold), OR set `low_stock_threshold` to 0. The cleaner approach: set `current_stock = 200` and change the alert logic from `<=` to `<` so that equal values don't trigger alerts.

**Actually, simplest fix:** Set all `current_stock` to the same value as `low_stock_threshold` (200) AND fix the comparison in `InventoryDashboard.tsx` from `<=` to `<` so "equal to threshold" is not considered low.

## Changes

### 1. Database Update (data operation)
Run a single SQL update:
```sql
UPDATE ingredients SET current_stock = low_stock_threshold;
```
This sets every ingredient's stock to 200 (or whatever its threshold is).

### 2. Fix Low Stock Logic in InventoryDashboard.tsx
Change the comparison from `<=` to `<` in two places so that stock **equal** to threshold is considered OK:
- Line calculating `lowStockItems`
- Line determining `isLow` in the ingredient card

This way, stock of 200 with threshold of 200 = no alert. Only when stock drops **below** 200 will it trigger.

