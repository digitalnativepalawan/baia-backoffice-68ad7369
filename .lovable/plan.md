

## Problem

The "View Menu" button (`mode=guest`) is meant for browsing the menu only, but currently anyone can add items to a cart and submit orders to the kitchen without any authentication. A random person could walk up, view the menu, and place orders that nobody pays for.

## Solution: Make "View Menu" Browse-Only

The simplest and most effective fix is to **hide the cart and ordering functionality** when in plain `guest` mode. The menu becomes a read-only digital menu (like a PDF menu replacement). Only authenticated modes (`staff` and `guest-order`) can place orders.

### Changes

**1. `src/pages/MenuPage.tsx`**
- Hide the floating cart button when `mode === 'guest'`
- Disable the "add to cart" tap on menu items (or show item details without the "Add to Order" button)
- Alternatively: show item detail modal with description and price, but remove the quantity picker and "Add to Order" button
- This keeps the menu browsable and informative without enabling ordering

**2. `src/components/CartDrawer.tsx`**
- No changes needed -- if the cart button is hidden and items can't be added, the drawer is never opened in guest mode

### How It Works After the Change

| Mode | Who | Can Browse | Can Order |
|------|-----|-----------|-----------|
| `guest` (View Menu) | Anyone | Yes | No -- read-only menu |
| `guest-order` | Verified guest (room + name + PIN) | Yes | Yes -- charge to room |
| `staff` | Logged-in staff | Yes | Yes -- full order flow |

### UI Behavior in Guest Mode
- Tapping a menu item still opens the detail modal showing name, description, and price
- The quantity picker and "Add to Order" button are hidden
- The floating cart bar at the bottom is hidden
- No cart icon or badge is shown
- This makes it a clean, browsable digital menu

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/MenuPage.tsx` | Conditionally hide cart button and "Add to Order" in item modal when `mode === 'guest'` |

This is a single-file change -- minimal and clean.

