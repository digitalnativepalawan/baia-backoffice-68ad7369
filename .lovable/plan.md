

## Add "New Order" Button to Kitchen & Bar Service Boards

### What

Add a floating "New Order" button on the Kitchen and Bar service board screens that opens the existing order flow (Order Type → Menu → Cart → Submit) without leaving the service board context. Staff can quickly place a guest order and return to their live board.

### How

**1. `src/components/service/ServiceHeader.tsx` — Add "New Order" button**

- Add a `+ Order` button next to the Exit button in the header
- On click, navigate to `/order-type?mode=staff` — this reuses the existing full order flow (order type selection → menu browsing → cart → submit)
- The staff session persists, so after submitting the order they can navigate back to their board

**2. Alternative: In-board Sheet approach**

Instead of navigating away, open the order flow inside a full-screen Sheet/Drawer directly on the service board. This keeps the live board visible underneath and feels more integrated. However, this would require embedding the OrderType + MenuPage components inside a sheet, which is significant refactoring.

### Recommendation

The simplest and most reliable approach: add a `+ Order` button in the ServiceHeader that navigates to `/order-type?mode=staff&returnTo=/service/{department}`. After order submission in CartDrawer, redirect back to the return URL instead of the default route.

### Changes

**`src/components/service/ServiceHeader.tsx`** — Add "+ Order" button that navigates to the order flow with a `returnTo` param

**`src/components/CartDrawer.tsx`** — After successful order submission, check for `returnTo` search param and navigate there instead of the default behavior

### File Summary

```
EDIT: src/components/service/ServiceHeader.tsx  — add "+ Order" button with returnTo param
EDIT: src/components/CartDrawer.tsx              — honor returnTo param after order submit
```

No database changes needed.

