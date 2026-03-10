

## Add Catalog Dropdown to "Add Tour" Form & Complete Status-to-Bill Flow

### Problem
The "Add Tour" form in the guest card (RoomsDashboard) is entirely manual text input. Staff must type tour names, prices, and providers from memory. There's no connection to the existing catalog tables (`tours_config`, `rental_rates`, `transport_rates`) that are already configured in the admin Guest Portal Config. Additionally, once a tour/experience is completed, there's no clear "Completed" button flow that finalizes it for billing visibility.

### Changes

**1. `src/components/admin/RoomsDashboard.tsx`** — Replace manual tour name input with a categorized dropdown
- Fetch `tours_config`, `rental_rates`, `transport_rates` (all where `active = true`)
- Replace the plain text `Tour name *` input with a `<Select>` dropdown grouped by category:
  - **Tours**: from `tours_config` (name + price)
  - **Rentals**: from `rental_rates` (rate_name + price, grouped by item_type)
  - **Transport**: from `transport_rates` (type + destination + price)
  - **Other**: free-text input option for custom entries
- When a catalog item is selected, auto-fill: name, price, provider (if available), duration
- Keep all other fields (date, pax, pickup time, notes) as manual inputs
- Add a "Completed" button on each confirmed tour card (updates `guest_tours.status` to `completed`) — this already exists as `updateTourStatus` but needs a visible button for `confirmed` → `completed` transition

**2. Guest Portal & Billing flow** — Already working
- `GuestPortal.tsx` BillView already queries completed tours and shows them
- `RoomBillingTab.tsx` already shows tours with status badges
- `CheckoutModal.tsx` already checks for incomplete tours
- No changes needed here — the missing piece is only the catalog dropdown and the explicit "Complete" action button

### Files to Edit
1. `src/components/admin/RoomsDashboard.tsx` — Add catalog queries, replace tour name input with categorized Select dropdown, auto-fill price/provider on selection, add "Complete" button on confirmed tours

