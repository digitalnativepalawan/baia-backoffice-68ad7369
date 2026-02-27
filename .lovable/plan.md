
# Scheduled Delivery Time for Room Orders

## Overview

Add an optional "Delivery Time" picker that appears when the order type is "Room". This lets staff/guests schedule orders for later (e.g., take dinner orders at 5pm for 7:30pm delivery, or breakfast selections in the evening for the next morning).

## How It Works

- When "Room" order type is selected in the CartDrawer, a new "Scheduled Delivery" section appears
- User can choose "ASAP" (default, current behavior) or "Schedule for later"
- If scheduling, they pick a date+time using a simple time selector (hour + minute in 15-min increments + AM/PM), plus an optional date toggle for "Tomorrow" (for next-morning breakfast orders)
- The scheduled time is saved to the `orders` table and displayed on the OrderCard in the admin/staff view

## Database Changes

### Alter `orders` table

Add one column:
- `scheduled_for` (timestamptz, nullable, default NULL) -- when NULL or in the past, means "ASAP"

## File Changes

### 1. `src/components/CartDrawer.tsx`

- Add state: `scheduleMode` ('asap' | 'scheduled'), `scheduledDate` (today/tomorrow), `scheduledHour`, `scheduledMinute`, `scheduledPeriod`
- After the order type / location section, when `selectedOrderType === 'Room'`, render a "Delivery Time" section:
  - Two toggle buttons: "ASAP" and "Schedule"
  - When "Schedule" is selected, show:
    - Date toggle: "Today" / "Tomorrow" buttons
    - Time picker: Hour (1-12) select + Minute (00, 15, 30, 45) select + AM/PM select
- When submitting, compute the `scheduled_for` timestamp and include it in the order insert
- Include the scheduled time in the WhatsApp message if set

### 2. `src/components/admin/OrderCard.tsx`

- If `order.scheduled_for` exists and is in the future, show a badge like "Scheduled: 7:30 PM" or "Tomorrow 7:00 AM" near the order header
- Use a Clock icon from lucide-react

### 3. `src/lib/order.ts`

- Update `formatWhatsAppMessage` to accept an optional `scheduledFor` date parameter
- If provided, add a line like "*Scheduled Delivery:* 7:30 PM" or "*Scheduled Delivery:* Tomorrow 7:00 AM"

### 4. `src/components/staff/StaffOrdersView.tsx`

- Display the scheduled time on order cards if present (same badge approach)

## Technical Details

- Migration: `ALTER TABLE orders ADD COLUMN scheduled_for timestamptz DEFAULT NULL;`
- The scheduled_for column stores a full timestamp so it handles both same-day and next-day scheduling
- Time picker uses simple Select dropdowns (matching existing TimePicker pattern) with 15-minute increments for practical scheduling
- "ASAP" is the default -- no behavior change for non-Room orders or when users don't want to schedule
- The feature appears for Room orders only since that's the primary use case for scheduled deliveries
