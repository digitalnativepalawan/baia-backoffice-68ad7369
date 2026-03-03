

## Plan: Receptionist Full Powers + Housekeeper Assignment + Schedule Integration

### Issues Identified

1. **Reception tours/requests lack action buttons** -- The reception page shows tours and guest requests but has no confirm/cancel/complete buttons (unlike the Experiences page).
2. **Payment method dropdown not functional** -- The `AddPaymentModal` works (payment_methods load fine, 200 response with 8 methods). Need to verify the actual issue -- likely the modal isn't passing the right props or the checkout payment select is the problem. Looking at the checkout modal code, `activePM` filters correctly. Will investigate if it's a UI display issue.
3. **Housekeeping cleaning sent without assigning a specific housekeeper** -- Currently `handleSendToClean` creates a housekeeping order without setting `assigned_to`. Admin and receptionist should pick a housekeeper by name.
4. **Schedule should show tours, activities, and cleaning tasks** alongside regular shifts.

### Changes

**1. Add action buttons on Reception tours & guest requests** (`src/pages/ReceptionPage.tsx`)
- Add Confirm/Cancel buttons on pending tour bookings in the reception view (lines 628-644)
- Add Confirm/Cancel buttons on pending guest requests (lines 654-665)
- Add Complete button on confirmed tours
- Wire up mutation functions (reuse same logic from ExperiencesPage)

**2. Fix/verify payment flow** (`src/pages/ReceptionPage.tsx`)
- The `AddPaymentModal` is being passed `currentBalance={0}` (line 918) -- needs to compute actual balance from room transactions
- Check if the "Pay" button triggers properly with correct booking data

**3. Assign housekeeper by name when sending to clean** (`src/pages/ReceptionPage.tsx`, `src/components/admin/RoomsDashboard.tsx`)
- Before creating the housekeeping order, show a small picker dialog to select which housekeeper to assign
- Query `employees` table filtered to housekeeping staff
- Set `assigned_to` field on the `housekeeping_orders` insert
- Apply same pattern in RoomsDashboard's checkout/clean flow

**4. Show tours, activities, and cleaning on the Weekly Schedule** (`src/components/admin/WeeklyScheduleManager.tsx`)
- Query `guest_tours` and `tour_bookings` (confirmed) for the active week
- Query `housekeeping_orders` with `assigned_to` for the active week
- Render these as colored pills on the employee's timeline row (similar to how tasks are shown)
- Tours: teal/blue pill with tour name
- Cleaning: amber pill with room name

### No database changes needed
The `housekeeping_orders.assigned_to` column already exists and references the `employees` table.

