
You’re not making a mistake — this is a real logic gap, and I traced it to a few concrete code paths and current data.

## What is actually going wrong

1. **Susan can perform check-in/check-out because “view” mode is not enforced in Rooms**
   - `ManagerPage` correctly passes `readOnly={readOnly('rooms')}` to `RoomsDashboard`.
   - But `RoomsDashboard` currently **does not use `readOnly` at all** for actions, so users with `rooms:view` can still click Check In / Check Out and mutate data.
   - I confirmed Susan currently has `rooms:view` and `housekeeping:view`, so this exactly matches your report.

2. **Checkout appears stuck / room seems still occupied**
   - Checkout currently sets booking `check_out = today`.
   - Active booking logic uses `check_out >= today`, so on the same day the booking still looks active.
   - Result: the room can still look occupied in UI and checkout can be triggered repeatedly.

3. **Repeated checkouts create duplicate housekeeping orders**
   - Every checkout inserts a new `housekeeping_orders` row with `pending_inspection`.
   - Existing data already has multiple open pending orders for the same room (e.g. Double Room #3), which causes “it goes back to pending inspection” behavior.

4. **Stale pending orders keep resurfacing**
   - Views read non-completed housekeeping orders directly, so old pending rows can reappear even after a later order was completed.

## Implementation approach

### A) Enforce view vs edit correctly (so Susan can view but not mutate)

#### 1) Rooms permissions hardening
**Files:**
- `src/components/admin/RoomsDashboard.tsx`
- `src/components/rooms/RoomBillingTab.tsx`
- `src/components/rooms/CheckoutModal.tsx` (if checkout remains accessible here)

**Changes:**
- Use existing `readOnly` prop to gate all mutating actions.
- Hide or disable:
  - Check In / Check Out buttons
  - Billing actions (Add Payment, Adjustment, Checkout)
  - Notes/Tours/Docs create/edit/delete controls
  - Housekeeping action entry points from rooms tab when read-only
- Add handler-level guards (`if (readOnly) return toast.error(...)`) so direct invocation cannot mutate.

#### 2) Schedule/Task edit restrictions in manager area
**Files:**
- `src/components/admin/WeeklyScheduleManager.tsx`
- `src/pages/ManagerPage.tsx`

**Changes:**
- Add `readOnly` (and optionally separate `taskReadOnly`) props to `WeeklyScheduleManager`.
- In read-only mode:
  - Disable Add/Edit/Delete/Duplicate/Copy Week for shifts
  - Disable task status mutation (“Mark Complete”)
- Pass from `ManagerPage`:
  - `readOnly={!canEdit(permissions, 'schedules')}`
  - if split: `taskReadOnly={!canEdit(permissions, 'tasks')}`

This aligns behavior with admin permission selection (Off/View/Edit).

---

### B) Fix checkout lifecycle so rooms truly transition cleanly

#### 1) Correct “active booking” determination in rooms UI
**File:**
- `src/components/admin/RoomsDashboard.tsx`

**Changes:**
- Update `getActiveBooking` / `getUnitGuest` logic to include unit occupancy state:
  - treat booking as active only when unit is operationally occupied (not just date overlap).
- Keep reservation dates intact, but stop showing an already-checked-out stay as currently occupied.

#### 2) Prevent check-in while room is `to_clean`
**File:**
- `src/components/admin/RoomsDashboard.tsx`

**Changes:**
- Only show/allow Check In when unit status is `ready`.
- For `to_clean`, show message “Complete housekeeping before check-in.”

#### 3) Make checkout idempotent
**Files:**
- `src/components/admin/RoomsDashboard.tsx`
- `src/components/rooms/CheckoutModal.tsx`

**Changes:**
- Before inserting housekeeping order, check for existing open order for that unit.
- If one exists, reuse it / show “already pending” instead of creating duplicates.
- Refactor both checkout paths to one shared checkout routine to prevent drift.

---

### C) Stop stale pending inspection from reappearing

#### 1) Surface only latest actionable housekeeping order per room
**Files:**
- `src/components/admin/RoomsDashboard.tsx`
- `src/pages/HousekeeperPage.tsx`

**Changes:**
- Derive `latestOrderByUnit` client-side (newest order per `unit_name`).
- Use only latest order to determine pending/cleaning state.
- Ignore older stale pending rows for operational views.

#### 2) One-time data cleanup for existing duplicates
**Backend data fix (single migration/query run):**
- Mark older open duplicate orders per unit as closed/auto-resolved so existing bad rows no longer pollute workflows.

## Expected behavior after fix

1. **Susan (rooms:view)**
   - Can see room details but cannot check in/out or mutate room workflow.

2. **James (admin/edit)**
   - Checkout transitions room to `to_clean` once.
   - Exactly one active housekeeping order per room.
   - Completing inspection + cleaning transitions room to `ready`.
   - Room no longer bounces back to old `pending_inspection`.

3. **Housekeeping UX**
   - Staff sees only current actionable assignments, not historical stale pending rows.

## Technical sequencing

1. Apply permission gating in Rooms + WeeklyScheduleManager UI/handlers.
2. Implement checkout idempotency + active-booking logic update.
3. Update housekeeping list derivation to latest-per-room.
4. Run one-time cleanup for existing duplicate pending orders.
5. Verify with Susan and James scenarios end-to-end.
