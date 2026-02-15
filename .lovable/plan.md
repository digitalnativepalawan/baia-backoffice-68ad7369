

## Fix: Create Separate Orders for Added Items (Don't Confuse the Kitchen)

### Problem
Currently, when staff adds items to a served order, ALL items (old + new) get merged into one order and reset to "New". The kitchen sees the full list again and doesn't know what's new vs already served. This is confusing and inefficient for multi-day guests.

### Solution
Instead of merging into the existing order, create a **brand new order** with only the new items. The original served order stays untouched. This way:
- The kitchen only sees the **new items** to prepare
- The original order keeps its "Served" or "Paid" status
- Both orders share the same `order_type` and `location_detail` so the kitchen knows where to deliver
- If the original order has a `tab_id`, the new order inherits it for consolidated billing

### How It Will Look

```text
Kitchen sees:
  NEW ORDER
  Room Delivery - Room 5
  1x Mango Shake          P150

Instead of:
  NEW ORDER (confusing!)
  Room Delivery - Room 5
  2x Grilled Fish        P1,200   <-- already served!
  1x Mango Shake           P150   <-- this is new
```

### Technical Changes

**File: `src/components/staff/StaffOrdersView.tsx`**

Update `handleSubmitAddItems` to INSERT a new order instead of updating the existing one:

- Create a new order row with only the new items
- Copy `order_type`, `location_detail`, and `tab_id` from the parent order
- Calculate `total` and `service_charge` for the new items only
- Keep the original order status unchanged (stays as "Served")
- Toast message updated to "New items sent to kitchen"

No other files need changes. The `OrderCard` and kitchen view already handle new orders correctly.

