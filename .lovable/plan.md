

## Add "Admin" Toggle to Staff Access Manager

### Problem
The StaffAccessManager under the Team tab has toggles for Orders, Menu, Reports, etc. but no toggle to grant a team member full Admin access. Admins like James, Ron GM, and David need a way to designate other employees as admins directly from this screen.

### Changes

#### 1. Add "Admin" permission to `StaffAccessManager.tsx`
- Add `{ key: 'admin', label: 'Admin (Full Access)' }` to the PERMISSIONS list
- Style the Admin toggle distinctly (e.g., highlighted or separated) so it's clear this grants full access
- When the Admin toggle is ON for an employee, visually indicate that all other permissions are implied (dim/disable the individual toggles or show a note)
- The `admin` permission already works in the `employee-auth` edge function -- it checks for `permission = 'admin'` in the `employee_permissions` table

#### 2. Visual behavior
- Admin toggle appears first in the list, separated from the granular permissions
- When Admin is toggled ON: show a note like "Full access to all sections" and grey out individual toggles (since admin overrides them)
- When Admin is toggled OFF: individual toggles become active again

### Files to Update
1. **`src/components/admin/StaffAccessManager.tsx`** -- add admin toggle with distinct styling and override behavior

### No database changes needed
The `employee_permissions` table already supports storing `admin` as a permission value. The edge function already checks for it.

