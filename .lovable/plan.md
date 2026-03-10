

## Expand Current Guests Section with Full Guest Folio

### Problem
The "Current Guests" cards in the Reception dashboard have limited functionality:
- **Bill** button only toggles an `InlineBill` showing raw transactions — no orders, tours, or services
- **Pay** button opens payment modal but there's no way to see what's actually owed
- No ability to add orders, comp items, delete charges, or manage tours/services inline
- The full `RoomBillingTab` (with all these features) only lives inside the "Details" sheet → Billing tab, which is buried

Staff must click Details → scroll to Billing tab to do real work. For a reception desk running a resort, this needs to be front and center.

### Solution
Replace the simple `InlineBill` toggle with the full `RoomBillingTab` component when the Bill button is clicked. This instantly gives reception staff access to:
- All F&B orders with status badges (New/Preparing/Ready/Served/Paid)
- Tours, transport, rentals with cancel/delete actions
- Room transactions ledger
- Add Payment, Add Adjustment, Print Bill, Checkout — all inline
- Real-time updates via existing Supabase subscriptions
- Comp/delete individual orders

Additionally, add a quick **"Order"** button to each guest card that navigates directly to the menu with pre-filled room/guest params (same flow as the occupied guest cards on OrderType page).

### Changes

**1. `src/pages/ReceptionPage.tsx`**
- Import `RoomBillingTab` component
- Replace `<InlineBill unitId={unit.id} />` with `<RoomBillingTab unit={unit} booking={booking} guestName={guest?.full_name} />` when `billUnitId === unit.id`
- Add an **"Order"** button next to Pay/Bill/Clean/Details that navigates to `/menu?mode=staff&orderType=Room&location={unitName}&roomName={unitName}&guestName={guestName}`
- Remove the standalone Pay button since `RoomBillingTab` already has Add Payment built in (or keep it as a shortcut — both work)

### Result
Each Current Guest card becomes a self-contained operational hub:
- One tap on **Bill** expands the full folio with orders, tours, services, balance, payments
- One tap on **Order** goes straight to menu for that guest
- Pay, Print Bill, Checkout all accessible without navigating to Details
- Everything syncs in real-time with the Guest Portal

