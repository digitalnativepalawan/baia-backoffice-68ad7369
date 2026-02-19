

# Fix: Populate Order Types and Restore Full Ordering Flow

## Problem

The `order_types` table is completely empty. This single missing data issue breaks three flows:

- **Staff** cannot proceed past the Order Type page (no buttons render)
- **Guest** cannot send orders from the cart (the "Send to Kitchen" button requires an order type and location, but there are no options to select)
- **"Send to Kitchen"** is disabled because `needsOrderType` is always `true`

## Solution

### 1. Insert Order Types (Database)

Populate the `order_types` table with the four standard types that the app already references in code (`Room`, `DineIn`, `Beach`, `WalkIn`):

| type_key | label | input_mode | source_table | placeholder | sort_order |
|----------|-------|------------|--------------|-------------|------------|
| Room | Room Delivery | select | units | Select room | 1 |
| DineIn | Dine In | select | resort_tables | Select table | 2 |
| Beach | Beach Delivery | text | (none) | Beach area or spot | 3 |
| WalkIn | Walk-In | text | (none) | Your name | 4 |

- Room and DineIn use `select` mode, pulling options from the `units` and `resort_tables` tables respectively
- Beach and WalkIn use free `text` input

### 2. Verify Supporting Data

Check that `units` and `resort_tables` tables have at least some entries so the Room/DineIn dropdowns have options. If empty, insert sample entries.

### 3. No Code Changes Needed

The existing code in `CartDrawer.tsx`, `OrderType.tsx`, and `MenuPage.tsx` already handles all the logic correctly -- the only problem is the missing data. Once order types are populated:

- Staff will see the 4 order type buttons on `/order-type`
- Guests will see order type selection inside the cart drawer
- "Send to Kitchen" will enable once type and location are selected

## Technical Details

Single SQL migration to insert the 4 order types. Conditionally insert sample units/tables if those tables are empty.

