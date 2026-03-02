

## Department Routing, Device Management, and Secure Login System

This is a large feature set with multiple interconnected parts. Here is the phased plan:

---

### Phase 1: Database Changes

**1a. Add `department` column to `menu_items`**
- Add column `department TEXT NOT NULL DEFAULT 'kitchen'` with allowed values: `kitchen`, `bar`, `both`
- Auto-assign existing categories: Cocktails and Breakfast Drinks -> `bar`, everything else -> `kitchen`

**1b. Create `devices` table**
```text
devices
  id              UUID PK
  device_name     TEXT (e.g. "Kitchen Tablet #1")
  device_id       TEXT UNIQUE (browser fingerprint / manual ID)
  department      TEXT ('kitchen' | 'bar' | 'reception' | 'admin')
  is_active       BOOLEAN DEFAULT true
  last_login_at   TIMESTAMPTZ
  last_login_employee_id UUID
  created_at      TIMESTAMPTZ DEFAULT now()
```
- Public RLS (matching existing pattern for this app -- no Supabase Auth used)

**1c. Add `department` column to `menu_categories`**
- Add `department TEXT NOT NULL DEFAULT 'kitchen'` so categories themselves can be tagged

---

### Phase 2: Admin UI -- Department Assignment

**In `AdminPage.tsx` Menu tab:**
- Add a Department dropdown (Kitchen / Bar / Both) to each menu item row in the admin menu editor
- Add a Department dropdown to each category in the categories manager
- Add a new "Devices" section under the Setup tab for registering/managing tablets

**Devices admin section (new component `DeviceManager.tsx`):**
- Table listing all registered devices with name, department, status, last login
- Add/Edit/Delete device entries
- Toggle active/inactive

---

### Phase 3: Department-Specific Order Views

**New pages:**
- `/kitchen` -- Kitchen tablet view showing only orders with kitchen items
- `/bar` -- Bar tablet view showing only orders with bar items

**Order splitting logic:**
- When an order is placed containing both kitchen and bar items, both views see the order but only their relevant items are highlighted
- Each view filters `order.items` (JSONB) by the item's department
- Real-time subscription for instant updates

**New components:**
- `DepartmentOrdersView.tsx` -- Shared component parameterized by department, reuses existing `OrderCard` pattern but filters items

---

### Phase 4: Login Gate for All Pages

**Enhance the existing session system:**
- The app already uses Name + PIN via the `employee-auth` edge function
- Create a `RequireAuth` wrapper component that checks `sessionStorage` for a valid staff session
- If no session, redirect to `/` (home login screen)
- If session exists but employee lacks department access for the current device, show "Unauthorized" message

**Route protection in `App.tsx`:**
- Wrap `/kitchen`, `/bar`, `/order-type`, `/menu` (staff mode), `/admin`, `/employee`, `/manager` routes with `RequireAuth`
- Guest menu (`/menu?mode=guest`) remains public -- view-only, no ordering
- The home page `/` remains public (it IS the login page)

**Session enhancements:**
- Add 30-minute inactivity timeout (reset on any interaction)
- Add device ID tracking to sessions
- Prevent duplicate sessions (one device = one active session)

---

### Phase 5: Order Routing Logic

**When a new order is submitted:**
1. Each item in the order JSONB gets a `department` field added at submission time
2. Kitchen view filters items where `department = 'kitchen'` or `'both'`
3. Bar view filters items where `department = 'bar'` or `'both'`
4. Reception/Admin sees all items

**Status tracking per department:**
- Add `kitchen_status` and `bar_status` fields to orders (or track within the items JSONB)
- Kitchen marks their items ready independently
- Bar marks their items ready independently
- Order overall status = "Ready" only when both departments are done

---

### Technical Details

**Files to create:**
- `src/components/admin/DeviceManager.tsx` -- Device registration admin UI
- `src/components/DepartmentOrdersView.tsx` -- Shared department-filtered order view
- `src/components/RequireAuth.tsx` -- Auth wrapper with session + device + department checks
- `src/pages/KitchenPage.tsx` -- Kitchen tablet page
- `src/pages/BarPage.tsx` -- Bar tablet page

**Files to modify:**
- `src/App.tsx` -- Add new routes, wrap protected routes
- `src/pages/AdminPage.tsx` -- Add department dropdown to menu items, add Devices section to Setup tab
- `src/pages/MenuPage.tsx` -- Include department field when building order items
- `src/pages/Index.tsx` -- Add device detection/registration flow
- `src/lib/cart.ts` -- Add department to CartItem type
- `src/components/staff/StaffOrdersView.tsx` -- Add department filtering capability

**Database migrations:**
1. `ALTER TABLE menu_items ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen'`
2. `UPDATE menu_items SET department = 'bar' WHERE category IN ('Cocktails', 'Breakfast Drinks')`
3. `CREATE TABLE devices (...)` with RLS
4. `ALTER TABLE menu_categories ADD COLUMN department TEXT NOT NULL DEFAULT 'kitchen'`

**Edge function changes:** None needed -- existing `employee-auth` already handles authentication.

---

### Implementation Order

1. Database migrations (department column + devices table)
2. Auto-assign departments to existing menu items
3. Admin UI for department assignment on menu items
4. Device manager admin UI
5. `RequireAuth` component with session/inactivity management
6. Kitchen and Bar page views with department filtering
7. Route protection across all pages
8. Order routing with department-split display

