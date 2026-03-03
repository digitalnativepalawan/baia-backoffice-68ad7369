

## Plan: Embed Housekeeping in Reception + Force-Ready Override

### Problem
Staff with both reception and housekeeping roles must switch between two separate pages. The room status flow (to_clean → ready) currently only completes via the dedicated Housekeeping page. Reception staff with manage-level access cannot override a stuck room to "Ready" in urgent situations.

### Changes

**1. Add Housekeeping Status Section in Reception** (`src/pages/ReceptionPage.tsx`)

Below the "To Clean" rooms section, add a collapsible **Housekeeping Tracker** panel showing:
- All active housekeeping orders (pending, inspecting, cleaning) with assigned housekeeper name and status badge
- For staff with `housekeeping` permission: "Accept" and "Continue" buttons that open the `HousekeepingInspection` component inline (same as /housekeeper page)
- This eliminates the need for multi-role staff to navigate to `/housekeeper`

**2. Add "Force Ready" override for manage-level users** (`src/pages/ReceptionPage.tsx`)

On each `to_clean` room card in the Quick Room Status grid AND in the "To Clean" section:
- Show a "Mark Ready" button visible only to users with `canDoManage` permission
- Clicking it updates `units.status` to `'ready'` and marks the corresponding housekeeping order as `completed` with a note "Force-marked ready by [staff name]"
- Log this action to audit_log for accountability

**3. Remove Housekeeping tile from Index for multi-role staff** (`src/pages/Index.tsx`)

No change needed here -- the tile already shows independently. Staff can still use it. But with housekeeping embedded in Reception, multi-role staff won't need to navigate away.

### Technical Details

- Reuse `HousekeepingInspection` component (already standalone) when a receptionist clicks "Continue" on an order they accepted
- The `PasswordConfirmModal` already handles PIN-based acceptance
- Force-ready will require `canManage(perms, 'reception')` check
- No database changes needed

